import { HubError, type Limits } from '../core/limits';
import type { Grid } from '../core/pipeline';
import type { MapMode } from '../core/types';
import { buildCsv, buildJson, buildSql } from '../export/text-formats';
import { buildXlsx } from '../export/xlsx-writer';
import { readFile } from '../io/read-file';
import { createStore, type HubStore } from '../state/store';
import { openFixDialog, openMappingDialog, openStructureDialog } from './dialogs';
import { makeSample } from './sample';
import { downloadBlob, formatBytes, formatInt, h, icon, replaceChildrenOf, type IconName } from './dom';

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

const FORMAT_HELP: Record<'xlsx' | 'csv' | 'json' | 'sql', string> = {
  xlsx: 'Para abrir e editar no Excel',
  csv: 'Para importar em outro sistema',
  json: 'Para integrações e programas',
  sql: 'Para carregar em um banco de dados (SQLite)',
};

const PREVIEW_ROWS = 200;
const ACCEPT = '.xlsx,.csv,.tsv,.txt';

type Format = 'xlsx' | 'csv' | 'json' | 'sql';
const FORMATS: [Format, string][] = [
  ['xlsx', 'Excel'],
  ['csv', 'CSV'],
  ['json', 'JSON'],
  ['sql', 'SQL'],
];

interface StageSpec {
  tag: string;
  title: string;
  desc: string;
  icon: IconName;
  badge: HTMLElement;
  labelId: string;
}

function stageCard(spec: StageSpec, ...body: (Node | null)[]): HTMLElement {
  return h(
    'section',
    { class: 'stage-card', attrs: { 'aria-labelledby': spec.labelId } },
    h(
      'div',
      { class: 'card-top' },
      h(
        'div',
        { class: 'card-top-left' },
        h('div', { class: 'stage-icon' }, icon(spec.icon, 20)),
        h('div', {}, h('span', { class: 'stage-tag', text: spec.tag }), h('h2', { class: 'stage-title', text: spec.title, attrs: { id: spec.labelId } })),
      ),
      spec.badge,
    ),
    h('p', { class: 'stage-desc', text: spec.desc }),
    ...body,
  );
}

const connectorV = (): HTMLElement => h('div', { class: 'connector-v', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'dash-v' }), icon('arrowDown', 14));
const connectorH = (): HTMLElement => h('div', { class: 'connector-h', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'dash-h' }), icon('arrowRight', 14));

function setBadge(badge: HTMLElement, index: number, done: boolean): void {
  badge.classList.toggle('is-done', done);
  replaceChildrenOf(badge, done ? icon('check', 14) : String(index));
}

export function mountHub(root: HTMLElement, options: HubOptions = {}): HubHandle {
  const store: HubStore = createStore(options.limits);

  // ---- regiões dinâmicas ------------------------------------------------------
  const live = h('div', { class: 'live', attrs: { role: 'status', 'aria-live': 'polite' } });
  const alerts = h('div', { class: 'alerts', attrs: { role: 'alert' } });
  const modelBox = h('div', { class: 'stack' });
  const filesBox = h('div', { class: 'stack' });
  const resultBox = h('div', { class: 'stack' });
  const bannerBox = h('div', { class: 'stack' });
  const previewBox = h('div', { class: 'preview-wrap' });
  const footerBox = h('div', { class: 'preview-footer' });
  const badge1 = h('div', { class: 'step-index' });
  const badge2 = h('div', { class: 'step-index' });
  const badge3 = h('div', { class: 'step-index' });
  const badgePreview = h('div', { class: 'step-index' });
  // cartões criados mais abaixo; ficam aqui para o guia de próximo passo alternar o destaque
  let card1!: HTMLElement;
  let card2!: HTMLElement;
  let card3!: HTMLElement;
  let finalCard!: HTMLElement;
  let cardPreview!: HTMLElement;

  const say = (text: string): void => {
    live.textContent = text;
  };
  const fail = (text: string): void => {
    alerts.replaceChildren(h('p', { class: 'alert', text }));
  };
  const dismissAlerts = (): void => alerts.replaceChildren();

  // ---- leitura de arquivos ------------------------------------------------------
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
      h('span', { class: 'dropzone-circle' }, icon('upload', 22)),
      h('span', { class: 'btn-pill', text: label }),
      h('span', { class: 'hint', text: hint }),
    );
    return h('div', {}, input, zone);
  }

  const modelInput = fileInput('model-input', false, true);
  const filesInput = fileInput('files-input', true, false);

  // ---- modo de correspondência (construído uma vez: preserva o foco do teclado) ----
  const modeInputs = new Map<MapMode, HTMLInputElement>();
  function modeOption(mode: MapMode, title: string, hint: string): HTMLElement {
    const input = h('input', {
      class: 'visually-hidden',
      attrs: { type: 'radio', name: 'map-mode', value: mode, id: `mode-${mode}` },
      on: { change: () => store.setMode(mode) },
    });
    modeInputs.set(mode, input);
    return h('div', { class: 'mode-option' }, input, h('label', { attrs: { for: input.id } }, h('strong', { text: title }), h('span', { class: 'hint', text: hint })));
  }
  const modes = h(
    'fieldset',
    { class: 'modes' },
    h('legend', { class: 'visually-hidden', text: 'Como casar as colunas' }),
    modeOption('smart', 'Pelo nome da coluna (recomendado)', 'Reconhece "E-mail" e "email" como a mesma coluna, mesmo com acento ou maiúscula.'),
    modeOption('position', 'Pela ordem das colunas', 'A 1ª coluna do arquivo vira a 1ª do modelo, a 2ª vira a 2ª, e assim por diante.'),
  );

  // ---- guia de próximo passo e exemplo ----------------------------------------
  const guideText = h('p', { class: 'guide-text' });
  const sampleButton = h('button', { class: 'btn-ghost', text: 'Ver com dados de exemplo', attrs: { type: 'button' }, on: { click: () => void loadSample() } });
  const guide = h('div', { class: 'guide' }, h('span', { class: 'guide-icon' }, icon('arrowRight', 16)), guideText, sampleButton);

  async function loadSample(): Promise<void> {
    const sample = makeSample();
    await ingest([sample.model], true);
    await ingest(sample.files, false);
  }

  // ---- renderização ------------------------------------------------------------
  function renderModel(): void {
    const { model, includeModelRows } = store.getState();
    if (!model) {
      replaceChildrenOf(modelBox, dropzone(modelInput, 'Fazer upload do modelo', 'CSV ou XLSX até 50 MB', true), h('div', { class: 'chip chip-empty' }, h('div', { class: 'chip-main' }, h('strong', { text: 'Nenhum modelo selecionado' }), h('span', { class: 'hint', text: 'Opcional: padroniza as colunas do arquivo final.' }))));
      return;
    }
    replaceChildrenOf(
      modelBox,
      modelInput,
      h(
        'div',
        { class: 'chip' },
        h('div', { class: 'chip-main' }, h('strong', { text: model.name }), h('span', { class: 'hint', text: `${model.table.columns.length} colunas · ${formatInt(model.table.rows.length)} linhas · ${formatBytes(model.bytes)}` })),
        h('button', { class: 'btn-ghost', text: 'Trocar', attrs: { type: 'button' }, on: { click: () => modelInput.click() } }),
        h('button', { class: 'btn-ghost', text: 'Remover', attrs: { type: 'button', 'aria-label': `Remover o modelo ${model.name}` }, on: { click: () => store.removeModel() } }),
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
      dropzone(filesInput, 'Fazer upload dos arquivos', `XLSX, CSV ou TSV · até ${store.limits.maxFiles} arquivos`, false),
      files.length === 0
        ? h('div', { class: 'chip chip-empty' }, h('div', { class: 'chip-main' }, h('strong', { text: 'Nenhum arquivo na fila' }), h('span', { class: 'hint', text: 'Adicione todas as planilhas que deseja consolidar.' })))
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
                h('button', { class: 'btn-ghost', text: 'Mapeamento', attrs: { type: 'button', 'aria-label': `Revisar o mapeamento de colunas de ${f.name}` }, on: { click: (ev) => openMappingDialog(store, f.id, ev.currentTarget as HTMLElement) } }),
                h('button', { class: 'btn-ghost', text: 'Remover', attrs: { type: 'button', 'aria-label': `Remover ${f.name} da fila` }, on: { click: () => store.removeFile(f.id) } }),
              );
            }),
          ),
    );
  }

  function exportAs(format: Format): void {
    const grid = store.getComputed()?.grid;
    if (!grid || grid.rows.length === 0) {
      fail('Não há dados para exportar.');
      return;
    }
    dismissAlerts();
    try {
      if (format === 'xlsx') {
        downloadBlob(new Blob([buildXlsx(grid) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'dados_unificados.xlsx');
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

  const metric = (label: string, value: string): HTMLElement => h('div', { class: 'metric' }, h('dt', { text: label }), h('dd', { text: value }));

  function banner(kind: 'ok' | 'warn', title: string, detail?: string, actions: HTMLElement[] = []): HTMLElement {
    return h(
      'div',
      { class: `banner banner-${kind}` },
      h('span', { class: 'banner-icon' }, icon(kind === 'ok' ? 'check' : 'alert', 18)),
      h('div', { class: 'banner-body' }, h('strong', { text: title }), detail ? h('p', { text: detail }) : null, actions.length > 0 ? h('div', { class: 'banner-actions' }, ...actions) : null),
    );
  }

  const bannerAction = (label: string, onClick: (ev: MouseEvent) => void): HTMLElement => h('button', { class: 'btn-outline btn-small', text: label, attrs: { type: 'button' }, on: { click: onClick } });

  /** De onde veio cada coluna do resultado (só quando o nome de origem difere do destino). */
  function columnOrigins(): Map<string, string> {
    const c = store.getComputed();
    const hasModel = !!store.getState().model;
    const result = new Map<string, string>();
    if (!c) return result;
    const names = new Map<string, Set<string>>();
    const onlyNew = new Map<string, boolean>();
    for (const entries of Object.values(c.merge.mappings)) {
      for (const e of entries) {
        if (e.target === null) continue;
        onlyNew.set(e.target, (onlyNew.get(e.target) ?? true) && e.kind === 'new');
        if (e.source.trim().toLowerCase() !== e.target.trim().toLowerCase()) {
          const set = names.get(e.target) ?? new Set<string>();
          set.add(e.source);
          names.set(e.target, set);
        }
      }
    }
    for (const [target, set] of names) {
      const list = [...set];
      result.set(target, `← ${list.slice(0, 2).join(', ')}${list.length > 2 ? ` +${list.length - 2}` : ''}`);
    }
    if (hasModel) {
      for (const [target, flag] of onlyNew) if (flag && !result.has(target)) result.set(target, 'coluna nova');
    }
    return result;
  }

  function updateGuide(hasRows: boolean, hasWarnings: boolean): void {
    const st = store.getState();
    const empty = !st.model && st.files.length === 0;
    let text: string;
    let current: HTMLElement;
    if (empty) {
      text = 'Comece por aqui: escolha um modelo (opcional) ou vá direto para os arquivos.';
      current = card1;
    } else if (st.files.length === 0) {
      text = 'Modelo carregado. Agora adicione os arquivos que você quer unificar (etapa 2).';
      current = card2;
    } else if (!hasRows) {
      text = 'Os arquivos não têm linhas de dados. Confira se a primeira linha é o cabeçalho.';
      current = card2;
    } else if (hasWarnings) {
      text = 'Confira o aviso laranja na prévia e, se estiver tudo certo, baixe o arquivo final.';
      current = cardPreview;
    } else {
      text = 'Tudo certo! Escolha o formato e baixe o arquivo final.';
      current = cardPreview;
    }
    guideText.textContent = text;
    sampleButton.hidden = !empty;
    for (const card of [card1, card2, card3, cardPreview]) {
      const isCurrent = card === current;
      card.classList.toggle('is-current', isCurrent);
      if (isCurrent) card.setAttribute('aria-current', 'step');
      else card.removeAttribute('aria-current');
    }
    card3.classList.toggle('is-idle', st.files.length === 0);
    finalCard.classList.toggle('is-idle', !hasRows);
  }

  function renderResult(): void {
    const c = store.getComputed();
    const hasRows = !!c && c.grid.rows.length > 0;
    setBadge(badge1, 1, !!store.getState().model);
    setBadge(badge2, 2, store.getState().files.length > 0);
    setBadge(badge3, 3, hasRows);
    setBadge(badgePreview, 4, hasRows && c.diagnostics.rowsWithEmpty === 0 && c.merge.collisionCount === 0);
    for (const [mode, input] of modeInputs) input.checked = store.getState().mode === mode;
    updateGuide(hasRows, !!c && (c.diagnostics.rowsWithEmpty > 0 || c.merge.collisionCount > 0 || c.merge.duplicateTargets.length > 0));

    if (!c) {
      replaceChildrenOf(resultBox, h('div', { class: 'final-empty' }, h('div', { class: 'doc-circle' }, icon('file', 28)), h('p', { class: 'hint', text: 'Carregue um modelo e/ou arquivos para gerar o arquivo final.' })));
      replaceChildrenOf(bannerBox);
      replaceChildrenOf(previewBox, h('p', { class: 'hint empty-preview', text: 'A prévia dos dados unificados aparece aqui.' }));
      replaceChildrenOf(footerBox);
      return;
    }

    const d = c.diagnostics;
    replaceChildrenOf(
      resultBox,
      h('div', { class: 'final-head' }, h('div', { class: 'doc-circle is-ready' }, icon('file', 28), h('span', { class: 'doc-check' }, icon('check', 12))), h('div', {}, h('strong', { text: 'dados_unificados' }), h('span', { class: 'hint', text: 'Pronto para exportar' }))),
      h(
        'dl',
        { class: 'metrics' },
        metric('Arquivos unificados', formatInt(store.getState().files.length)),
        metric('Linhas', formatInt(d.rows)),
        metric('Colunas', formatInt(d.columns)),
        metric('Células vazias', formatInt(d.emptyCells)),
        metric('Linhas repetidas', formatInt(d.duplicateRows)),
      ),
      h('div', { class: 'export-group', attrs: { role: 'group', 'aria-label': 'Exportar resultado' } }, h('span', { class: 'export-label', text: 'Exportar para' }), ...FORMATS.map(([f, label]) => h('button', { class: 'btn-outline', text: label, attrs: { type: 'button', 'aria-label': `Exportar em ${label}`, title: FORMAT_HELP[f] }, on: { click: () => exportAs(f) } }))),
      h('p', { class: 'hint format-help', text: 'Excel: abrir e editar · CSV: importar em outro sistema · JSON: integrações · SQL: carregar em banco de dados (SQLite).' }),
    );

    // avisos: nada é descartado em silêncio
    const notes: HTMLElement[] = [];
    const warn = d.rowsWithEmpty > 0 || c.merge.collisionCount > 0 || c.merge.duplicateTargets.length > 0;
    const collisionDetails =
      c.merge.collisionCount > 0
        ? h(
            'details',
            { class: 'note' },
            h('summary', { text: `${formatInt(c.merge.collisionCount)} valor(es) divergente(s) ignorados (duas colunas no mesmo destino)` }),
            h('ul', {}, ...c.merge.collisions.slice(0, 10).map((x) => h('li', { text: `${x.file}, linha ${x.row}, coluna "${x.column}": mantido "${x.kept}", ignorado "${x.discarded}"` }))),
          )
        : null;
    if (warn) {
      const parts: string[] = [];
      if (d.rowsWithEmpty > 0) parts.push(`${formatInt(d.rowsWithEmpty)} linha(s) com campos vazios (marcados em laranja na prévia)`);
      if (c.merge.collisionCount > 0) parts.push(`${formatInt(c.merge.collisionCount)} valor(es) ignorados porque duas colunas apontam para o mesmo destino`);
      if (d.duplicateRows > 0) parts.push(`${formatInt(d.duplicateRows)} linha(s) repetidas`);
      const actions: HTMLElement[] = [];
      if (d.rowsWithEmpty > 0 || d.duplicateRows > 0) actions.push(bannerAction('Corrigir vazios e repetidos', (ev) => openFixDialog(store, ev.currentTarget as HTMLElement)));
      if (collisionDetails) {
        actions.push(
          bannerAction('Ver valores ignorados', () => {
            collisionDetails.open = true;
            collisionDetails.querySelector('summary')?.focus();
          }),
        );
      }
      notes.push(banner('warn', 'Confira antes de exportar', `${parts.join('; ')}.`, actions));
    } else {
      notes.push(banner('ok', 'Nenhuma inconsistência encontrada', 'Todos os registros estão preenchidos e integrados.'));
    }
    if (collisionDetails) notes.push(collisionDetails);
    for (const dup of c.merge.duplicateTargets) {
      notes.push(h('p', { class: 'note', text: `${dup.file}: as colunas ${dup.sources.map((s) => `"${s}"`).join(' e ')} apontam para "${dup.target}". Revise o mapeamento.` }));
    }
    const st = store.getState();
    if (st.mode === 'position' && st.model) {
      const width = st.model.table.columns.length;
      for (const f of st.files) {
        if (f.table.columns.length > width) notes.push(h('p', { class: 'note', text: `${f.name}: ${f.table.columns.length - width} coluna(s) além do modelo foram mantidas como novas.` }));
      }
    }
    replaceChildrenOf(bannerBox, ...notes);

    // prévia (somente texto, limitada)
    const { grid } = c;
    const shown = grid.rows.slice(0, PREVIEW_ROWS);
    const origins = columnOrigins();
    replaceChildrenOf(
      previewBox,
      h(
        'div',
        { class: 'table-scroll', attrs: { tabindex: '0', role: 'region', 'aria-label': 'Prévia dos dados unificados' } },
        h(
          'table',
          {},
          h('caption', { class: 'visually-hidden', text: `Prévia: ${formatInt(shown.length)} de ${formatInt(grid.rows.length)} linhas` }),
          h('thead', {}, h('tr', {}, h('th', { attrs: { scope: 'col' }, text: '#' }), ...grid.columns.map((col) => {
            const origin = origins.get(col);
            return h('th', { attrs: { scope: 'col', ...(origin ? { title: `${col} ${origin}` } : {}) } }, col, origin ? h('span', { class: 'th-origin', text: origin }) : null);
          }))),
          h('tbody', {}, ...shown.map((r, i) => h('tr', {}, h('th', { attrs: { scope: 'row' }, text: String(i + 1) }), ...grid.columns.map((_, j) => h('td', { class: (r[j] ?? '') === '' ? 'is-empty' : '', text: r[j] ?? '' }))))),
        ),
      ),
      grid.rows.length > PREVIEW_ROWS ? h('p', { class: 'hint', text: `Mostrando as primeiras ${PREVIEW_ROWS} de ${formatInt(grid.rows.length)} linhas. A exportação inclui todas.` }) : null,
    );

    replaceChildrenOf(
      footerBox,
      h('button', { class: 'btn-outline', attrs: { type: 'button' }, on: { click: (ev) => openStructureDialog(store, ev.currentTarget as HTMLElement) } }, icon('columns', 16), 'Reordenar ou remover colunas'),
      h('button', { class: 'btn-outline', attrs: { type: 'button' }, on: { click: (ev) => openFixDialog(store, ev.currentTarget as HTMLElement) } }, icon('wand', 16), 'Corrigir vazios e repetidos'),
      h('button', { class: 'btn-lime', attrs: { type: 'button' }, on: { click: () => exportAs('xlsx') } }, icon('download', 16), 'Baixar arquivo final'),
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
  // Dois cliques para apagar: o primeiro pede confirmação (some sozinho em 5 s ou ao sair do botão).
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  const setClearState = (confirming: boolean): void => {
    clearTimeout(confirmTimer);
    clearButton.classList.toggle('is-confirming', confirming);
    replaceChildrenOf(clearButton, icon('trash', 16), confirming ? 'Clique de novo para apagar' : 'Limpar tudo');
    if (confirming) confirmTimer = setTimeout(() => setClearState(false), 5000);
  };
  const clearButton = h('button', {
    class: 'btn-outline btn-clear',
    attrs: { type: 'button', title: 'Apaga todos os dados carregados desta sessão' },
    on: {
      click: () => {
        if (!clearButton.classList.contains('is-confirming')) {
          setClearState(true);
          say('Clique novamente em Limpar tudo para confirmar.');
          return;
        }
        setClearState(false);
        store.clearAll();
        dismissAlerts();
        say('Todos os dados foram apagados da memória.');
      },
      blur: () => setClearState(false),
    },
  });
  setClearState(false);

  const example = h(
    'p',
    { class: 'example' },
    h('span', { class: 'hint', text: 'Exemplo: ' }),
    h('span', { class: 'tag', text: 'cliente' }),
    ' ',
    h('span', { class: 'tag', text: 'preco' }),
    h('span', { class: 'example-arrow', text: ' → ' }),
    h('span', { class: 'tag tag-exact', text: 'Nome' }),
    ' ',
    h('span', { class: 'tag tag-exact', text: 'Valor' }),
  );
  card1 = stageCard({ tag: 'ETAPA 01', title: 'Arquivo Modelo', desc: 'A planilha que define as colunas do resultado final. Sem modelo, as colunas vêm dos próprios arquivos.', icon: 'file', badge: badge1, labelId: 'h-model' }, example, modelBox);
  card2 = stageCard({ tag: 'ETAPA 02', title: 'Arquivos para Unificar', desc: 'Adicione todas as planilhas que deseja juntar em uma só.', icon: 'layers', badge: badge2, labelId: 'h-files' }, filesBox);
  card3 = stageCard({ tag: 'ETAPA 03', title: 'Como unificar', desc: 'Escolha como as colunas dos arquivos são ligadas às do modelo. Na dúvida, deixe a opção recomendada.', icon: 'wand', badge: badge3, labelId: 'h-mode' }, modes);
  finalCard = h('section', { class: 'stage-card final-card', attrs: { 'aria-label': 'Arquivo final' } }, resultBox);
  cardPreview = stageCard({ tag: 'VALIDAÇÃO', title: 'Prévia dos dados', desc: 'Confira os dados consolidados antes de exportar. Cada coluna mostra de onde veio, quando o nome mudou.', icon: 'table', badge: badgePreview, labelId: 'h-preview' }, previewBox, footerBox);

  const shell = h(
    'div',
    { class: 'app-viewport' },
    h('div', { class: 'brand-pill' }, icon('layers', 16), 'Hub de Dados'),
    h(
      'div',
      { class: 'main-card' },
      h(
        'header',
        { class: 'app-header' },
        h(
          'div',
          { class: 'header-left' },
          h('div', { class: 'tag-row' }, h('span', { class: 'tag-badge', text: 'NOVO PROCESSAMENTO' }), h('p', { class: 'privacy', attrs: { role: 'note' } }, icon('shield', 14), 'Processamento 100% local. Nenhum dado sai deste computador e nada é gravado em disco.')),
          h('h1', { class: 'main-title', text: 'Unifique seus dados' }),
          h('p', { class: 'main-subtitle', text: 'Combine diferentes fontes em um único arquivo, seguindo a estrutura que você definir.' }),
        ),
        h('div', { class: 'header-right' }, h('div', { class: 'steps-pill' }, h('span', { class: 'step-num', text: '3' }), h('span', { text: 'etapas simples' })), clearButton),
      ),
      guide,
      live,
      alerts,
      h(
        'main',
        { class: 'flow-grid' },
        h(
          'div',
          { class: 'col' },
          card1,
          connectorV(),
          card2,
        ),
        connectorH(),
        h(
          'div',
          { class: 'col' },
          card3,
          connectorV(),
          finalCard,
        ),
        connectorH(),
        h(
          'div',
          { class: 'col col-wide' },
          bannerBox,
          cardPreview,
        ),
      ),
    ),
  );

  root.replaceChildren(shell);
  render();

  return {
    getResult: () => store.getComputed()?.grid ?? null,
    clear: () => store.clearAll(),
    destroy: () => {
      unsubscribe();
      clearTimeout(confirmTimer);
      store.clearAll();
      root.replaceChildren();
    },
  };
}
