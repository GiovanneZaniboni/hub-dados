# Hub de Dados — Documentação do projeto

Documento de referência para quem mantém o projeto: o que ele é, como foi construído, como rodar, alterar e publicar. Para o passo a passo de quem só vai **usar** o Hub, veja o [Guia de uso](GUIA-DE-USO.md).

## 1. Visão geral

O Hub de Dados junta várias planilhas (`.xlsx`, `.csv`, `.tsv`) em uma só. O usuário escolhe um **modelo** (a lista de colunas do resultado), adiciona os arquivos, o Hub liga as colunas parecidas, mostra inconsistências e exporta em Excel, CSV, JSON ou SQL.

Princípios que guiaram o projeto:

- **Uso interno em empresa, com dados pessoais (LGPD):** nada pode sair do computador do usuário.
- **Segurança acima de conveniência:** poucas dependências, regras rígidas de código, testes que impedem regressões de segurança.
- **Simples de publicar:** é um site estático, sem servidor, sem banco, sem Python.
- **Reaproveitável:** o núcleo não depende de tela e a interface pode ser embutida em outro sistema.

Este projeto **substitui** o antigo `hub-dados-web`, que foi mantido apenas como arquivo.

| Item | Valor |
| --- | --- |
| Repositório | https://github.com/GiovanneZaniboni/hub-dados |
| Linguagem | TypeScript (modo estrito) |
| Build e servidor local | Vite |
| Testes | Vitest + happy-dom |
| Dependência de produção | `fflate` (somente, versão fixa) |
| Licença | MIT |

## 2. Como rodar

Requisitos: Node.js 20 ou superior.

| Comando | O que faz |
| --- | --- |
| `npm ci` | Instala as dependências (scripts de instalação desativados pelo `.npmrc`). |
| `npm run build` | Confere os tipos e gera a pasta `dist/`. |
| `npm run preview` | Serve o `dist/` em `http://127.0.0.1:4173`. |
| `npm run dev` | Servidor de desenvolvimento. **A política de segurança estrita não vale aqui**; sempre teste final em `build` + `preview`. |
| `npm test` | Roda todos os testes. |
| `npm run test:coverage` | Testes com cobertura mínima exigida. |
| `npm run typecheck` | Só a checagem de tipos. |
| `npm run audit` | Procura vulnerabilidades conhecidas nas dependências. |

Abrir `dist/index.html` direto no disco (`file://`) **não funciona** (módulos ES são bloqueados). Para abrir **com duplo clique, sem Node e sem servidor**, use a versão de arquivo único:

| Comando | O que faz |
| --- | --- |
| `npm run build:standalone` | Gera `standalone/hub-dados.html`: HTML, CSS, JavaScript e fonte em **um só arquivo**. |

Como funciona: um build intermediário gera JavaScript clássico (sem módulos) com a fonte embutida no CSS; o script `scripts/make-standalone.mjs` monta o HTML único e escreve na política de segurança (CSP) o **hash sha256** do script e do estilo. Só esse código exato é aceito pelo navegador, sem `unsafe-inline`. O restante da CSP continua igual (zero rede, Trusted Types, sem frames). O arquivo gerado é versionado no repositório, e `tests/standalone.test.ts` confere que o hash bate com o conteúdo. **Sempre que o código mudar, rode `npm run build:standalone` e envie o arquivo atualizado.** Testado em Chrome e Edge reais abrindo por `file://`.

No Windows, se o PowerShell bloquear o `npm` ("execução de scripts desabilitada"), use o Prompt de Comando ou `npm.cmd`.

## 3. Estrutura do código

| Pasta | Responsabilidade |
| --- | --- |
| `src/core` | Regras de negócio, sem tela: tipos, limites, normalização de texto, ligação de colunas (matcher), unificação (merge) e pipeline (estrutura, correções, diagnóstico). |
| `src/io` | Leitura de arquivos: CSV/TSV (parser próprio) e XLSX (zip + XML), com validações de segurança. |
| `src/export` | Geração de CSV, JSON, SQL e XLSX. |
| `src/state` | Estado em memória (store) com resultado calculado e guardado em cache. |
| `src/ui` | Interface: montagem da tela, diálogos, estilos, dados de exemplo e helpers de DOM seguros. |
| `src/main.ts` | Ponto de entrada da página. |
| `src/index.ts` | API pública para quem embute o Hub em outro projeto. |
| `tests` | Testes de regras, leitura/escrita, interface, cenários realistas e política de segurança. |
| `docs` | Esta documentação, o guia de uso e o guia de publicação. |
| `.github` | Integração contínua (CI) e Dependabot. |

## 4. Como os dados fluem

1. **Leitura:** cada arquivo vira uma tabela (`colunas` + `linhas`). As linhas são **listas** (não objetos), o que impede ataques por nomes de coluna como `__proto__`.
2. **Unificação (merge):** para cada coluna de cada arquivo, o Hub procura o destino no modelo: primeiro nome igual (ignorando acento e maiúscula), depois sinônimos. Colunas sem par viram colunas novas. Uma coluna `Arquivo_Origem` registra de qual arquivo veio cada linha.
3. **Estrutura:** aplica a ordem personalizada, colunas removidas e colunas criadas à mão.
4. **Correções:** remove linhas em branco, remove repetidas, preenche vazios (nessa ordem; colunas numéricas e a de origem são poupadas).
5. **Diagnóstico:** conta linhas, colunas, células vazias e linhas repetidas.
6. **Tela e exportação:** a prévia mostra até 200 linhas; a exportação usa todas.

O resultado é recalculado a cada mudança e guardado em cache. Estrutura e correções são **regras persistentes**: continuam valendo quando arquivos entram ou saem.

### Regras de ligação de colunas

- Dois modos: **por nome** (`smart`, com sinônimos) e **por posição**.
- É possível sobrescrever manualmente cada coluna ou ignorá-la.
- Quando duas colunas de um arquivo apontam para o mesmo destino com valores diferentes, mantém-se o primeiro e o descarte é **contado e listado** (amostra de até 50). Nada some em silêncio.
- Sinônimos ficam em `src/core/matcher.ts` (`SYNONYMS`). Por exemplo, `fone`, `celular` e `tel` ligam a `telefone`. Para ensinar uma nova equivalência, acrescente o termo ao grupo correto e crie um teste.

### Limites padrão

Definidos em `src/core/limits.ts`. Podem ser ajustados por quem embute o Hub, até no máximo 4 vezes o padrão (nunca ilimitado).

| Limite | Padrão |
| --- | --- |
| Arquivos por vez | 50 |
| Tamanho por arquivo | 50 MB |
| Linhas por arquivo / no total | 200 mil / 500 mil |
| Colunas | 256 |
| Caracteres por célula | 32.767 |
| XLSX descompactado | 200 MB |
| Entradas dentro do XLSX | 2.000 |

## 5. Segurança

O detalhamento completo está em [SECURITY.md](../SECURITY.md). Resumo do que existe e por quê:

| Risco | Como é tratado |
| --- | --- |
| Dados saindo do computador | A política de segurança do navegador (CSP) proíbe qualquer conexão (`connect-src 'none'`); o código não usa rede; não há CDN. |
| XSS (código injetado por planilha ou nome de arquivo) | Nunca se usa `innerHTML`; todo texto entra como texto; atributos perigosos são recusados; Trusted Types obrigatório. |
| Fórmulas maliciosas (injeção em CSV/Excel) | No CSV, textos iniciados por `=`, `+`, `-`, `@` ganham um `'`. No XLSX gerado, tudo é texto, nunca fórmula. Ao ler, fórmulas são ignoradas (só o valor). |
| SQL injection no script gerado | Nomes e valores escapados; testado executando o SQL de verdade. |
| Arquivo-bomba (zip, XML) | Tamanho e quantidade verificados antes de descompactar; XML com `DOCTYPE`/`ENTITY` é recusado. |
| Arquivo enorme ou disfarçado | Limites de tamanho; binários (PK, PDF, EXE, ELF) e bytes nulos rejeitados em CSV. |
| Formatos legados | `.xls`, `.xlsm`, `.xlsb` recusados. |
| Dados esquecidos | Nada é gravado (sem localStorage, cookies, cache); "Limpar tudo" apaga a memória. |
| Cadeia de suprimentos | Uma dependência de produção, versão fixa, `package-lock.json`, `ignore-scripts`, `npm audit` no CI, Dependabot. |

Os testes em `tests/security.test.ts` **falham** se alguém introduzir `innerHTML`, `eval`, `fetch`, armazenamento do navegador, workers, `unsafe-inline` na CSP ou uma nova dependência de produção.

**Fora do alcance do Hub** (precisa ser tratado pela empresa): acesso físico ou administrativo à máquina, extensões de navegador com acesso à página, e cabeçalhos HTTP como `frame-ancestors` e HSTS, que só funcionam configurados no servidor.

## 6. Interface e design

- Tema roxo `#660099`, com acentos verde-limão, cartões brancos e conectores pontilhados entre as etapas, inspirado no projeto anterior.
- **Tema claro ou escuro automático**, conforme o sistema do usuário (CSS `prefers-color-scheme`, sem script, sem gravar nada).
- Fonte Plus Jakarta Sans **hospedada localmente** (pacote `@fontsource`, só em desenvolvimento), para não usar Google Fonts e manter a CSP estrita.
- Cores e espaçamentos estão em variáveis no topo de `src/ui/styles.css`. Para trocar o roxo, altere `--purple-brand` e `--purple-brand-hover` (e, se quiser, as demais variáveis `--purple-*`, que foram escolhidas à mão).
- Recursos de clareza: faixa de próximo passo, destaque da etapa atual, dados de exemplo, origem de cada coluna na prévia, avisos com botões de ação e confirmação em "Limpar tudo".
- Acessibilidade: diálogos nativos (`<dialog>`), navegação por teclado, foco visível, regiões anunciadas por leitor de tela, respeito a "reduzir movimento".

## 7. Embutir em outro projeto

```ts
import { mountHub } from 'hub-dados';
import 'hub-dados/src/ui/styles.css';

const hub = mountHub(document.getElementById('hub')!, {
  limits: { maxFiles: 10 },
  onChange: (grid) => console.log(grid?.rows.length),
});

hub.getResult(); // { columns, rows, sourceColumn } ou null
hub.destroy();   // apaga a memória e desmonta
```

O núcleo (`core`, `io`, `export`, `state`) funciona sem tela e pode ser usado separadamente. Ao embutir, mantenha a política de segurança (CSP) do `index.html` na página que hospeda o Hub. O isolamento visual por shadow DOM **não foi implementado**: os estilos do Hub podem interagir com os da página hospedeira.

## 8. Publicação

O resultado é a pasta `dist/`, servida por HTTPS em um servidor estático interno. Exemplos para nginx e IIS, a lista de cabeçalhos recomendados e um checklist estão em [DEPLOY.md](DEPLOY.md).

Antes de liberar para todos, faça um **piloto** com algumas planilhas reais (não sensíveis) e peça feedback.

## 9. Testes e qualidade

- Cerca de 109 testes automatizados, com cobertura de linhas acima de 99% e mínimos exigidos de 90% (linhas, funções, instruções) e 80% (ramificações).
- Categorias: regras de negócio, leitura e escrita de arquivos (incluindo XLSX feito à mão, XML malicioso e zip-bomba), exportação (o SQL é executado de verdade), estado, interface (XSS por nome de arquivo e conteúdo de célula), cenários realistas (CSV brasileiro, Windows-1252, Excel, 100 mil linhas) e política de segurança.
- O CI (`.github/workflows/ci.yml`) roda tipos, testes, build e auditoria a cada alteração.
- O Dependabot abre propostas de atualização de dependências.

## 10. Limitações conhecidas

- **Não foi testado com planilhas reais da empresa**, apenas com arquivos montados em testes e dados de exemplo.
- A ligação por nome é heurística: nomes como "Valor Total" **não** casam com "Valor" e viram coluna nova. O usuário corrige em "Mapeamento".
- Números em formato brasileiro (`1.234,50`) permanecem como texto.
- Em arquivos com várias abas, é usada a maior; não há seletor de aba.
- Fórmulas são lidas só pelo valor exibido; formatação do Excel não é preservada.
- Datas do Excel viram texto `AAAA-MM-DD`.
- O layout foi verificado em tela larga e sem rolagem horizontal em 390 px, mas não foi inspecionado em detalhe no celular.
- Isolamento por shadow DOM para embutir e cabeçalhos HTTP dependem de trabalho futuro e do servidor.

## 11. Manutenção

- **Dependências:** revise e aceite as propostas do Dependabot; rode `npm run audit` e `npm test` depois.
- **Nova dependência de produção:** exige revisão de segurança e alteração consciente do teste que hoje permite só `fflate`.
- **Novo recurso de entrada ou saída de dados:** deve vir com teste de segurança correspondente.
- **Novo limite ou validação:** sempre com teste.
- **Sinônimos:** ajuste em `src/core/matcher.ts` com teste.
- **Mensagens e textos da tela:** estão em `src/ui/app.ts` e `src/ui/dialogs.ts`.

## 12. Glossário

| Termo | Significado |
| --- | --- |
| Modelo | Planilha que define as colunas e a ordem do resultado. |
| Merge / unificação | Juntar as linhas de vários arquivos em uma tabela. |
| Mapeamento | Ligação entre uma coluna do arquivo e uma coluna do resultado. |
| CSP | Política de segurança do navegador que limita o que a página pode fazer (por exemplo, conectar à internet). |
| Trusted Types | Recurso do navegador que bloqueia injeção de HTML por script. |
| LGPD | Lei Geral de Proteção de Dados. |
| Zip-bomba | Arquivo compactado minúsculo que explode em gigabytes ao abrir. |
| Injeção de fórmula | Texto que o Excel executaria como fórmula ao abrir um CSV. |
