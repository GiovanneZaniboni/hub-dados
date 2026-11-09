import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { HubError, LimitError } from '../src/core/limits';
import { decodeText, detectDelimiter, parseDelimited, readDelimited } from '../src/io/csv-reader';
import { readBytes } from '../src/io/read-file';
import { columnIndex, numberToText, readXlsx, serialToIso } from '../src/io/xlsx-reader';
import { buildXlsx } from '../src/export/xlsx-writer';
import { LIMITS, bytes, handmadeXlsx } from './helpers';

describe('csv', () => {
  it('decodifica UTF-8 com BOM e cai para Windows-1252', () => {
    expect(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]))).toBe('a');
    expect(decodeText(Uint8Array.from([0x4a, 0x6f, 0xe3, 0x6f]))).toBe('João');
  });

  it('detecta delimitador ignorando delimitadores dentro de aspas', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a,b\n1,2')).toBe(',');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectDelimiter('"a;b",c\n"1;2",3')).toBe(',');
    expect(detectDelimiter('sem delimitador')).toBe(',');
  });

  it('RFC 4180: aspas, aspas escapadas, quebra de linha em campo, CRLF', () => {
    const rows = parseDelimited('a,b\r\n"x,1","he said ""hi"""\r\n"l1\nl2",z\r\n', ',', LIMITS);
    expect(rows).toEqual([['a', 'b'], ['x,1', 'he said "hi"'], ['l1\nl2', 'z']]);
  });

  it('aspas não fechadas são erro, não truncamento silencioso', () => {
    expect(() => parseDelimited('a,b\n"x,1', ',', LIMITS)).toThrow(HubError);
  });

  it('readDelimited: cabeçalhos duplicados/vazios, linhas curtas e linhas vazias', () => {
    const t = readDelimited(bytes('Nome;Nome;\nA;B;C\nD\n\n'), LIMITS);
    expect(t.columns).toEqual(['Nome', 'Nome (2)', 'Coluna_3']);
    expect(t.rows).toEqual([['A', 'B', 'C'], ['D', '', '']]);
  });

  it('linhas com campos a mais criam colunas (sem perder dados) e avisam', () => {
    const t = readDelimited(bytes('a;b\n1;2;3\n'), LIMITS);
    expect(t.columns).toEqual(['a', 'b', 'Coluna_3']);
    expect(t.rows[0]).toEqual(['1', '2', '3']);
    expect(t.warnings).toHaveLength(1);
  });

  it('limites de linhas, colunas e célula', () => {
    expect(() => parseDelimited('a\n1\n2\n3', ',', { ...LIMITS, maxRowsPerFile: 2 })).toThrow(LimitError);
    expect(() => parseDelimited('a,b,c', ',', { ...LIMITS, maxColumns: 2 })).toThrow(LimitError);
    expect(() => parseDelimited('a,bbbbbb', ',', { ...LIMITS, maxCellChars: 3 })).toThrow(LimitError);
    expect(() => parseDelimited('"aaaaaaaa"', ',', { ...LIMITS, maxCellChars: 3 })).toThrow(LimitError);
  });

  it('arquivo vazio', () => {
    expect(() => readDelimited(bytes('\n\n'), LIMITS)).toThrow(HubError);
  });
});

describe('readBytes (validação de entrada)', () => {
  it('rejeita .xls e formatos desconhecidos', () => {
    expect(() => readBytes('a.xls', bytes('x'), LIMITS)).toThrow(/\.xls/);
    expect(() => readBytes('a.exe', bytes('x'), LIMITS)).toThrow(HubError);
    expect(() => readBytes('semext', bytes('x'), LIMITS)).toThrow(HubError);
  });

  it('rejeita binário disfarçado de CSV', () => {
    expect(() => readBytes('a.csv', Uint8Array.from([0x41, 0x00, 0x42]), LIMITS)).toThrow(/texto/);
    expect(() => readBytes('a.csv', bytes('%PDF-1.7 ...'), LIMITS)).toThrow(/texto/);
    expect(() => readBytes('a.csv', zipSync({ 'x.txt': strToU8('hi') }), LIMITS)).toThrow(/texto/);
  });

  it('rejeita arquivo acima do limite', () => {
    expect(() => readBytes('a.csv', bytes('abcdef'), { ...LIMITS, maxFileBytes: 3 })).toThrow(LimitError);
  });

  it('lê csv e tsv', () => {
    expect(readBytes('a.tsv', bytes('x\ty\n1\t2'), LIMITS).rows).toEqual([['1', '2']]);
  });
});

describe('xlsx', () => {
  const styles =
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/></numFmts>' +
    '<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>';

  it('lê shared strings, números, datas (nativas e personalizadas), booleanos e inlineStr', () => {
    const data = handmadeXlsx({
      shared: ['Nome', 'Data', 'Valor', 'Ana', 'Ok'],
      stylesXml: styles,
      sheetXml:
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="inlineStr"><is><t>Flag</t></is></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" s="1"><v>45292</v></c><c r="C2"><v>0.30000000000000004</v></c><c r="D2" t="b"><v>1</v></c></row>' +
        '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" s="2"><v>45292.5</v></c><c r="C3"><v>1234.5</v></c></row>',
    });
    const t = readXlsx(data, LIMITS);
    expect(t.columns).toEqual(['Nome', 'Data', 'Valor', 'Flag']);
    expect(t.rows).toEqual([
      ['Ana', '2024-01-01', '0.3', 'TRUE'],
      ['Ok', '2024-01-01 12:00', '1234.5', ''],
    ]);
  });

  it('células esparsas e linha de cabeçalho deslocada', () => {
    const data = handmadeXlsx({
      sheetXml:
        '<row r="1"><c r="A1" t="inlineStr"><is><t>Título do relatório</t></is></c></row>' +
        '<row r="3"><c r="A3" t="inlineStr"><is><t>a</t></is></c><c r="C3" t="inlineStr"><is><t>c</t></is></c></row>' +
        '<row r="4"><c r="C4" t="inlineStr"><is><t>9</t></is></c></row>',
    });
    const t = readXlsx(data, LIMITS);
    expect(t.columns).toEqual(['a', 'Coluna_2', 'c']);
    expect(t.rows).toEqual([['', '', '9']]);
  });

  it('serialToIso e helpers', () => {
    expect(serialToIso(45292, false)).toBe('2024-01-01');
    expect(serialToIso(0.5, false)).toBe('12:00');
    expect(serialToIso(43830, true)).toBe('2024-01-01');
    expect(serialToIso(-1, false)).toBe('-1');
    expect(numberToText('0.1')).toBe('0.1');
    expect(numberToText('abc')).toBe('abc');
    expect(columnIndex('A1')).toBe(0);
    expect(columnIndex('AA9')).toBe(26);
    expect(columnIndex('9')).toBe(-1);
  });

  it('ida e volta com o escritor: texto, números, zeros à esquerda e caracteres especiais', () => {
    const grid = {
      columns: ['Código', 'Valor', 'Obs'],
      rows: [['007', '10.5', '=1+1'], ['008', '2', 'a<b & "c"']],
      sourceColumn: null,
    };
    const t = readXlsx(buildXlsx(grid), LIMITS);
    expect(t.columns).toEqual(grid.columns);
    expect(t.rows).toEqual(grid.rows);
  });

  it('o escritor nunca emite fórmulas: textos com "=" são inlineStr', () => {
    const files = new TextDecoder().decode(
      (require('fflate') as typeof import('fflate')).unzipSync(buildXlsx({ columns: ['a'], rows: [['=cmd|calc']], sourceColumn: null }))['xl/worksheets/sheet1.xml'],
    );
    expect(files).not.toContain('<f>');
    expect(files).toContain('t="inlineStr"');
  });

  it('rejeita DTD/entidades (XXE, billion laughs)', () => {
    const evil = handmadeXlsx({
      sheetXml: '<row r="1"><c r="A1"><v>1</v></c></row>',
      extra: { 'xl/sharedStrings.xml': '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><sst><si><t>&a;</t></si></sst>' },
    });
    expect(() => readXlsx(evil, LIMITS)).toThrow(/DTD/);
  });

  it('rejeita zip bomb (tamanho declarado) e excesso de entradas', () => {
    const big = zipSync({ 'xl/workbook.xml': new Uint8Array(2_000_000) });
    expect(() => readXlsx(big, { ...LIMITS, maxXlsxUncompressedBytes: 1_000_000 })).toThrow(LimitError);
    const many = zipSync({ a: strToU8('1'), b: strToU8('2'), c: strToU8('3') });
    expect(() => readXlsx(many, { ...LIMITS, maxXlsxEntries: 2 })).toThrow(LimitError);
  });

  it('rejeita arquivos que não são xlsx', () => {
    expect(() => readXlsx(bytes('não sou zip'), LIMITS)).toThrow(HubError);
    expect(() => readXlsx(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), LIMITS)).toThrow(HubError);
    expect(() => readXlsx(zipSync({ 'x.txt': strToU8('oi') }), LIMITS)).toThrow(/planilhas/);
  });

  it('XML malformado e limites de linhas/colunas', () => {
    const broken = handmadeXlsx({ sheetXml: '<row r="1"><c r="A1"><v>1</v></row>' });
    expect(() => readXlsx(broken, LIMITS)).toThrow(HubError);
    const wide = handmadeXlsx({ sheetXml: '<row r="1"><c r="ZZ1"><v>1</v></c></row>' });
    expect(() => readXlsx(wide, LIMITS)).toThrow(LimitError);
    const tall = handmadeXlsx({ sheetXml: '<row r="9999999"><c r="A9999999"><v>1</v></c></row>' });
    expect(() => readXlsx(tall, LIMITS)).toThrow(LimitError);
  });

  it('planilha vazia', () => {
    expect(() => readXlsx(handmadeXlsx({ sheetXml: '' }), LIMITS)).toThrow(/vazia/);
  });
});
