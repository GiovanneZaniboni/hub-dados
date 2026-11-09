/**
 * Limites defensivos. Todo dado externo (arquivo) passa por eles antes de virar memória.
 * Podem ser ajustados por quem embute o Hub, mas nunca desligados.
 */

export interface Limits {
  maxFiles: number;
  maxFileBytes: number;
  maxRowsPerFile: number;
  maxTotalRows: number;
  maxColumns: number;
  maxCellChars: number;
  maxHeaderChars: number;
  /** Soma dos tamanhos descompactados declarados no zip (proteção contra zip bomb). */
  maxXlsxUncompressedBytes: number;
  maxXlsxEntries: number;
}

export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({
  maxFiles: 50,
  maxFileBytes: 50 * 1024 * 1024,
  maxRowsPerFile: 200_000,
  maxTotalRows: 500_000,
  maxColumns: 256,
  maxCellChars: 32_767, // limite do Excel
  maxHeaderChars: 255,
  maxXlsxUncompressedBytes: 200 * 1024 * 1024,
  maxXlsxEntries: 2_000,
});

/** Erro esperado e seguro de exibir ao usuário (nunca contém dados do arquivo). */
export class HubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HubError';
  }
}

export class LimitError extends HubError {
  constructor(message: string) {
    super(message);
    this.name = 'LimitError';
  }
}

export function mergeLimits(overrides?: Partial<Limits>): Limits {
  const merged: Limits = { ...DEFAULT_LIMITS };
  if (!overrides) return merged;
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof Limits)[]) {
    const v = overrides[key];
    if (v === undefined) continue;
    if (!Number.isFinite(v) || v <= 0) throw new HubError(`Limite inválido: ${key}`);
    // Só é permitido endurecer ou ajustar dentro de 4x o padrão; nunca remover o limite.
    merged[key] = Math.min(v, DEFAULT_LIMITS[key] * 4);
  }
  return merged;
}
