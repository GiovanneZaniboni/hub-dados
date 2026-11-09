import { isNumericColumn } from './text';
import type { Diagnostics, FixRules, StructureEdit } from './types';

export interface Grid {
  columns: string[];
  rows: string[][];
  /** Nome da coluna de rastreabilidade (arquivo de origem), ou null se foi removida. */
  sourceColumn: string | null;
}

export const NO_STRUCTURE: Readonly<StructureEdit> = Object.freeze({ order: null, deleted: [], added: [] });
export const NO_FIXES: Readonly<FixRules> = Object.freeze({
  fillEmpty: null,
  removeBlankRows: false,
  removeDuplicateRows: false,
});

/** Aplica ordem, remoções e colunas adicionadas pelo usuário. Não altera a entrada. */
export function applyStructure(grid: Grid, edit: StructureEdit): Grid {
  const deleted = new Set(edit.deleted);
  const known = new Set(grid.columns);
  const all = [...grid.columns, ...edit.added.filter((c) => !known.has(c))].filter((c) => !deleted.has(c));

  let columns = all;
  if (edit.order) {
    const inOrder = edit.order.filter((c) => all.includes(c));
    const seen = new Set(inOrder);
    columns = [...inOrder, ...all.filter((c) => !seen.has(c))];
  }

  const sourceIndex = new Map(grid.columns.map((c, i) => [c, i] as const));
  const picks = columns.map((c) => sourceIndex.get(c));
  const rows = grid.rows.map((r) => picks.map((i) => (i === undefined ? '' : (r[i] ?? ''))));
  const sourceColumn = grid.sourceColumn !== null && columns.includes(grid.sourceColumn) ? grid.sourceColumn : null;
  return { columns, rows, sourceColumn };
}

function isBlank(row: readonly string[], skip: number): boolean {
  return row.every((v, i) => v === '' || i === skip);
}

function rowKey(row: readonly string[], skip: number): string {
  return row.filter((_, i) => i !== skip).join('\u0001');
}

function sourceColumnIndex(grid: Grid): number {
  return grid.sourceColumn === null ? -1 : grid.columns.indexOf(grid.sourceColumn);
}

/** Regras de higienização, sempre na mesma ordem: vazias -> duplicadas -> preencher. */
export function applyFixes(grid: Grid, rules: FixRules): Grid {
  let rows = grid.rows;

  if (rules.removeBlankRows) rows = rows.filter((r) => !isBlank(r, sourceColumnIndex(grid)));

  if (rules.removeDuplicateRows) {
    const skip = sourceColumnIndex(grid);
    const seen = new Set<string>();
    rows = rows.filter((r) => {
      const k = rowKey(r, skip);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  if (rules.fillEmpty !== null) {
    const fill = rules.fillEmpty;
    const skip = sourceColumnIndex(grid);
    // Colunas numéricas ficam de fora: preencher com texto corromperia somas e ordenação.
    const fillable = grid.columns.map((_, i) => i !== skip && !isNumericColumn(rows, i));
    rows = rows.map((r) => r.map((v, i) => (v === '' && fillable[i] ? fill : v)));
  }

  return { columns: grid.columns, rows, sourceColumn: grid.sourceColumn };
}

export function diagnose(grid: Grid): Diagnostics {
  const skip = sourceColumnIndex(grid);
  const emptyByColumn = new Array<number>(grid.columns.length).fill(0);
  let emptyCells = 0;
  let rowsWithEmpty = 0;
  let blankRows = 0;
  const seen = new Set<string>();
  let duplicateRows = 0;

  for (const r of grid.rows) {
    let rowHasEmpty = false;
    for (let i = 0; i < grid.columns.length; i++) {
      if (i === skip) continue;
      if ((r[i] ?? '') === '') {
        emptyCells++;
        emptyByColumn[i] = (emptyByColumn[i] ?? 0) + 1;
        rowHasEmpty = true;
      }
    }
    if (rowHasEmpty) rowsWithEmpty++;
    if (isBlank(r, skip)) blankRows++;
    const k = rowKey(r, skip);
    if (seen.has(k)) duplicateRows++;
    else seen.add(k);
  }

  return {
    rows: grid.rows.length,
    columns: grid.columns.length,
    emptyCells,
    rowsWithEmpty,
    emptyByColumn,
    duplicateRows,
    blankRows,
  };
}
