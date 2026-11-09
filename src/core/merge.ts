import { findBestMatch } from './matcher';
import {
  IGNORE,
  MAX_COLLISION_SAMPLES,
  SOURCE_COLUMN,
  type Collision,
  type LoadedTable,
  type MapMode,
  type MappingEntry,
  type MappingOverride,
  type MergeResult,
} from './types';

export interface MergeInput {
  /** Arquivo modelo (define colunas de destino). */
  model: LoadedTable | null;
  includeModelRows: boolean;
  files: readonly LoadedTable[];
  mode: MapMode;
  /** Overrides manuais: fileId -> (índice da coluna de origem -> destino | IGNORE). */
  overrides: ReadonlyMap<string, ReadonlyMap<number, MappingOverride>>;
}

/** Resolve de-para de colunas e consolida as linhas. Função pura; nunca descarta dado em silêncio. */
export function mergeTables(input: MergeInput): MergeResult {
  const targets: string[] = input.model ? [...input.model.table.columns] : [];
  const mappings: Record<string, MappingEntry[]> = {};
  const duplicateTargets: MergeResult['duplicateTargets'] = [];

  // 1) Resolução de colunas ------------------------------------------------
  for (const file of input.files) {
    const entries: MappingEntry[] = [];
    const overrides = input.overrides.get(file.id);
    const modelColumns = input.model?.table.columns ?? [];

    file.table.columns.forEach((source, sourceIndex) => {
      const manual = overrides?.get(sourceIndex);
      if (manual === IGNORE) {
        entries.push({ sourceIndex, source, target: null, kind: 'ignored' });
        return;
      }
      if (typeof manual === 'string' && manual !== '') {
        if (!targets.includes(manual)) targets.push(manual);
        entries.push({ sourceIndex, source, target: manual, kind: 'manual' });
        return;
      }
      if (input.mode === 'position' && sourceIndex < modelColumns.length) {
        const target = modelColumns[sourceIndex] as string;
        entries.push({ sourceIndex, source, target, kind: 'position' });
        return;
      }
      const match = findBestMatch(source, targets);
      if (match) {
        entries.push({ sourceIndex, source, target: match.target, kind: match.how });
        return;
      }
      // Coluna sem par: preservada como coluna nova (nada é descartado).
      targets.push(source);
      entries.push({ sourceIndex, source, target: source, kind: 'new' });
    });

    mappings[file.id] = entries;

    // Dois campos de origem do mesmo arquivo para o mesmo destino
    const byTarget = new Map<string, string[]>();
    for (const e of entries) {
      if (e.target === null) continue;
      const list = byTarget.get(e.target) ?? [];
      list.push(e.source);
      byTarget.set(e.target, list);
    }
    for (const [target, sources] of byTarget) {
      if (sources.length > 1) duplicateTargets.push({ file: file.name, target, sources });
    }
  }

  // A coluna de rastreabilidade nunca colide com uma coluna de dados.
  let sourceColumn = SOURCE_COLUMN;
  while (targets.some((t) => t.toLowerCase() === sourceColumn.toLowerCase())) sourceColumn += '_';
  const columns = [...targets, sourceColumn];
  const index = new Map(columns.map((c, i) => [c, i] as const));
  const width = columns.length;
  const sourceIdx = width - 1;

  // 2) Consolidação das linhas ----------------------------------------------
  const rows: string[][] = [];
  const collisions: Collision[] = [];
  let collisionCount = 0;

  if (input.model && input.includeModelRows) {
    for (const r of input.model.table.rows) {
      const out = new Array<string>(width).fill('');
      input.model.table.columns.forEach((c, i) => {
        const t = index.get(c);
        if (t !== undefined) out[t] = r[i] ?? '';
      });
      out[sourceIdx] = input.model.name;
      rows.push(out);
    }
  }

  for (const file of input.files) {
    const entries = mappings[file.id] ?? [];
    const plan = entries
      .filter((e) => e.target !== null)
      .map((e) => ({ from: e.sourceIndex, to: index.get(e.target as string) as number, column: e.target as string }));

    file.table.rows.forEach((r, rowNumber) => {
      const out = new Array<string>(width).fill('');
      out[sourceIdx] = file.name;
      for (const step of plan) {
        const value = r[step.from] ?? '';
        if (value === '') continue;
        const current = out[step.to] as string;
        if (current === '') {
          out[step.to] = value;
        } else if (current !== value) {
          // Valores diferentes no mesmo destino: mantém o primeiro e registra o descartado.
          collisionCount++;
          if (collisions.length < MAX_COLLISION_SAMPLES) {
            collisions.push({ file: file.name, row: rowNumber + 1, column: step.column, kept: current, discarded: value });
          }
        }
      }
      rows.push(out);
    });
  }

  return { columns, rows, sourceColumn, mappings, collisionCount, collisions, duplicateTargets };
}
