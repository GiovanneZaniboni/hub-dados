import { HubError, LimitError, type Limits } from '../core/limits';
import type { Table } from '../core/types';
import { readDelimited } from './csv-reader';
import { readXlsx } from './xlsx-reader';

const TEXT_EXTENSIONS = new Set(['csv', 'tsv', 'txt']);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Assinaturas de formatos binários conhecidos que não podem ser lidos como texto. */
function looksBinary(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) return true;
  const sig = String.fromCharCode(...head.subarray(0, 4));
  return sig.startsWith('PK') || sig.startsWith('%PDF') || sig.startsWith('MZ') || sig.startsWith('\x7fELF');
}

/** Lê bytes já em memória. Testável sem a API File. */
export function readBytes(name: string, bytes: Uint8Array, limits: Limits): Table {
  if (bytes.length > limits.maxFileBytes) {
    throw new LimitError(`O arquivo excede o limite de ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB.`);
  }
  const ext = extensionOf(name);
  if (ext === 'xlsx') return readXlsx(bytes, limits);
  if (ext === 'xls' || ext === 'xlsm' || ext === 'xlsb') {
    throw new HubError(`Formato .${ext} não é aceito por segurança. Salve a planilha como .xlsx e tente de novo.`);
  }
  if (!TEXT_EXTENSIONS.has(ext)) throw new HubError(`Formato .${ext || '(sem extensão)'} não suportado. Use .xlsx, .csv, .tsv ou .txt.`);
  if (looksBinary(bytes)) throw new HubError('O conteúdo não parece um arquivo de texto delimitado.');
  return readDelimited(bytes, limits);
}

/** Lê um File do navegador (verifica o tamanho ANTES de carregar o conteúdo). */
export async function readFile(file: File, limits: Limits): Promise<Table> {
  if (file.size > limits.maxFileBytes) {
    throw new LimitError(`O arquivo excede o limite de ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB.`);
  }
  return readBytes(file.name, new Uint8Array(await file.arrayBuffer()), limits);
}
