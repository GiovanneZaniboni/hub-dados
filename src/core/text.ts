import { LimitError, type Limits } from './limits';

/** Normaliza para comparar cabeçalhos: minúsculas, sem acentos, só [a-z0-9]. */
export function normalizeKey(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// C0 (exceto TAB, LF, CR), DEL, C1, separadores de linha Unicode e não-caracteres.
// Montada por string para manter o arquivo-fonte livre de caracteres invisíveis.
const UNSAFE_CHARS = new RegExp(
  '[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029\uFFFE\uFFFF]',
  'g',
);

/** Remove caracteres de controle e espaços nas pontas. Falha se a célula exceder o limite. */
export function cleanCell(value: string, limits: Pick<Limits, 'maxCellChars'>): string {
  const cleaned = value.replace(UNSAFE_CHARS, '').trim();
  if (cleaned.length > limits.maxCellChars) {
    throw new LimitError(`Uma célula excede o limite de ${limits.maxCellChars} caracteres.`);
  }
  return cleaned;
}

/**
 * Gera nomes de coluna únicos e não vazios.
 * "" -> "Coluna_N"; duplicados -> "Nome (2)", "Nome (3)"...
 */
export function dedupeHeaders(raw: readonly string[], maxChars: number): string[] {
  const used = new Set<string>();
  return raw.map((h, i) => {
    let base = h.replace(UNSAFE_CHARS, '').trim().slice(0, maxChars);
    if (base === '') base = `Coluna_${i + 1}`;
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${base} (${n++})`;
    used.add(name.toLowerCase());
    return name;
  });
}

const PLAIN_NUMBER = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/;

/** Número "puro": sem zeros à esquerda, até 15 dígitos inteiros, ponto decimal. */
export function isPlainNumber(value: string): boolean {
  return PLAIN_NUMBER.test(value);
}

/** Verdadeiro se todas as células não vazias da coluna são números puros. */
export function isNumericColumn(rows: readonly string[][], index: number): boolean {
  let seen = false;
  for (const row of rows) {
    const v = row[index] ?? '';
    if (v === '') continue;
    if (!isPlainNumber(v)) return false;
    seen = true;
  }
  return seen;
}
