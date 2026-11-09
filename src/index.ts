/**
 * API pública para embutir o Hub em outro projeto.
 *
 *   import { mountHub } from 'hub-dados';
 *   import 'hub-dados/styles.css';
 *   const hub = mountHub(document.getElementById('hub')!, { limits: { maxFiles: 10 } });
 *
 * O núcleo (core/io/export/state) não depende de DOM e pode ser usado sem a interface.
 */
export { mountHub, type HubHandle, type HubOptions } from './ui/app';
export { createStore, type HubStore, type HubState } from './state/store';
export { DEFAULT_LIMITS, HubError, LimitError, mergeLimits, type Limits } from './core/limits';
export { mergeTables } from './core/merge';
export { applyFixes, applyStructure, diagnose, type Grid } from './core/pipeline';
export { findBestMatch } from './core/matcher';
export { readBytes, readFile } from './io/read-file';
export { buildCsv, buildJson, buildSql, csvSafeCell } from './export/text-formats';
export { buildXlsx } from './export/xlsx-writer';
export type { Table, LoadedTable, MergeResult, FixRules, StructureEdit, Diagnostics } from './core/types';
