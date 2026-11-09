// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Testes de política: falham se alguém introduzir uma API que quebre o modelo de segurança. */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|css)$/.test(name) ? [p] : [];
  });
}

const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const FORBIDDEN: [string, RegExp][] = [
  ['HTML bruto (innerHTML/outerHTML)', /\b(innerHTML|outerHTML)\b/],
  ['insertAdjacentHTML', /insertAdjacentHTML/],
  ['document.write', /document\.write/],
  ['eval / new Function', /\beval\s*\(|new\s+Function\s*\(/],
  ['setTimeout/setInterval com texto', /set(Timeout|Interval)\s*\(\s*['"`]/],
  ['rede: fetch/XHR/WebSocket/EventSource/beacon', /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/],
  ['import dinâmico', /\bimport\s*\(/],
  ['storage/cookies/IndexedDB', /\b(localStorage|sessionStorage|indexedDB|document\.cookie|caches)\b/],
  ['workers e service workers', /\b(new\s+Worker|SharedWorker|serviceWorker)\b/],
  ['postMessage/window.open/opener', /\b(postMessage|window\.open|opener)\b/],
  ['createContextualFragment/DOMParser HTML', /createContextualFragment|text\/html/],
  ['@import / url() em CSS', /@import|url\s*\(/],
];

describe('política de segurança do código-fonte', () => {
  const files = sourceFiles('src');

  for (const [label, re] of FORBIDDEN) {
    it(`não usa ${label}`, () => {
      const offenders = files.filter((f) => re.test(stripComments(readFileSync(f, 'utf8'))));
      expect(offenders).toEqual([]);
    });
  }

  it('DOMParser só é usado com XML', () => {
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'));
      for (const m of code.matchAll(/parseFromString\([^)]*\)/g)) expect(m[0]).toContain("'application/xml'");
    }
  });

  it('dependências de runtime: somente fflate', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).toEqual(['fflate']);
    for (const v of Object.values(pkg.dependencies)) expect(v).toMatch(/^\d+\.\d+\.\d+$/); // versão exata
  });

  it('.npmrc bloqueia scripts de instalação', () => {
    expect(readFileSync('.npmrc', 'utf8')).toMatch(/^ignore-scripts=true$/m);
  });
});

describe('Content-Security-Policy do index.html', () => {
  const html = readFileSync('index.html', 'utf8');
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? '';
  const directive = (name: string): string | undefined =>
    csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `) || d === name);

  it('existe e usa default-src none', () => {
    expect(directive('default-src')).toBe("default-src 'none'");
  });

  it.each([
    ['script-src', "'self'"],
    ['style-src', "'self'"],
    ['connect-src', "'none'"],
    ['worker-src', "'none'"],
    ['frame-src', "'none'"],
    ['object-src', "'none'"],
    ['form-action', "'none'"],
    ['base-uri', "'none'"],
    ['require-trusted-types-for', "'script'"],
    ['trusted-types', "'none'"],
  ])('%s = %s', (name, value) => {
    expect(directive(name)).toBe(`${name} ${value}`);
  });

  it('nunca permite unsafe-inline, unsafe-eval, curingas, data: ou http(s):', () => {
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|\*|data:|https?:|blob:/);
  });

  it('não carrega recursos externos nem scripts inline', () => {
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(html).not.toMatch(/(src|href)="https?:/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });
});

describe('tema claro/escuro', () => {
  const css = readFileSync(join(__dirname, '../src/ui/styles.css'), 'utf8');

  it('segue o sistema por CSS puro (sem script nem armazenamento)', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toMatch(/color-scheme:\s*light dark/);
  });

  it('não deixa fundos brancos fixos fora dos tokens', () => {
    expect(css).not.toMatch(/background:\s*#fff\b/);
  });
});
