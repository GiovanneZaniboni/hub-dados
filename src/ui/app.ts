import { HubError, type Limits } from '../core/limits';
import type { Grid } from '../core/pipeline';
import type { MapMode } from '../core/types';
import { buildCsv, buildJson, buildSql } from '../export/text-formats';
import { buildXlsx } from '../export/xlsx-writer';
import { readFile } from '../io/read-file';
import { createStore, type HubStore } from '../state/store';
import { downloadBlob, formatBytes, formatInt, h, replaceChildrenOf } from './dom';
import { openFixDialog, openMappingDialog, openStructureDialog } from './dialogs';

export interface HubOptions {
  limits?: Partial<Limits>;
  /** Chamado a cada recálculo, com o resultado atual (ou null). Útil para quem embute o Hub. */
  onChange?: (grid: Grid | null) => void;
}

export interface HubHandle {
  getResult(): Grid | null;
  clear(): void;
  destroy(): void;
}

const PREVIEW_ROWS = 200;
const ACCEPT = '.xlsx,.csv,.tsv,.txt';

export function mountHub(root: HTMLElement, options: HubOptions = {}): HubHandle {
  const store: HubStore = createStore(options.limits);

  // ---- regiões dinâmicas --------------------------------------------------
  const live = h('div', { class: 'live', attrs: { role: 'status', 'aria-live': 'polite' } });
  const alerts = h('div', { class: 'alerts', attrs: { role: 'alert' } });
  const modelBox = h('div', { class: 'stack' });
  const filesBox = h('div', { class: 'stack' });
  const resultBox = h('div', { class: 'stack' });
  const noticesBox = h('div', { class: 'stack' });
  const previewBox = h('div', { class: 'preview-wrap' });
  const toolbar = h('div', { class: 'toolbar' });

  const say = (text: string): void => {
    live.textContent = text;
  };
  const fail = (text: string): void => {
    alerts.replaceChildren(h('p', { class: 'alert', text }));
  };
  const dismissAlerts = (): void => alerts.replaceChildren();

  // ---- leitura de arquivos --------------------------------------------------
  async function ingest(files: File[], asModel: boolean): Promise<void> {
    dismissAlerts();
    const problems: string[] = [];
    let added = 0;
    say(`Lendo ${files.length} arquivo(s)…`);
    for (const file of files) {
      try {
        const table = await readFile(file, store.limits);
        if (asModel) store.setModel(file.name, file.size, table);
        else store.addFile(file.name, file.size, table);
        added++;
        for (const w of table.warnings) problems.push(`${file.name}: ${w}`);
      } catch (e) {
        problems.push(`${file.name}: ${e instanceof HubError ? e.message : 'não foi possível ler o arquivo.'}`);
      }
      if (asModel) break;
    }
    if (problems.length > 0) {
      alerts.replaceChildren(
        h('p', { class: 'alert-title', text: 'Atenção:' }),
        h('ul', { class: 'alert' }, ...problems.map((p) => h('li', { text: p }))),
      );
    }
    say(added > 0 ? `${added} arquivo(s) carregado(s).` : 'Nenhum arquivo foi carregado.');
  }

  function fileInput(id: string, multiple: boolean, asModel: boolean): HTMLInputElement {
    return h('input', {
      class: 'visually-hidden',
      attrs: { type: 'file', id, accept: ACCEPT, ...(multiple ? { multiple: '' } : {}) },
      on: {
        change: (ev) => {
          const input = ev.currentTarget as HTMLInputElement;
          const picked = Array.from(input.files ?? []);
          input.value = '';
          if (picked.length > 0) void ingest(picked, asModel);
        },
      },
    });
  }

  function dropzone(input: HTMLInputElement, label: string, hint: string, asModel: boolean): HTMLElement {
    const zone = h(
      'label',
      {
        class: 'dropzone',
        attrs: { for: input.id },
        on: {
          dragover: (ev) => {
            ev.preventDefault();
            zone.classList.add('is-over');
          },
          dragleave: () => zone.classList.remove('is-over'),
          drop: (ev) => {
            ev.preventDefault();
            zone.classList.remove('is-over');
            const dropped = Array.from(ev.dataTransfer?.files ?? []);
            if (dropped.length > 0) void ingest(dropped, asModel);
          },
        },
      },
      h('span', { class: 'dropzone-label', text: label }),
      h('span', { class: 'hint', text: hint }),
    );
    return h('div', {}, input, zone);
  }

  const modelInput = fileInput('model-input', false, true);
  const filesInput = fileInput('files-input', true, false);

  // ---- renderização ------------------------------------------------------------
  function renderModel(): void {
    const { model, includeModelRows } = store.getState();
    if (!model) {
      replaceChildrenOf(
        modelBox,
        dropzone(modelInput, 'Escolher arquivo modelo', 'Define as colunas de destino (.xlsx, .csv, .tsv)', true),
      );
      return;
    }
    replaceChildrenOf(
      modelBox,
      modelInput,
      h(
        'div',
        { class: 'chip' },
        h('div', { class: 'chip-main' }, h('strong', { text: model.name }), h('span', { class: 'hint', text: `${model.table.columns.length} colunas · ${formatInt(model.table.rows.length)} linhas · ${formatBytes(model.bytes)}` })),
        h('button', {
          class: 'btn btn-quiet',
          text: 'Trocar',
          attrs: { type: 'button' },
          on: { click: () => modelInput.click() },
        }),
        h('button', {
          class: 'btn btn-quiet',
          text: 'Remover',
          attrs: { type: 'button', 'aria-label': `Remover o modelo ${model.name}` },
          on: { click: () => store.removeModel() },
        }),
      ),
      model.table.rows.length > 0
        ? h(
            'label',
            { class: 'check' },
            h('input', {
              attrs: { type: 'checkbox', ...(includeModelRows ? { checked: '' } : {}) },
              on: { change: (ev) => store.setIncludeModelRows((ev.currentTarget as HTMLInputElement).checked) },
            }),
            ' Incluir as linhas de dados do modelo no resultado',
          )
        : null,
    );
  }

  function renderFiles(): void {
    const { files } = store.getState();
    const computed = store.getComputed();
    replaceChildrenOf(
      filesBox,
      dropzone(filesInput, 'Adicionar arquivos para unificar', `.xlsx, .csv, .tsv · até ${store.limits.maxFiles} arquivos`, false),
      files.length === 0
        ? h('p', { class: 'hint', text: 'Nenhum arquivo na fila.' })
        : h(
            'ul',
            { class: 'file-list' },
            ...files.map((f) => {
              const entries = computed?.merge.mappings[f.id] ?? [];
              const unmatched = entries.filter((e) => e.kind === 'new').length;
              return h(
                'li',
                { class: 'chip' },
                h(
                  'div',
                  { class: 'chip-main' },
                  h('strong', { text: f.name }),
                  h('span', { class: 'hint', text: `${f.table.columns.length} colunas · ${formatInt(f.table.rows.length)} linhas · ${formatBytes(f.bytes)}${unmatched ? ` · ${unmatched} sem par no modelo` : ''}` }),
                ),
                h('button', {
                  class: 'btn btn-quiet',
                  text: 'Mapeamento',
                  attrs: { type: 'button', 'aria-label': `Revisar o mapeamento de colunas de ${f.name}` },
                  on: { click: (ev) => openMappingDialog(store, f.id, ev.currentTarget as HTMLElement) },
                }),
                h('button', {
                  class: 'btn btn-quiet',
                  text: 'Remover',
                  attrs: { type: 'button', 'aria-label': `Remover ${f.name} da fila` },
                  on: { click: () => store.removeFile(f.id) },
                }),
              );
            }),
          ),
      h(
        'fieldset',
        { class: 'modes' },
        h('legend', { text: 'Como casar as colunas' }),
        modeRadio('smart', 'Nome e sinônimos', 'Compara nomes sem acento/maiúscula e usa um dicionário de sinônimos.'),
        modeRadio('position', 'Posição', 'Usa a ordem das colunas do modelo. Cuidado se a ordem variar entre arquivos.'),
      ),
    );
  }

  function modeRadio(mode: MapMode, title: string, hint: string): HTMLElement {
    const checked = store.getState().mode === mode;
    return h(
      'label',
      { class: 'radio' },
      h('input', {
        attrs: { type: 'radio', name: 'map-mode', value: mode, ...(checked ? { checked: '' } : {}) },
        on: { change: () => store.setMode(mode) },
      }),
      h('span', {}, h('strong', { text: title }), h('span', { class: 'hint', text: hint })),
    );
  }

  function exportAs(format: 'xlsx' | 'csv' | 'json' | 'sql'): void {
    const grid = store.getComputed()?.grid;
    if (!grid || grid.rows.length === 0) {
      fail('Não há dados para exportar.');
      return;
    }
    dismissAlerts();
    try {
      if (format === 'xlsx') {
        const bytes = buildXlsx(grid);
        downloadBlob(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'dados_unificados.xlsx');
      } else if (format === 'csv') {
        downloadBlob(new Blob([buildCsv(grid)], { type: 'text/csv;charset=utf-8' }), 'dados_unificados.csv');
      } else if (format === 'json') {
        downloadBlob(new Blob([buildJson(grid)], { type: 'application/json;charset=utf-8' }), 'dados_unificados.json');
      } else {
        downloadBlob(new Blob([buildSql(grid)], { type: 'text/plain;charset=utf-8' }), 'dados_unificados.sql');
      }
      say(`Arquivo ${format.toUpperCase()} gerado.`);
    } catch (e) {
      fail(e instanceof HubError ? e.message : 'Falha ao gerar o arquivo.');
    }
  }

  const metric = (label: string, value: string): HTMLElement =>
    h('div', { class: 'metric' }, h('dt', { text: label }), h('dd', { text: value }));

  function renderResult(): void {
    const c = store.getComputed();
    if (!c) {
      replaceChildrenOf(resultBox, h('p', { class: 'hint', text: 'Carregue um modelo e/ou arquivos para ver o resultado.' }));
      replaceChildrenOf(noticesBox);
      replaceChildrenOf(previewBox, h('p', { class: 'hint', text: 'A prévia aparece aqui.' }));
      replaceChildrenOf(toolbar);
      return;
    }
    const d = c.diagnostics;
    const formats: ['xlsx' | 'csv' | 'json' | 'sql', string][] = [['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV'], ['json', 'JSON'], ['sql', 'SQL (SQLite)']];
    replaceChildrenOf(
      resultBox,
      h('dl', { class: 'metrics' }, metric('Linhas', formatInt(d.rows)), metric('Colunas', formatInt(d.columns)), metric('Células vazias', formatInt(d.emptyCells)), metric('Linhas duplicadas', formatInt(d.duplicateRows))),
      h(
        'div',
        { class: 'actions', attrs: { role: 'group', 'aria-label': 'Exportar resultado' } },
        ...formats.map(([f, label], i) =>
          h('button', {
            class: i === 0 ? 'btn btn-primary' : 'btn',
            text: i === 0 ? `Baixar ${label}` : label,
            attrs: { type: 'button' },
            on: { click: () => exportAs(f) },
          }),
        ),
      ),
    );

    // avisos: nada é descartado em silêncio
    const notes: HTMLElement[] = [];
    if (c.merge.collisionCount > 0) {
      notes.push(
        h(
          'details',
          { class: 'notice notice-warn' },
          h('summary', { text: `${formatInt(c.merge.collisionCount)} valor(es) divergente(s) foram descartados (duas colunas no mesmo destino)` }),
          h('ul', {}, ...c.merge.collisions.slice(0, 10).map((x) => h('li', { text: `${x.file}, linha ${x.row}, coluna "${x.column}": mantido "${x.kept}", descartado "${x.discarded}"` }))),
        ),
      );
    }
    for (const dup of c.merge.duplicateTargets) {
      notes.push(h('p', { class: 'notice notice-warn', text: `${dup.file}: as colunas ${dup.sources.map((s) => `"${s}"`).join(' e ')} apontam para "${dup.target}". Revise o mapeamento.` }));
    }
    if (store.getState().mode === 'position' && store.getState().model) {
      const width = store.getState().model?.table.columns.length ?? 0;
      for (const f of store.getState().files) {
        if (f.table.columns.length > width) notes.push(h('p', { class: 'notice', text: `${f.name}: ${f.table.columns.length - width} coluna(s) além do modelo foram mantidas como novas.` }));
      }
    }
    if (d.rowsWithEmpty > 0) notes.push(h('p', { class: 'notice', text: `${formatInt(d.rowsWithEmpty)} linha(s) com campos vazios. Use "Corrigir dados" para tratar.` }));
    else if (d.rows > 0) notes.push(h('p', { class: 'notice notice-ok', text: 'Nenhuma inconsistência encontrada.' }));
    replaceChildrenOf(noticesBox, ...notes);

    replaceChildrenOf(
      toolbar,
      h('button', { class: 'btn', text: 'Editar estrutura', attrs: { type: 'button' }, on: { click: (ev) => openStructureDialog(store, ev.currentTarget as HTMLElement) } }),
      h('button', { class: 'btn', text: 'Corrigir dados', attrs: { type: 'button' }, on: { click: (ev) => openFixDialog(store, ev.currentTarget as HTMLElement) } }),
    );

    // prévia (somente texto, limitada)
    const { grid } = c;
    const shown = grid.rows.slice(0, PREVIEW_ROWS);
    replaceChildrenOf(
      previewBox,
      h(
        'div',
        { class: 'table-scroll', attrs: { tabindex: '0', role: 'region', 'aria-label': 'Prévia dos dados unificados' } },
        h(
          'table',
          {},
          h('caption', { class: 'visually-hidden', text: `Prévia: ${formatInt(shown.length)} de ${formatInt(grid.rows.length)} linhas` }),
          h('thead', {}, h('tr', {}, h('th', { attrs: { scope: 'col' }, text: '#' }), ...grid.columns.map((col) => h('th', { attrs: { scope: 'col' }, text: col })))),
          h(
            'tbody',
            {},
            ...shown.map((r, i) =>
              h('tr', {}, h('th', { attrs: { scope: 'row' }, text: String(i + 1) }), ...grid.columns.map((_, j) => h('td', { class: (r[j] ?? '') === '' ? 'is-empty' : '', text: r[j] ?? '' }))),
            ),
          ),
        ),
      ),
      grid.rows.length > PREVIEW_ROWS ? h('p', { class: 'hint', text: `Mostrando as primeiras ${PREVIEW_ROWS} de ${formatInt(grid.rows.length)} linhas. A exportação inclui todas.` }) : null,
    );
  }

  function render(): void {
    renderModel();
    renderFiles();
    renderResult();
    options.onChange?.(store.getComputed()?.grid ?? null);
  }

  const unsubscribe = store.subscribe(render);

  // ---- esqueleto estático ---------------------------------------------------------
  const clearButton = h('button', {
    class: 'btn btn-danger',
    text: 'Limpar tudo',
    attrs: { type: 'button', title: 'Apaga todos os dados carregados desta sessão' },
    on: {
      click: () => {
        store.clearAll();
        dismissAlerts();
        say('Todos os dados foram apagados da memória.');
      },
    },
  });

  const section = (id: string, title: string, ...body: Node[]): HTMLElement =>
    h('section', { class: 'panel', attrs: { 'aria-labelledby': id } }, h('h2', { text: title, attrs: { id } }), ...body);

  const shell = h(
    'div',
    { class: 'hub' },
    h(
      'header',
      { class: 'hub-header' },
      h('div', {}, h('h1', { text: 'Hub de Dados' }), h('p', { class: 'lede', text: 'Unifique planilhas a partir de um modelo de colunas.' })),
      h('p', { class: 'privacy', attrs: { role: 'note' }, text: 'Processamento 100% local. Nenhum dado sai deste computador e nada é gravado em disco.' }),
      clearButton,
    ),
    live,
    alerts,
    h(
      'main',
      { class: 'grid' },
      h('div', { class: 'col' }, section('h-model', '1. Modelo', modelBox), section('h-files', '2. Arquivos', filesBox)),
      h('div', { class: 'col' }, section('h-result', '3. Resultado', resultBox, noticesBox, toolbar)),
      h('div', { class: 'col col-wide' }, section('h-preview', 'Prévia', previewBox)),
    ),
  );

  root.replaceChildren(shell);
  render();

  return {
    getResult: () => store.getComputed()?.grid ?? null,
    clear: () => store.clearAll(),
    destroy: () => {
      unsubscribe();
      store.clearAll();
      root.replaceChildren();
    },
  };
}

