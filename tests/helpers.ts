import { strToU8, zipSync } from 'fflate';
import { DEFAULT_LIMITS, type Limits } from '../src/core/limits';
import type { LoadedTable, Table } from '../src/core/types';

export const LIMITS: Limits = { ...DEFAULT_LIMITS };

export const table = (columns: string[], rows: string[][], warnings: string[] = []): Table => ({ columns, rows, warnings });

let seq = 0;
export const loaded = (name: string, columns: string[], rows: string[][]): LoadedTable => ({
  id: `id-${++seq}`,
  name,
  bytes: 100,
  table: table(columns, rows),
});

export const bytes = (text: string): Uint8Array => strToU8(text);

const HEAD = '<?xml version="1.0" encoding="UTF-8"?>';

/** Monta um .xlsx à mão (com sharedStrings e estilos), para testar o leitor de forma independente do escritor. */
export function handmadeXlsx(opts: { sheetXml: string; shared?: string[]; stylesXml?: string; extra?: Record<string, string> }): Uint8Array {
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(
      `${HEAD}<workbook ${ns} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(`${HEAD}<worksheet ${ns}><sheetData>${opts.sheetXml}</sheetData></worksheet>`),
  };
  if (opts.shared) {
    files['xl/sharedStrings.xml'] = strToU8(
      `${HEAD}<sst ${ns}>${opts.shared.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`,
    );
  }
  if (opts.stylesXml) files['xl/styles.xml'] = strToU8(opts.stylesXml);
  for (const [k, v] of Object.entries(opts.extra ?? {})) files[k] = strToU8(v);
  return zipSync(files);
}
