import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const file = join(__dirname, '../standalone/hub-dados.html');
const sha = (t: string): string => `'sha256-${createHash('sha256').update(t, 'utf8').digest('base64')}'`;

/** A versão de arquivo único (standalone/hub-dados.html) é versionada: estes testes garantem que ela está íntegra e segura. */
describe.skipIf(!existsSync(file))('versão arquivo único (standalone)', () => {
  const html = readFileSync(file, 'utf8');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
  const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1] ?? '';
  const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';

  it('tem um único script e um único estilo inline, liberados somente por hash', () => {
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html.match(/<style>/g)).toHaveLength(1);
    expect(csp).toContain(`script-src ${sha(script)}`);
    expect(csp).toContain(`style-src ${sha(style)}`);
  });

  it('mantém a CSP estrita: sem unsafe-inline/eval, sem rede, sem frames, com Trusted Types', () => {
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:|\*/);
    for (const d of ["default-src 'none'", "connect-src 'none'", "worker-src 'none'", "frame-src 'none'", "form-action 'none'", "base-uri 'none'", "require-trusted-types-for 'script'", "trusted-types 'none'"]) {
      expect(csp).toContain(d);
    }
    expect(csp).toContain('font-src data:');
  });

  it('não carrega nada externo (sem src/href/url() para fora)', () => {
    expect(html).not.toMatch(/<script[^>]+src=|<link\b|<img\b|<iframe\b/i);
    expect(style).not.toMatch(/url\((?!["']?data:)/);
  });

  it('não usa módulos ES (que o navegador bloqueia em file://)', () => {
    expect(html).not.toMatch(/type="module"/);
  });
});
