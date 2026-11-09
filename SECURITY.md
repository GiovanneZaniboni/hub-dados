# Segurança

## Modelo de ameaça

O Hub processa planilhas que podem conter **dados pessoais** e que podem vir de **fontes não confiáveis** (e-mail, download, outro sistema). O objetivo é que abrir uma planilha maliciosa nunca execute código, vaze dados ou trave a máquina, e que os dados nunca saiam do computador.

| Ameaça | Mitigação |
| --- | --- |
| Exfiltração de dados | CSP `connect-src 'none'`, `form-action 'none'`, `frame-src 'none'`, `worker-src 'none'`; código sem `fetch`/XHR/WebSocket/beacon (teste automatizado). Sem CDN, fontes ou scripts externos |
| XSS por conteúdo da planilha ou nome de arquivo | Nenhum `innerHTML`/`insertAdjacentHTML`; DOM montado por `createElement`+`textContent`; `h()` recusa atributos `on*`, `href`, `src`, `style`; Trusted Types obrigatório (`require-trusted-types-for 'script'`, `trusted-types 'none'`) |
| Injeção de código por script inline/eval | `script-src 'self'`, sem `unsafe-inline`/`unsafe-eval`; testes proíbem `eval`, `new Function`, import dinâmico |
| Injeção de fórmula (CSV/Excel/LibreOffice) | CSV prefixa `'` em textos iniciados por `= + - @ TAB CR` (inclusive cabeçalhos); no `.xlsx` todo texto é `inlineStr`, nunca fórmula; o leitor ignora fórmulas e lê apenas o valor |
| SQL injection no script gerado | Identificadores e valores escapados; testado executando o script no SQLite com payloads maliciosos |
| Prototype pollution (`__proto__`, `constructor` como cabeçalho) | Linhas são arrays; JSON de saída usa `Object.create(null)`; testes cobrem |
| Zip bomb em `.xlsx` | Validação do tamanho descompactado declarado e do nº de entradas **antes** de descompactar; só as partes necessárias são extraídas |
| XXE / "billion laughs" em XML | XML com `<!DOCTYPE`/`<!ENTITY` é recusado; `DOMParser` só com `application/xml` |
| Negação de serviço por arquivo enorme | Limites de tamanho, linhas, colunas e célula, aplicados durante a leitura |
| Binário disfarçado de CSV | Assinatura (PK, %PDF, MZ, ELF) e bytes NUL rejeitados |
| Formatos legados com parsers arriscados | `.xls`, `.xlsm`, `.xlsb` recusados |
| Persistência acidental de dados | Nenhum uso de localStorage/sessionStorage/IndexedDB/cookies/Cache (teste); "Limpar tudo" e `destroy()` apagam a memória |
| Vazamento por mensagens de erro | Só mensagens `HubError` (sem conteúdo do arquivo) chegam à tela; erros inesperados viram texto genérico |
| Cadeia de suprimentos | 1 dependência de runtime, versão exata, `package-lock.json`, `.npmrc` com `ignore-scripts=true`, `npm audit` no CI, Dependabot |

## O que **não** está coberto

- Quem tem acesso físico/administrativo à máquina ou ao navegador pode ver os dados em memória.
- Extensões de navegador com permissão sobre a página podem ler o DOM. Em máquinas corporativas, restrinja extensões.
- `frame-ancestors` (anti-clickjacking) e HSTS só funcionam como **cabeçalhos HTTP**: configure-os no servidor (docs/DEPLOY.md).
- Strings muito grandes ainda ocupam memória do navegador dentro dos limites; ajuste os limites ao hardware da empresa.
- O dicionário de sinônimos é heurístico: revise o mapeamento antes de exportar dados importantes (o app avisa colisões e colunas sem par).

## Regras para quem contribui

1. Nada de `innerHTML` & cia., `eval`, rede, storage, workers: os testes em `tests/security.test.ts` bloqueiam.
2. Nenhuma dependência de runtime nova sem revisão de segurança (o teste exige que só `fflate` exista).
3. Dado externo (arquivo, nome, célula) só entra no DOM via `textContent`.
4. Todo novo limite/validação ganha teste.

## Reportar vulnerabilidade

Abra um relato privado ao responsável pelo repositório (não publique detalhes em issue pública).
