import { zipSync, strToU8 } from 'fflate';
import type { Grid } from '../core/pipeline';
import { LimitError } from '../core/limits';
import { isNumericColumn } from '../core/text';

const MAX_XLSX_ROWS = 1_048_576;
const MAX_XLSX_COLS = 16_384;

// Caracteres inválidos em XML 1.0.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function xmlEscape(value: string): string {
  return value
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "A", "B", ..., "Z", "AA"... (índice base 0). */
export function columnLetters(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function safeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31);
  return cleaned || 'Dados';
}

/**
 * Gera um .xlsx mínimo sem fórmulas: textos são sempre `inlineStr` (nunca interpretados como
 * fórmula) e colunas 100% numéricas viram números reais.
 */
export function buildXlsx(grid: Grid, sheetName = 'Dados Unificados'): Uint8Array {
  if (grid.rows.length + 1 > MAX_XLSX_ROWS) {
    throw new LimitError('Há linhas demais para um arquivo .xlsx (máximo de 1.048.575). Exporte em CSV.');
  }
  if (grid.columns.length > MAX_XLSX_COLS) {
    throw new LimitError('Há colunas demais para um arquivo .xlsx.');
  }

  const numeric = grid.columns.map((_, i) => isNumericColumn(grid.rows, i));
  const widths = grid.columns.map((c, i) => {
    let max = c.length;
    for (const r of grid.rows.slice(0, 100)) max = Math.max(max, (r[i] ?? '').length);
    return Math.min(50, Math.max(12, max + 3));
  });

  const text = (ref: string, v: string, style = ''): string =>
    `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`;

  const rowsXml: string[] = [];
  rowsXml.push(
    `<row r="1">${grid.columns.map((c, i) => text(`${columnLetters(i)}1`, c, ' s="1"')).join('')}</row>`,
  );
  grid.rows.forEach((r, ri) => {
    const rowNo = ri + 2;
    const cells: string[] = [];
    for (let i = 0; i < grid.columns.length; i++) {
      const v = r[i] ?? '';
      if (v === '') continue;
      const ref = `${columnLetters(i)}${rowNo}`;
      cells.push(numeric[i] ? `<c r="${ref}"><v>${v}</v></c>` : text(ref, v));
    }
    rowsXml.push(`<row r="${rowNo}">${cells.join('')}</row>`);
  });

  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<cols>${cols}</cols><sheetData>${rowsXml.join('')}</sheetData></worksheet>`;

  const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `${header}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${xmlEscape(safeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${header}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(
      `${header}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '</styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  };

  return zipSync(files, { level: 6 });
}
