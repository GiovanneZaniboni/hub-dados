/**
 * Monta standalone/hub-dados.html: UM arquivo com HTML + CSS + JavaScript (e a fonte) dentro,
 * que funciona ao abrir com duplo clique (file://), sem Node, sem servidor e sem instalar nada.
 *
 * Segurança: scripts e estilos inline só são permitidos por HASH (sha256) na CSP, nunca por
 * 'unsafe-inline'. Qualquer script ou estilo injetado depois não tem o hash e é bloqueado.
 * Continuam valendo: connect-src 'none' (zero rede), Trusted Types, sem frames/formulários.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TMP = 'standalone-tmp';
const OUT_DIR = 'standalone';
const OUT_FILE = join(OUT_DIR, 'hub-dados.html');

const assets = readdirSync(join(TMP, 'assets'));
const jsName = assets.find((f) => f.endsWith('.js'));
const cssName = assets.find((f) => f.endsWith('.css'));
if (!jsName || !cssName) throw new Error('Build intermediário incompleto (falta .js ou .css).');

const js = readFileSync(join(TMP, 'assets', jsName), 'utf8');
const css = readFileSync(join(TMP, 'assets', cssName), 'utf8');

// Referências a arquivos externos significariam que algo não foi embutido e falharia em file://.
if (/url\((?!["']?data:)/.test(css)) throw new Error('O CSS ainda referencia arquivos externos (fonte não embutida).');
if (/<\/script/i.test(js) || /<!--/.test(js)) throw new Error('O JavaScript contém sequências que quebram a tag <script> inline.');
if (/<\/style/i.test(css)) throw new Error('O CSS contém sequência que quebra a tag <style> inline.');

const hash = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

const csp = [
  "default-src 'none'",
  `script-src ${hash(js)}`,
  `style-src ${hash(css)}`,
  "img-src 'none'",
  "font-src data:",
  "connect-src 'none'",
  "worker-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "media-src 'none'",
  "manifest-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join('; ');

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="referrer" content="no-referrer" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="robots" content="noindex, nofollow" />
<title>Hub de Dados</title>
<style>${css}</style>
</head>
<body>
<div id="app"></div>
<noscript>Este aplicativo precisa de JavaScript para processar planilhas localmente.</noscript>
<script>${js}</script>
</body>
</html>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, html, 'utf8');
rmSync(TMP, { recursive: true, force: true });
console.log(`ok: ${OUT_FILE} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KiB)`);
