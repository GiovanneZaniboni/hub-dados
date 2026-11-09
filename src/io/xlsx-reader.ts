import { strFromU8, unzipSync } from 'fflate';
import { HubError, LimitError, type Limits } from '../core/limits';
import { cleanCell, dedupeHeaders } from '../core/text';
import type { Table } from '../core/types';

const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** XML de planilhas nunca precisa de DTD/entidades; recusar elimina XXE e "billion laughs". */
function parseXml(bytes: Uint8Array, what: string): Document {
  const text = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new HubError(`Arquivo .xlsx inválido (${what} contém DTD).`);
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new HubError(`Arquivo .xlsx inválido (${what}).`);
  return doc;
}

const byTag = (root: Document | Element, name: string): Element[] => Array.from(root.getElementsByTagName(name));

/** Texto de <si>/<is>: junta <t> de runs ricos, ignorando fonética (<rPh>). */
function richText(el: Element): string {
  let out = '';
  const walk = (node: Element): void => {
    for (const child of Array.from(node.children)) {
      if (child.localName === 't') out += child.textContent ?? '';
      else if (child.localName !== 'rPh') walk(child);
    }
  };
  walk(el);
  return out;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormat(code: string): boolean {
  const stripped = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[ymdhs]/i.test(stripped);
}

function readDateStyles(doc: Document | null): Set<number> {
  const dateXf = new Set<number>();
  if (!doc) return dateXf;
  const custom = new Map<number, string>();
  for (const f of byTag(doc, 'numFmt')) {
    const id = Number(f.getAttribute('numFmtId'));
    if (Number.isInteger(id)) custom.set(id, f.getAttribute('formatCode') ?? '');
  }
  const cellXfs = byTag(doc, 'cellXfs')[0];
  if (!cellXfs) return dateXf;
  Array.from(cellXfs.children).forEach((xf, i) => {
    const id = Number(xf.getAttribute('numFmtId'));
    if (BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormat(custom.get(id) ?? ''))) dateXf.add(i);
  });
  return dateXf;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Número de série do Excel -> texto ISO (data, ou data e hora quando houver hora). */
export function serialToIso(serial: number, date1904: boolean): string {
  if (!Number.isFinite(serial) || serial < 0 || serial > 2_958_465) return String(serial);
  const epoch = Date.UTC(1899, 11, 30) + (date1904 ? 1462 * 86_400_000 : 0);
  const ms = Math.round(serial * 86_400_000 / 60_000) * 60_000; // arredonda ao minuto
  const d = new Date(epoch + ms);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (serial < 1) return time;
  return time === '00:00' ? date : `${date} ${time}`;
}

export function numberToText(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? String(Number(n.toPrecision(15))) : raw;
}

/** "BC12" -> índice de coluna 54 (base 0). */
export function columnIndex(ref: string): number {
  const m = /^([A-Z]+)/i.exec(ref);
  if (!m) return -1;
  let n = 0;
  for (const ch of (m[1] as string).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

interface SheetInfo {
  name: string;
  path: string;
  weight: number;
}

export function readXlsx(bytes: Uint8Array, limits: Limits): Table {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new HubError('O arquivo não é um .xlsx válido.');
  }

  // Passo 1: valida o zip sem descompactar nada (zip bomb / entradas demais).
  let declared = 0;
  let entries = 0;
  const names: string[] = [];
  try {
    unzipSync(bytes, {
      filter(f) {
        entries++;
        declared += f.originalSize;
        if (entries > limits.maxXlsxEntries) throw new LimitError('O .xlsx contém entradas demais.');
        if (declared > limits.maxXlsxUncompressedBytes) throw new LimitError('O .xlsx descompactado é grande demais.');
        names.push(f.name);
        return false;
      },
    });
  } catch (e) {
    if (e instanceof HubError) throw e;
    throw new HubError('Não foi possível abrir o .xlsx (arquivo corrompido?).');
  }

  const need = new Set(['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml']);
  const sheetPaths = names.filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  if (!names.includes('xl/workbook.xml') || sheetPaths.length === 0) throw new HubError('O .xlsx não contém planilhas.');
  sheetPaths.forEach((p) => need.add(p));

  // Passo 2: descompacta só o necessário.
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => need.has(f.name) });
  } catch {
    throw new HubError('Não foi possível abrir o .xlsx (arquivo corrompido?).');
  }

  const workbook = parseXml(files['xl/workbook.xml'] as Uint8Array, 'workbook');
  const rels = files['xl/_rels/workbook.xml.rels'] ? parseXml(files['xl/_rels/workbook.xml.rels'], 'relações') : null;
  const date1904 = byTag(workbook, 'workbookPr')[0]?.getAttribute('date1904') === '1';

  const target = new Map<string, string>();
  if (rels) {
    for (const r of byTag(rels, 'Relationship')) {
      const id = r.getAttribute('Id');
      const t = r.getAttribute('Target');
      if (id && t) target.set(id, t.startsWith('/') ? t.slice(1) : `xl/${t}`);
    }
  }

  const sheets: SheetInfo[] = [];
  for (const s of byTag(workbook, 'sheet')) {
    const rid = s.getAttributeNS(NS_REL, 'id') ?? s.getAttribute('r:id') ?? '';
    const path = target.get(rid);
    if (path && files[path]) {
      sheets.push({ name: s.getAttribute('name') ?? 'Planilha', path, weight: (files[path] as Uint8Array).length });
    }
  }
  if (sheets.length === 0) throw new HubError('O .xlsx não contém planilhas legíveis.');

  // Aba escolhida: a de maior tamanho (mais dados).
  const chosen = sheets.reduce((a, b) => (b.weight > a.weight ? b : a));

  const shared: string[] = [];
  if (files['xl/sharedStrings.xml']) {
    for (const si of byTag(parseXml(files['xl/sharedStrings.xml'], 'textos'), 'si')) {
      shared.push(richText(si));
      if (shared.length > limits.maxRowsPerFile * limits.maxColumns) throw new LimitError('Textos compartilhados demais.');
    }
  }
  const dateStyles = readDateStyles(files['xl/styles.xml'] ? parseXml(files['xl/styles.xml'], 'estilos') : null);

  const sheetDoc = parseXml(files[chosen.path] as Uint8Array, 'planilha');
  const grid: string[][] = [];
  let maxCol = 0;
  let seq = 0;

  for (const rowEl of byTag(sheetDoc, 'row')) {
    seq++;
    const rowNo = Number(rowEl.getAttribute('r')) || seq;
    if (rowNo > limits.maxRowsPerFile + 26) throw new LimitError(`O arquivo excede o limite de ${limits.maxRowsPerFile} linhas.`);
    const cells: string[] = [];

    for (const c of Array.from(rowEl.children)) {
      if (c.localName !== 'c') continue;
      const ref = c.getAttribute('r');
      const col = ref ? columnIndex(ref) : cells.length;
      if (col < 0 || col >= limits.maxColumns) {
        if (col >= limits.maxColumns) throw new LimitError(`O arquivo excede o limite de ${limits.maxColumns} colunas.`);
        continue;
      }
      const type = c.getAttribute('t') ?? 'n';
      const vEl = Array.from(c.children).find((x) => x.localName === 'v');
      const v = vEl?.textContent ?? '';
      let text = '';
      if (type === 's') text = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') {
        const is = Array.from(c.children).find((x) => x.localName === 'is');
        text = is ? richText(is) : '';
      } else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'str' || type === 'e' || type === 'd') text = v;
      else if (v !== '') {
        const style = Number(c.getAttribute('s') ?? '0');
        text = dateStyles.has(style) ? serialToIso(Number(v), date1904) : numberToText(v);
      }
      cells[col] = cleanCell(text, limits);
      if (col + 1 > maxCol) maxCol = col + 1;
    }
    grid[rowNo - 1] = Array.from(cells, (x) => x ?? '');
  }

  // Cabeçalho = linha com mais células preenchidas nas primeiras 25 linhas.
  let headerAt = -1;
  let best = 0;
  for (let i = 0; i < Math.min(grid.length, 25); i++) {
    const count = (grid[i] ?? []).filter((x) => x !== '').length;
    if (count > best) {
      best = count;
      headerAt = i;
    }
  }
  if (headerAt === -1) throw new HubError('A planilha está vazia.');

  const columns = dedupeHeaders(
    Array.from({ length: maxCol }, (_, i) => (grid[headerAt] ?? [])[i] ?? ''),
    limits.maxHeaderChars,
  );
  const rows: string[][] = [];
  for (let i = headerAt + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r) continue;
    const out = Array.from({ length: maxCol }, (_, j) => r[j] ?? '');
    if (out.some((x) => x !== '')) rows.push(out);
    if (rows.length > limits.maxRowsPerFile) throw new LimitError(`O arquivo excede o limite de ${limits.maxRowsPerFile} linhas.`);
  }

  const warnings: string[] = [];
  if (sheets.length > 1) warnings.push(`O arquivo tem ${sheets.length} abas; foi usada a maior ("${chosen.name}").`);
  return { columns, rows, warnings, sheetName: chosen.name };
}
