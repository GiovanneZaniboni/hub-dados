import type { Grid } from '../core/pipeline';

const NUMBER_LIKE = /^[+-]?\d+([.,]\d+)?$/;

/**
 * Neutraliza injeção de fórmula (CSV/DDE) no Excel e no LibreOffice: textos que começam com
 * = + - @ TAB CR ganham um apóstrofo, exceto números legítimos como "-5".
 */
export function csvSafeCell(value: string): string {
  if (value !== '' && '=+-@\t\r'.includes(value.charAt(0)) && !NUMBER_LIKE.test(value)) return `'${value}`;
  return value;
}

const quote = (s: string): string => `"${s.replace(/"/g, '""')}"`;

/** CSV com BOM UTF-8, delimitador ';' e todos os campos entre aspas. */
export function buildCsv(grid: Grid): string {
  const lines = [grid.columns.map((c) => quote(csvSafeCell(c))).join(';')];
  for (const r of grid.rows) lines.push(grid.columns.map((_, i) => quote(csvSafeCell(r[i] ?? ''))).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** JSON como lista de objetos. Usa Object.create(null) para nunca tocar em protótipos. */
export function buildJson(grid: Grid): string {
  const data = grid.rows.map((r) => {
    const o: Record<string, string> = Object.create(null) as Record<string, string>;
    grid.columns.forEach((c, i) => {
      o[c] = r[i] ?? '';
    });
    return o;
  });
  return JSON.stringify(data, null, 2);
}

export const sqlIdent = (name: string): string => `"${name.replace(/\0/g, '').replace(/"/g, '""')}"`;
export const sqlString = (value: string): string => `'${value.replace(/\0/g, '').replace(/'/g, "''")}'`;

/** Script SQL no dialeto SQLite; INSERTs em lotes. Todas as colunas TEXT (preserva zeros à esquerda). */
export function buildSql(grid: Grid, table = 'dados_unificados', batchSize = 500): string {
  const lower = new Set(grid.columns.map((c) => c.toLowerCase()));
  let pk = 'id';
  while (lower.has(pk)) pk = `_${pk}`;

  const out = [
    '-- Hub de Dados: script compatível com SQLite',
    `CREATE TABLE IF NOT EXISTS ${sqlIdent(table)} (`,
    `  ${sqlIdent(pk)} INTEGER PRIMARY KEY AUTOINCREMENT${grid.columns.length ? ',' : ''}`,
    ...grid.columns.map((c, i) => `  ${sqlIdent(c)} TEXT${i < grid.columns.length - 1 ? ',' : ''}`),
    ');',
    '',
  ];

  const cols = grid.columns.map(sqlIdent).join(', ');
  for (let i = 0; i < grid.rows.length; i += batchSize) {
    const tuples = grid.rows
      .slice(i, i + batchSize)
      .map((r) => `(${grid.columns.map((_, j) => sqlString(r[j] ?? '')).join(', ')})`);
    out.push(`INSERT INTO ${sqlIdent(table)} (${cols}) VALUES\n${tuples.join(',\n')};`);
  }
  return `${out.join('\n')}\n`;
}
