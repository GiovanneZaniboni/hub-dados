import { HubError, LimitError, mergeLimits, type Limits } from '../core/limits';
import { mergeTables } from '../core/merge';
import {
  NO_FIXES,
  NO_STRUCTURE,
  applyFixes,
  applyStructure,
  diagnose,
  type Grid,
} from '../core/pipeline';
import type {
  Diagnostics,
  FixRules,
  LoadedTable,
  MapMode,
  MappingOverride,
  MergeResult,
  StructureEdit,
  Table,
} from '../core/types';

/** Estado do Hub. Existe apenas em memória: nada é gravado em disco, cookie ou storage. */
export interface HubState {
  model: LoadedTable | null;
  includeModelRows: boolean;
  files: LoadedTable[];
  mode: MapMode;
  overrides: Map<string, Map<number, MappingOverride>>;
  structure: StructureEdit;
  fixes: FixRules;
}

export interface Computed {
  merge: MergeResult;
  grid: Grid;
  diagnostics: Diagnostics;
}

export interface HubStore {
  readonly limits: Limits;
  getState(): Readonly<HubState>;
  getComputed(): Computed | null;
  subscribe(listener: () => void): () => void;
  setModel(name: string, bytes: number, table: Table): void;
  removeModel(): void;
  setIncludeModelRows(value: boolean): void;
  addFile(name: string, bytes: number, table: Table): string;
  removeFile(id: string): void;
  setMode(mode: MapMode): void;
  setOverride(fileId: string, sourceIndex: number, value: MappingOverride | undefined): void;
  setStructure(edit: StructureEdit): void;
  setFixes(rules: FixRules): void;
  /** Apaga todos os dados e configurações da sessão. */
  clearAll(): void;
}

function initialState(): HubState {
  return {
    model: null,
    includeModelRows: false,
    files: [],
    mode: 'smart',
    overrides: new Map(),
    structure: { ...NO_STRUCTURE, deleted: [], added: [] },
    fixes: { ...NO_FIXES },
  };
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function createStore(limitOverrides?: Partial<Limits>): HubStore {
  const limits = mergeLimits(limitOverrides);
  let state = initialState();
  let cache: Computed | null | undefined;
  const listeners = new Set<() => void>();

  const totalRows = (): number =>
    state.files.reduce((n, f) => n + f.table.rows.length, 0) +
    (state.model && state.includeModelRows ? state.model.table.rows.length : 0);

  const emit = (): void => {
    cache = undefined;
    listeners.forEach((l) => l());
  };

  const compute = (): Computed | null => {
    if (!state.model && state.files.length === 0) return null;
    const merge = mergeTables({
      model: state.model,
      includeModelRows: state.includeModelRows,
      files: state.files,
      mode: state.mode,
      overrides: state.overrides,
    });
    const structured = applyStructure(
      { columns: merge.columns, rows: merge.rows, sourceColumn: merge.sourceColumn },
      state.structure,
    );
    const grid = applyFixes(structured, state.fixes);
    return { merge, grid, diagnostics: diagnose(grid) };
  };

  return {
    limits,
    getState: () => state,
    getComputed() {
      if (cache === undefined) cache = compute();
      return cache;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setModel(name, bytes, table) {
      state = { ...state, model: { id: newId(), name, bytes, table }, includeModelRows: table.rows.length > 0 };
      emit();
    },
    removeModel() {
      state = { ...state, model: null, includeModelRows: false };
      emit();
    },
    setIncludeModelRows(value) {
      state = { ...state, includeModelRows: value };
      emit();
    },
    addFile(name, bytes, table) {
      if (state.files.length >= limits.maxFiles) throw new LimitError(`Máximo de ${limits.maxFiles} arquivos na fila.`);
      if (totalRows() + table.rows.length > limits.maxTotalRows) {
        throw new LimitError(`O total de linhas excederia o limite de ${limits.maxTotalRows}.`);
      }
      const id = newId();
      state = { ...state, files: [...state.files, { id, name, bytes, table }] };
      emit();
      return id;
    },
    removeFile(id) {
      const overrides = new Map(state.overrides);
      overrides.delete(id);
      state = { ...state, files: state.files.filter((f) => f.id !== id), overrides };
      emit();
    },
    setMode(mode) {
      state = { ...state, mode };
      emit();
    },
    setOverride(fileId, sourceIndex, value) {
      if (!state.files.some((f) => f.id === fileId)) throw new HubError('Arquivo desconhecido.');
      const overrides = new Map(state.overrides);
      const forFile = new Map(overrides.get(fileId) ?? []);
      if (value === undefined) forFile.delete(sourceIndex);
      else forFile.set(sourceIndex, value);
      overrides.set(fileId, forFile);
      state = { ...state, overrides };
      emit();
    },
    setStructure(edit) {
      state = { ...state, structure: { order: edit.order ? [...edit.order] : null, deleted: [...edit.deleted], added: [...edit.added] } };
      emit();
    },
    setFixes(rules) {
      state = { ...state, fixes: { ...rules } };
      emit();
    },
    clearAll() {
      state = initialState();
      emit();
    },
  };
}
