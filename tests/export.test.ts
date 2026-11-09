import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { LimitError } from '../src/core/limits';
import { buildCsv, buildJson, buildSql, csvSafeCell, sqlIdent, sqlString } from '../src/export/text-formats';
import { buildXlsx, columnLetters, safeSheetName, xmlEscape } from '../src/export/xlsx-writer';

const grid = (columns: string[], rows: string[][]) => ({ columns, rows, sourceColumn: null });

describe('csv', () => {
  it('csvSafeCell neutraliza fórmulas e preserva números', () => {
    expect(csvSafeCell('=1+1')).toBe("'=1+1");
    expect(csvSafeCell('@cmd')).toBe("'@cmd");
    expect(csvSafeCell('+55 11 9999')).toBe("'+55 11 9999");
    expect(csvSafeCell('\t=x')).toBe("'\t=x");
    expect(csvSafeCell('-5')).toBe('-5');
    expect(csvSafeCell('-5,5')).toBe('-5,5');
    expect(csvSafeCell('ok')).toBe('ok');
    expect(csvSafeCell('')).toBe('');
  });

  it('buildCsv: BOM, ";" e aspas escapadas; cabeçalhos também são protegidos', () => {
    const csv = buildCsv(grid(['=a', 'b'], [['x"y', '=HYPERLINK("http://x")']]));
    expect(csv.startsWith('﻿"\'=a";"b"\r\n')).toBe(true);
    expect(csv).toContain('"x""y";"\'=HYPERLINK(""http://x"")"');
  });
});

describe('json', () => {
  it('lista de objetos; chave "__proto__" vira dado comum', () => {
    const out = JSON.parse(buildJson(grid(['__proto__', 'b'], [['1', '2']]))) as Record<string, string>[];
    expect(Object.keys(out[0] as object)).toEqual(['__proto__', 'b']);
    expect(Object.keys(Object.prototype)).toEqual([]);
  });
});

describe('sql', () => {
  it('escapa identificadores e valores', () => {
    expect(sqlIdent('a"b')).toBe('"a""b"');
    expect(sqlString("O'B\0")).toBe("'O''B'");
  });

  it('roda no SQLite com valores maliciosos, sem injeção e sem perder linhas', () => {
    const g = grid(['id', 'co"l', 'nome'], [
      ['1', 'x', "O'Brien'); DROP TABLE dados_unificados;--"],
      ['2', 'y', ''],
      ['3', 'z', '\\'],
    ]);
    const db = new DatabaseSync(':memory:');
    db.exec(buildSql(g, 'dados_unificados', 2));
    const rows = db.prepare('SELECT "nome" FROM dados_unificados ORDER BY "_id"').all() as { nome: string }[];
    expect(rows.map((r) => r.nome)).toEqual(["O'Brien'); DROP TABLE dados_unificados;--", '', '\\']);
    db.close();
  });

  it('lotes de INSERT e tabela sem colunas', () => {
    expect(buildSql(grid(['a'], Array.from({ length: 5 }, (_, i) => [String(i)])), 't', 2).match(/INSERT INTO/g)).toHaveLength(3);
    expect(buildSql(grid([], []))).toContain('CREATE TABLE');
  });
});

describe('xlsx writer', () => {
  it('helpers', () => {
    expect(columnLetters(0)).toBe('A');
    expect(columnLetters(25)).toBe('Z');
    expect(columnLetters(26)).toBe('AA');
    expect(columnLetters(16383)).toBe('XFD');
    expect(xmlEscape('a<b>&"\u0001')).toBe('a&lt;b&gt;&amp;&quot;');
    expect(safeSheetName('a/b:c*?[x]')).toBe('a b c   x');
    expect(safeSheetName('   ')).toBe('Dados');
    expect(safeSheetName('x'.repeat(40))).toHaveLength(31);
  });

  it('respeita limites do formato', () => {
    expect(() => buildXlsx(grid(Array.from({ length: 16385 }, (_, i) => `c${i}`), []))).toThrow(LimitError);
    expect(() => buildXlsx(grid(['a'], new Array<string[]>(1_048_576).fill(['x'])))).toThrow(LimitError);
  });
});
