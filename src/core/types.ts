/**
 * Modelo de dados do Hub.
 *
 * Linhas são ARRAYS indexados por coluna (nunca objetos com chave = nome da coluna):
 * assim cabeçalhos como "__proto__" ou "constructor" não podem causar prototype pollution
 * e cabeçalhos duplicados não se sobrescrevem.
 */

export interface Table {
  /** Nomes únicos e não vazios (garantido por dedupeHeaders). */
  columns: string[];
  rows: string[][];
  /** Avisos não fatais gerados na leitura (ex.: colunas extras, aba escolhida). */
  warnings: string[];
  /** Nome da aba (somente .xlsx). */
  sheetName?: string;
}

export interface LoadedTable {
  id: string;
  name: string;
  bytes: number;
  table: Table;
}

export type MapMode = 'smart' | 'position';

/** Valor de override que significa "não importar esta coluna". */
export const IGNORE = Symbol.for('hub-dados.ignore');
export type MappingOverride = string | typeof IGNORE;

export type MatchKind = 'exact' | 'synonym' | 'position' | 'manual' | 'new' | 'ignored';

export interface MappingEntry {
  sourceIndex: number;
  source: string;
  /** Coluna de destino, ou null quando ignorada. */
  target: string | null;
  kind: MatchKind;
}

export interface Collision {
  file: string;
  /** Linha de dados (1 = primeira linha após o cabeçalho). */
  row: number;
  column: string;
  kept: string;
  discarded: string;
}

export interface MergeResult {
  columns: string[];
  rows: string[][];
  /** Nome da coluna de rastreabilidade (nunca colide com colunas de dados). */
  sourceColumn: string;
  mappings: Record<string, MappingEntry[]>;
  collisionCount: number;
  /** Amostra limitada (ver MAX_COLLISION_SAMPLES). */
  collisions: Collision[];
  /** Colunas de origem de um mesmo arquivo que apontam para o mesmo destino. */
  duplicateTargets: { file: string; target: string; sources: string[] }[];
}

export interface StructureEdit {
  /** Ordem personalizada (nomes). Colunas fora da lista vão para o fim. */
  order: string[] | null;
  deleted: string[];
  /** Colunas criadas manualmente (vazias). */
  added: string[];
}

export interface FixRules {
  /** Texto para preencher células vazias (null = desligado). Colunas numéricas são preservadas. */
  fillEmpty: string | null;
  removeBlankRows: boolean;
  removeDuplicateRows: boolean;
}

export interface Diagnostics {
  rows: number;
  columns: number;
  emptyCells: number;
  rowsWithEmpty: number;
  emptyByColumn: number[];
  duplicateRows: number;
  blankRows: number;
}

export const SOURCE_COLUMN = 'Arquivo_Origem';
export const MAX_COLLISION_SAMPLES = 50;
