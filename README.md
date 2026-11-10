# Hub de Dados

Unifica planilhas (`.xlsx`, `.csv`, `.tsv`) a partir de um **modelo** de colunas: casa colunas por nome e sinônimos (ou por posição), consolida as linhas, mostra inconsistências e exporta em Excel, CSV, JSON ou SQL (SQLite).

Pensado para uso interno em empresa com dados sensíveis (LGPD):

- **100% local**: roda inteiro no navegador. Nenhum dado é enviado a lugar nenhum (`connect-src 'none'`).
- **Sem persistência**: tudo fica só em memória; fechar a aba apaga. Botão "Limpar tudo" apaga na hora.
- **Sem Python e sem backend**: só HTML, CSS e TypeScript. Nada para instalar ou manter no servidor.
- **Uma única dependência de runtime** (`fflate`, para zip), com versão exata e lockfile.

Guia para quem vai usar (pode enviar às pessoas): [docs/GUIA-DE-USO.md](docs/GUIA-DE-USO.md). Detalhes do modelo de segurança em [SECURITY.md](SECURITY.md); como publicar em [docs/DEPLOY.md](docs/DEPLOY.md).

## Usar

```bash
npm ci                 # instala (scripts de instalação desabilitados via .npmrc)
npm run build          # gera dist/ (HTML + JS + CSS estáticos)
npm run preview        # http://127.0.0.1:4173
```

### Arquivo único (abre com duplo clique)

Para quem não pode instalar Node nem rodar servidor: [standalone/hub-dados.html](standalone/hub-dados.html) é o app inteiro (HTML + CSS + JavaScript + fonte) em **um só arquivo**. Baixe e abra no Chrome ou Edge. Para regenerar depois de mudar o código: `npm run build:standalone`. O script e o estilo são liberados na CSP por hash (sem `unsafe-inline`), e um teste confere que o arquivo está íntegro. Se o PowerShell bloquear o `npm` no Windows, use o Prompt de Comando ou `npm.cmd`.

Em desenvolvimento use `npm run dev`. O servidor de dev do Vite injeta código inline para HMR, então **a CSP estrita só vale em `build` + `preview`**; teste sempre por lá.

Fluxo: (1) escolha o **modelo** (define as colunas de destino); (2) adicione os **arquivos**; (3) confira avisos, ajuste o mapeamento, a estrutura e as correções; (4) exporte.

## O que é verificado e avisado (nada é descartado em silêncio)

| Situação | Comportamento |
| --- | --- |
| Duas colunas de origem no mesmo destino com valores diferentes | Mantém o primeiro, **conta e lista** os descartados |
| Coluna sem par no modelo | Preservada como coluna nova |
| Linha com mais campos que o cabeçalho | Cria colunas extras e avisa |
| Arquivo ilegível, grande demais ou formato não suportado | Rejeitado com mensagem; não entra vazio na fila |
| Cabeçalhos vazios/duplicados | `Coluna_N`, `Nome (2)` |
| Datas do Excel | Convertidas para `AAAA-MM-DD` (e hora, se houver) |
| Colunas 100% numéricas | Exportadas como número no `.xlsx`; poupadas do "preencher vazios" |
| Zeros à esquerda (`007`) | Preservados como texto |

Correções ("Corrigir vazios e repetidos") e edição de estrutura ("Reordenar ou remover colunas") são **regras persistentes**: continuam valendo ao adicionar/remover arquivos.

Formatos aceitos: `.xlsx`, `.csv`, `.tsv`, `.txt`. **`.xls`, `.xlsm` e `.xlsb` são recusados por segurança** (salve como `.xlsx`).

Limites (ajustáveis, no máximo 4x): 50 arquivos, 50 MB por arquivo, 200 mil linhas por arquivo, 500 mil no total, 256 colunas, 32.767 caracteres por célula.

## Embutir em outro projeto

```ts
import { mountHub } from 'hub-dados';       // src/index.ts
import 'hub-dados/src/ui/styles.css';

const hub = mountHub(document.getElementById('hub')!, {
  limits: { maxFiles: 10 },
  onChange: (grid) => console.log(grid?.rows.length),
});
hub.getResult();  // { columns, rows, sourceColumn } | null
hub.destroy();    // apaga os dados da memória e desmonta
```

O núcleo (`core`, `io`, `export`, `state`) não depende de DOM e pode ser usado sem a interface (`createStore`, `readBytes`, `mergeTables`, `buildCsv`...). Ao embutir, mantenha a CSP do `index.html` (veja SECURITY.md).

## Visual

Tema roxo `#660099` com acentos lime, cartões e conectores pontilhados entre as etapas. O tema **claro ou escuro acompanha a preferência do sistema** operacional/navegador (CSS `prefers-color-scheme`, sem script e sem gravar nada), então não há botão de troca. A fonte Plus Jakarta Sans é **hospedada localmente** (pacote `@fontsource`, só em desenvolvimento, licença OFL), então nenhuma requisição a Google Fonts ou CDN é feita e a CSP continua estrita. As cores ficam em variáveis no topo de `src/ui/styles.css`.

## Estrutura

```
src/core     tipos, limites, texto, matcher (sinônimos), merge, pipeline (estrutura, correções, diagnóstico)
src/io       leitores CSV (parser RFC 4180 próprio) e XLSX (zip + XML, com limites)
src/export   CSV/JSON/SQL e escritor XLSX (sem fórmulas)
src/state    store em memória, com resultado derivado e memoizado
src/ui       interface (DOM seguro, sem innerHTML), diálogos e estilos
tests        unitários, de interface (happy-dom) e de política de segurança
```

## Testes

```bash
npm test                 # unitários + interface + política de segurança
npm run test:coverage    # com limites mínimos de cobertura
npm run typecheck
npm run audit
```

Os testes de segurança falham se alguém introduzir `innerHTML`, `fetch`, `eval`, storage, workers, `unsafe-inline` na CSP, dependências de runtime novas etc.
