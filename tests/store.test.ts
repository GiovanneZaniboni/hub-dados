import { describe, expect, it, vi } from 'vitest';
import { HubError, LimitError } from '../src/core/limits';
import { IGNORE } from '../src/core/types';
import { createStore } from '../src/state/store';
import { table } from './helpers';

describe('store', () => {
  it('sem dados não há resultado calculado', () => {
    expect(createStore().getComputed()).toBeNull();
  });

  it('modelo + arquivo geram resultado, métricas e diagnóstico', () => {
    const s = createStore();
    s.setModel('m.csv', 10, table(['Nome', 'Valor'], []));
    s.addFile('a.csv', 10, table(['cliente', 'preco'], [['Ana', '10'], ['Bia', '']]));
    const c = s.getComputed();
    expect(c?.grid.columns).toEqual(['Nome', 'Valor', 'Arquivo_Origem']);
    expect(c?.grid.rows).toHaveLength(2);
    expect(c?.diagnostics.emptyCells).toBe(1);
  });

  it('o resultado é memoizado e invalidado a cada mudança, notificando assinantes', () => {
    const s = createStore();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.addFile('a.csv', 1, table(['x'], [['1']]));
    const first = s.getComputed();
    expect(s.getComputed()).toBe(first);
    s.setMode('position');
    expect(s.getComputed()).not.toBe(first);
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    s.setMode('smart');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('edições de estrutura e correções persistem ao adicionar novos arquivos', () => {
    const s = createStore();
    s.addFile('a.csv', 1, table(['A', 'B'], [['1', '']]));
    s.setStructure({ order: ['B', 'A'], deleted: [], added: [] });
    s.setFixes({ fillEmpty: 'N/D', removeBlankRows: false, removeDuplicateRows: false });
    s.addFile('b.csv', 1, table(['A', 'B'], [['2', '']]));
    const g = s.getComputed()?.grid;
    expect(g?.columns.slice(0, 2)).toEqual(['B', 'A']);
    expect(g?.rows.map((r) => r[0])).toEqual(['N/D', 'N/D']);
  });

  it('override manual e remoção de arquivo limpa overrides', () => {
    const s = createStore();
    const id = s.addFile('a.csv', 1, table(['x', 'y'], [['1', '2']]));
    s.setOverride(id, 0, IGNORE);
    s.setOverride(id, 1, 'Novo');
    expect(s.getComputed()?.grid.columns).toEqual(['Novo', 'Arquivo_Origem']);
    s.setOverride(id, 0, undefined);
    s.removeFile(id);
    expect(s.getState().overrides.has(id)).toBe(false);
    expect(() => s.setOverride('nao-existe', 0, 'x')).toThrow(HubError);
  });

  it('limites: arquivos e total de linhas', () => {
    const s = createStore({ maxFiles: 1 });
    s.addFile('a.csv', 1, table(['x'], [['1']]));
    expect(() => s.addFile('b.csv', 1, table(['x'], [['1']]))).toThrow(LimitError);
    const t = createStore({ maxTotalRows: 2 });
    t.addFile('a.csv', 1, table(['x'], [['1'], ['2']]));
    expect(() => t.addFile('b.csv', 1, table(['x'], [['3']]))).toThrow(LimitError);
  });

  it('linhas do modelo entram quando o modelo tem dados e podem ser desligadas', () => {
    const s = createStore();
    s.setModel('m.csv', 1, table(['Nome'], [['Zé']]));
    expect(s.getComputed()?.grid.rows).toHaveLength(1);
    s.setIncludeModelRows(false);
    expect(s.getComputed()?.grid.rows).toHaveLength(0);
    s.removeModel();
    expect(s.getComputed()).toBeNull();
  });

  it('clearAll apaga tudo', () => {
    const s = createStore();
    s.setModel('m.csv', 1, table(['a'], [['1']]));
    s.addFile('a.csv', 1, table(['a'], [['1']]));
    s.setFixes({ fillEmpty: 'x', removeBlankRows: true, removeDuplicateRows: true });
    s.clearAll();
    expect(s.getComputed()).toBeNull();
    expect(s.getState().files).toEqual([]);
    expect(s.getState().fixes.fillEmpty).toBeNull();
  });
});
