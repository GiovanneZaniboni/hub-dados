import { describe, expect, it } from 'vitest';
import { findBestMatch } from '../src/core/matcher';
import { mergeTables } from '../src/core/merge';
import { NO_FIXES, NO_STRUCTURE, applyFixes, applyStructure, diagnose } from '../src/core/pipeline';
import { cleanCell, dedupeHeaders, isNumericColumn, normalizeKey } from '../src/core/text';
import { DEFAULT_LIMITS, HubError, LimitError, mergeLimits } from '../src/core/limits';
import { IGNORE, type MappingOverride } from '../src/core/types';
import { LIMITS, loaded } from './helpers';

const noOverrides = new Map<string, Map<number, MappingOverride>>();

describe('text', () => {
  it('normalizeKey', () => {
    expect(normalizeKey('  Razão Social ')).toBe('razaosocial');
    expect(normalizeKey('E-mail')).toBe('email');
    expect(normalizeKey(null)).toBe('');
  });

  it('cleanCell remove controles e respeita o limite', () => {
    expect(cleanCell('  a\u0000b\u0007c  ', LIMITS)).toBe('abc');
    expect(cleanCell('l1\nl2', LIMITS)).toBe('l1\nl2');
    expect(() => cleanCell('x'.repeat(LIMITS.maxCellChars + 1), LIMITS)).toThrow(LimitError);
  });

  it('dedupeHeaders gera nomes únicos, mesmo ignorando maiúsculas', () => {
    expect(dedupeHeaders(['A', 'a', '', 'A', ''], 255)).toEqual(['A', 'a (2)', 'Coluna_3', 'A (3)', 'Coluna_5']);
  });

  it('isNumericColumn', () => {
    expect(isNumericColumn([['1'], [''], ['2.5']], 0)).toBe(true);
    expect(isNumericColumn([['007']], 0)).toBe(false);
    expect(isNumericColumn([['']], 0)).toBe(false);
    expect(isNumericColumn([['1,5']], 0)).toBe(false);
  });
});

describe('limits', () => {
  it('mergeLimits só aceita valores positivos e nunca remove o limite', () => {
    expect(() => mergeLimits({ maxFiles: 0 })).toThrow(HubError);
    expect(() => mergeLimits({ maxFiles: Number.POSITIVE_INFINITY })).toThrow(HubError);
    expect(mergeLimits({ maxFiles: 1e9 }).maxFiles).toBe(DEFAULT_LIMITS.maxFiles * 4);
    expect(mergeLimits({ maxFiles: 5 }).maxFiles).toBe(5);
  });
});

describe('matcher', () => {
  it('igualdade normalizada', () => expect(findBestMatch('NOME', ['Nome'])).toEqual({ target: 'Nome', how: 'exact' }));

  it('sinônimos com espaço, hífen e underscore', () => {
    expect(findBestMatch('Razão Social', ['Nome'])?.target).toBe('Nome');
    expect(findBestMatch('Preço Unitário', ['Valor'])?.target).toBe('Valor');
    expect(findBestMatch('e-mail', ['Email'])?.target).toBe('Email');
    expect(findBestMatch('Data_Hora', ['Data'])?.target).toBe('Data');
    expect(findBestMatch('Estado Atual', ['Status'])?.target).toBe('Status');
  });

  it('sem correspondência', () => {
    expect(findBestMatch('xyz', ['Nome'])).toBeNull();
    expect(findBestMatch('', ['Nome'])).toBeNull();
  });
});

describe('merge', () => {
  const model = loaded('modelo.csv', ['Nome', 'Valor', 'Email'], []);

  it('mapeia por sinônimo, preserva colunas novas e rastreia a origem', () => {
    const a = loaded('a.csv', ['Razão Social', 'Preço', 'Extra'], [['João', '10', 'x']]);
    const r = mergeTables({ model, includeModelRows: false, files: [a], mode: 'smart', overrides: noOverrides });
    expect(r.columns).toEqual(['Nome', 'Valor', 'Email', 'Extra', 'Arquivo_Origem']);
    expect(r.rows).toEqual([['João', '10', '', 'x', 'a.csv']]);
    expect(r.mappings[a.id]?.map((m) => m.kind)).toEqual(['synonym', 'synonym', 'new']);
  });

  it('colisão: mantém o primeiro, conta e amostra o descartado', () => {
    const a = loaded('a.csv', ['valor', 'total'], [['20', '30'], ['5', '5']]);
    const r = mergeTables({ model, includeModelRows: false, files: [a], mode: 'smart', overrides: noOverrides });
    expect(r.collisionCount).toBe(1);
    expect(r.collisions[0]).toMatchObject({ file: 'a.csv', row: 1, column: 'Valor', kept: '20', discarded: '30' });
    expect(r.duplicateTargets[0]).toMatchObject({ target: 'Valor', sources: ['valor', 'total'] });
  });

  it('modo posição e aviso de colunas além do modelo', () => {
    const a = loaded('a.csv', ['x', 'y', 'z', 'w'], [['1', '2', '3', '4']]);
    const r = mergeTables({ model, includeModelRows: false, files: [a], mode: 'position', overrides: noOverrides });
    expect(r.mappings[a.id]?.map((m) => m.kind)).toEqual(['position', 'position', 'position', 'new']);
    expect(r.rows[0]).toEqual(['1', '2', '3', '4', 'a.csv']);
  });

  it('overrides manuais e IGNORE', () => {
    const a = loaded('a.csv', ['x', 'y'], [['1', '2']]);
    const ov = new Map([[a.id, new Map<number, MappingOverride>([[0, 'Email'], [1, IGNORE]])]]);
    const r = mergeTables({ model, includeModelRows: false, files: [a], mode: 'smart', overrides: ov });
    expect(r.rows[0]).toEqual(['', '', '1', 'a.csv']);
    expect(r.mappings[a.id]?.[1]?.kind).toBe('ignored');
  });

  it('inclui linhas do modelo quando pedido', () => {
    const m = loaded('modelo.csv', ['Nome'], [['Zé']]);
    const r = mergeTables({ model: m, includeModelRows: true, files: [], mode: 'smart', overrides: noOverrides });
    expect(r.rows).toEqual([['Zé', 'modelo.csv']]);
  });

  it('a coluna de origem nunca colide com dados do usuário', () => {
    const a = loaded('a.csv', ['Arquivo_Origem', 'k'], [['antigo', '1']]);
    const r = mergeTables({ model: null, includeModelRows: false, files: [a], mode: 'smart', overrides: noOverrides });
    expect(r.sourceColumn).toBe('Arquivo_Origem_');
    expect(r.rows[0]).toEqual(['antigo', '1', 'a.csv']);
  });

  it('cabeçalhos perigosos (__proto__) são tratados como dados comuns', () => {
    const a = loaded('a.csv', ['__proto__', 'constructor'], [['1', '2']]);
    const r = mergeTables({ model: null, includeModelRows: false, files: [a], mode: 'smart', overrides: noOverrides });
    expect(r.columns.slice(0, 2)).toEqual(['__proto__', 'constructor']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.keys(Object.prototype)).toEqual([]);
  });
});

describe('pipeline', () => {
  const grid = { columns: ['A', 'B', 'Arquivo_Origem'], rows: [['1', '', 'f'], ['', '', 'f'], ['1', '', 'f'], ['x', '', 'g']], sourceColumn: 'Arquivo_Origem' };

  it('applyStructure: ordem, remoção e coluna nova', () => {
    const g = applyStructure(grid, { order: ['B', 'A'], deleted: ['Arquivo_Origem'], added: ['C'] });
    expect(g.columns).toEqual(['B', 'A', 'C']);
    expect(g.rows[0]).toEqual(['', '1', '']);
    expect(g.sourceColumn).toBeNull();
  });

  it('applyStructure sem edição não muda nada', () => {
    expect(applyStructure(grid, NO_STRUCTURE)).toEqual(grid);
  });

  it('applyFixes: vazias -> duplicadas -> preencher, poupando colunas numéricas', () => {
    const g = applyFixes(grid, { fillEmpty: 'N/D', removeBlankRows: true, removeDuplicateRows: true });
    expect(g.rows).toEqual([['1', 'N/D', 'f'], ['x', 'N/D', 'g']]);
  });

  it('applyFixes não preenche coluna numérica nem a de origem', () => {
    const g = applyFixes({ columns: ['N', 'T'], rows: [['1', ''], ['', 'a']], sourceColumn: null }, { ...NO_FIXES, fillEmpty: '-' });
    expect(g.rows).toEqual([['1', '-'], ['', 'a']]);
  });

  it('diagnose', () => {
    const d = diagnose(grid);
    expect(d).toMatchObject({ rows: 4, columns: 3, emptyCells: 5, rowsWithEmpty: 4, duplicateRows: 1, blankRows: 1 });
    expect(d.emptyByColumn).toEqual([1, 4, 0]);
  });
});
