# Hub de Dados — Guia de uso

**Para que serve:** juntar várias planilhas (Excel ou CSV) em uma só, com as colunas na ordem e com os nomes que você escolher. Depois você baixa o resultado em Excel, CSV, JSON ou SQL.

**Exemplo do dia a dia:** você tem a lista de clientes do CRM, a da loja e a do financeiro. Cada uma chama as colunas de um jeito (`cliente`, `Nome`, `NOME`). O Hub reconhece que são a mesma coisa e entrega uma tabela única.

---

## 1. Sobre os seus dados (leia primeiro)

- **Nada sai do seu computador.** O Hub roda inteiro dentro do navegador. Ele não envia arquivo nenhum para a internet nem para um servidor.
- **Nada é salvo.** Os dados ficam só na memória da aba. Se você fechar a aba ou clicar em **Limpar tudo**, tudo some.
- **Seus arquivos originais não são alterados.** O Hub só lê. O resultado é um arquivo novo que você baixa.
- O arquivo baixado vai para a sua pasta de Downloads e **depois disso é responsabilidade sua**: guarde ou apague conforme a política da empresa para dados pessoais (LGPD).

---

## 2. Passo a passo

### Etapa 1 — Arquivo Modelo (opcional)
O modelo é uma planilha que **só precisa ter a linha de títulos** das colunas que você quer no resultado. Exemplo: `Nome | E-mail | Telefone | Valor`.

- Com modelo: o resultado terá exatamente essas colunas, nessa ordem.
- Sem modelo: as colunas vêm dos próprios arquivos.
- Se o modelo também tiver linhas de dados, marque ou desmarque "Incluir as linhas de dados do modelo no resultado".

### Etapa 2 — Arquivos para unificar
Clique em **Fazer upload dos arquivos** (ou arraste os arquivos para a área tracejada) e escolha todas as planilhas que quer juntar. Pode escolher vários de uma vez.

- **A primeira linha de cada arquivo deve ser o cabeçalho** (os nomes das colunas).
- Formatos aceitos: **.xlsx, .csv, .tsv, .txt**.
- Para tirar um arquivo da fila, clique em **Remover**.
- Se o arquivo tiver várias abas, o Hub usa **a maior** e avisa qual foi usada.

### Etapa 3 — Como unificar
Escolha como as colunas dos arquivos são ligadas às do modelo:

- **Pelo nome da coluna (recomendado):** reconhece nomes parecidos, mesmo com acento, maiúscula ou sinônimo (por exemplo `email` e `E-mail`, `cliente` e `Nome`, `fone` e `Telefone`).
- **Pela ordem das colunas:** a 1ª coluna do arquivo vira a 1ª do modelo, a 2ª vira a 2ª, e assim por diante. Use quando os arquivos têm as colunas na mesma ordem, mas com nomes muito diferentes.

Na dúvida, deixe a opção recomendada.

### Conferir e ajustar
O resultado aparece em **Prévia dos dados**. Em cada coluna, uma linha pequena mostra de onde ela veio quando o nome mudou (por exemplo `← cliente`). Células vazias ficam destacadas em laranja.

Botões úteis:

| Botão | Para que serve |
| --- | --- |
| **Mapeamento** (ao lado de cada arquivo) | Ver e trocar, coluna por coluna, para onde cada coluna do arquivo vai. Também permite ignorar uma coluna. |
| **Reordenar ou remover colunas** | Mudar a ordem, apagar colunas do resultado ou criar uma coluna nova vazia. |
| **Corrigir vazios e repetidos** | Remover linhas totalmente em branco, remover linhas repetidas e/ou preencher células vazias com um texto (por exemplo `N/D`). Colunas só de números não são preenchidas. |
| **Limpar tudo** | Apaga tudo da memória. Pede um segundo clique para confirmar. |

As correções e a ordem das colunas são **regras que continuam valendo** quando você adiciona ou remove arquivos.

### Exportar
No cartão **dados_unificados**, escolha o formato:

| Formato | Quando usar |
| --- | --- |
| **Excel (.xlsx)** | Para abrir e editar no Excel. É o mesmo do botão verde **Baixar arquivo final**. |
| **CSV** | Para importar em outro sistema. |
| **JSON** | Para integrações e programas. |
| **SQL** | Para carregar em um banco de dados (script no padrão SQLite). |

A prévia mostra as 200 primeiras linhas, mas **o arquivo exportado tem todas**.

---

## 3. Entendendo os avisos

| Aviso | O que significa | O que fazer |
| --- | --- | --- |
| **Nenhuma inconsistência encontrada** (verde) | Tudo preenchido e integrado. | Pode exportar. |
| **Confira antes de exportar** (laranja) | Há linhas com campo vazio, linhas repetidas ou valores ignorados. | Leia o texto; use os botões do aviso. |
| **valores ignorados** | Duas colunas do mesmo arquivo foram para o mesmo destino e tinham valores diferentes. O Hub manteve o primeiro. | Clique em **Ver valores ignorados** para ver quais. Se não for o desejado, ajuste em **Mapeamento**. |
| **coluna nova** (na prévia) | Uma coluna do arquivo não achou par no modelo. Ela **não é descartada**: vira uma coluna a mais. | Se era para casar com uma coluna do modelo, ajuste em **Mapeamento**. Se não precisa dela, remova em **Reordenar ou remover colunas**. |
| Arquivo rejeitado (vermelho) | Formato não suportado, arquivo grande demais ou ilegível. | Veja o motivo na mensagem. |

> **Importante:** o reconhecimento automático por nome é uma ajuda, não uma garantia. Por exemplo, a coluna `Valor Total` **não** é reconhecida como `Valor`: ela aparece como coluna nova. **Sempre confira a prévia antes de usar o resultado em algo importante.**

---

## 4. Limites e o que não funciona

- Até **50 arquivos** por vez, **50 MB** cada, **200 mil linhas** por arquivo e **500 mil** no total; até 256 colunas.
- **Não funcionam:** `.xls` (Excel antigo), `.xlsm` (com macros), `.xlsb`. São recusados de propósito, por segurança. Abra no Excel e use **Salvar como → Pasta de Trabalho do Excel (.xlsx)**.
- **Fórmulas:** o Hub lê só o **valor** que a fórmula mostra, não a fórmula. Formatação (cores, bordas) não é mantida.
- **Datas** do Excel viram texto no formato `AAAA-MM-DD`.
- **Números no formato brasileiro** (`1.234,50`) são tratados como texto e mantidos como estão; o Hub não converte.
- **Zeros à esquerda** (`007`, CPF) são preservados.
- **Segurança de planilha:** textos que começam com `=`, `+`, `-` ou `@` recebem um `'` na frente no CSV, para o Excel não executá-los como fórmula. Isso protege você, mas altera o texto original nesses casos.

---

## 5. Problemas comuns

| Problema | Solução |
| --- | --- |
| "Formato não suportado" | Salve como `.xlsx` ou `.csv`. |
| Acentos estranhos (`Ã§`) | Salve o CSV como UTF-8 no Excel (*CSV UTF-8*). O Hub também entende o CSV padrão do Excel brasileiro. |
| Colunas aparecem como "coluna nova" | Os nomes são diferentes demais. Use **Mapeamento** para indicar o destino, ou a opção "Pela ordem das colunas". |
| O botão **Baixar** não faz nada | Verifique se o navegador não bloqueou o download. |
| Perdi tudo ao atualizar a página | É proposital: nada é salvo. Carregue os arquivos de novo. |
| Quero testar sem arquivo real | Na tela inicial, clique em **Ver com dados de exemplo**. |

---

## 6. Para a equipe de TI

O Hub é um **site estático** (HTML, CSS e JavaScript), sem servidor, sem banco e sem Python. Basta publicar a pasta `dist/` em um servidor web interno.

```bash
npm ci          # instala (scripts de instalação desativados)
npm run build   # gera a pasta dist/
```

- Detalhes de publicação, cabeçalhos HTTP e exemplos de nginx/IIS: [DEPLOY.md](DEPLOY.md).
- Modelo de segurança e o que **não** está coberto: [../SECURITY.md](../SECURITY.md).
- Resumo: política de segurança de conteúdo (CSP) estrita sem nenhuma conexão externa, sem armazenamento no navegador, uma única dependência de produção (`fflate`) com versão fixa, sem vulnerabilidades conhecidas na última auditoria (`npm audit`), 105 testes automatizados.
- **Configure no servidor** os cabeçalhos `frame-ancestors` e HSTS (só funcionam como cabeçalho HTTP).
- Tema claro ou escuro automático, conforme o sistema do usuário.
- O Hub pode ser embutido em outro sistema (veja o README).

**Ainda não validado:** o Hub foi testado com planilhas montadas em testes automatizados e com dados de exemplo, **não com planilhas reais da empresa**. Recomenda-se um piloto com algumas planilhas reais (não sensíveis) antes de liberar para todos.
