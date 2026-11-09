/**
 * Helpers de DOM seguros. Todo texto entra por `textContent`/nós de texto; não existe caminho
 * para HTML bruto (innerHTML, insertAdjacentHTML...), o que, junto com Trusted Types na CSP,
 * elimina XSS por construção. Nomes de arquivo e células são sempre tratados como texto.
 */

type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
  on?: { [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void };
}

const FORBIDDEN_ATTR = /^(on|srcdoc$|style$|href$|src$|action$|formaction$)/i;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (FORBIDDEN_ATTR.test(name)) throw new Error(`Atributo não permitido: ${name}`);
    el.setAttribute(name, value);
  }
  for (const [type, handler] of Object.entries(props.on ?? {})) {
    el.addEventListener(type, handler as EventListener);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

export function replaceChildrenOf(el: Element, ...children: Child[]): void {
  el.replaceChildren(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));
}

/** Dispara o download de um Blob e libera a URL em seguida. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const formatInt = (n: number): string => n.toLocaleString('pt-BR');

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2).replace('.', ',')} MiB`;
}
