import { IGNORE, type MappingEntry, type MappingOverride } from '../core/types';
import type { HubStore } from '../state/store';
import { formatInt, h } from './dom';

const MAPPING_LABEL: Record<MappingEntry['kind'], string> = {
  exact: 'Nome igual',
  synonym: 'Sinônimo',
  position: 'Posição',
  manual: 'Manual',
  new: 'Coluna nova',
  ignored: 'Ignorada',
};

/**
 * Abre um <dialog> modal. O foco volta ao elemento que o abriu ao fechar e Esc fecha.
 * O conteúdo é sempre montado com h() (texto, nunca HTML).
 */
function openDialog(title: string, trigger: HTMLElement, build: (close: () => void) => Node[]): void {
  const dialog = h('dialog', { class: 'dialog', attrs: { 'aria-labelledby': 'dlg-title' } });
  const close = (): void => dialog.close();
  dialog.append(h('h2', { text: title, attrs: { id: 'dlg-title' } }), ...build(close));
  dialog.addEventListener('close', () => {
    dialog.remove();
    trigger.focus();
  });
  document.body.append(dialog);
  dialog.showModal();
}

const footer = (...buttons: HTMLElement[]): HTMLElement => h('div', { class: 'dialog-actions' }, ...buttons);

// ---------------------------------------------------------------------------
export function openMappingDialog(store: HubStore, fileId: string, trigger: HTMLElement): void {
  const file = store.getState().files.find((f) => f.id === fileId);
  const computed = store.getComputed();
  if (!file || !computed) return;

  const targets = computed.merge.columns.filter((c) => c !== computed.merge.sourceColumn);
  const entries = computed.merge.mappings[fileId] ?? [];
  const chosen = new Map<number, MappingOverride | undefined>(store.getState().overrides.get(fileId) ?? []);

  openDialog(`Mapeamento de ${file.name}`, trigger, (close) => {
    const rows = entries.map((e) => {
      const select = h(
        'select',
        {
          attrs: { 'aria-label': `Destino da coluna ${e.source}` },
          on: {
            change: (ev) => {
              const v = (ev.currentTarget as HTMLSelectElement).value;
              if (v === 'auto') chosen.delete(e.sourceIndex);
              else if (v === 'ignore') chosen.set(e.sourceIndex, IGNORE);
              else chosen.set(e.sourceIndex, targets[Number(v)] as string);
            },
          },
        },
        h('option', { text: 'Automático', attrs: { value: 'auto' } }),
        h('option', { text: 'Ignorar esta coluna', attrs: { value: 'ignore' } }),
        ...targets.map((t, i) => h('option', { text: t, attrs: { value: String(i) } })),
      );
      const current = chosen.get(e.sourceIndex);
      if (current === IGNORE) select.value = 'ignore';
      else if (typeof current === 'string') select.value = String(targets.indexOf(current));
      return h(
        'tr',
        {},
        h('th', { attrs: { scope: 'row' }, text: e.source }),
        h('td', { text: e.target ?? '(ignorada)' }),
        h('td', {}, h('span', { class: `tag tag-${e.kind}`, text: MAPPING_LABEL[e.kind] })),
        h('td', {}, select),
      );
    });

    return [
      h('p', { class: 'hint', text: `${formatInt(file.table.rows.length)} linhas · escolha manualmente o destino de qualquer coluna.` }),
      h(
        'div',
        { class: 'table-scroll', attrs: { tabindex: '0', role: 'region', 'aria-label': 'Mapeamento de colunas' } },
        h('table', {}, h('thead', {}, h('tr', {}, ...['Coluna de origem', 'Destino atual', 'Critério', 'Alterar'].map((t) => h('th', { attrs: { scope: 'col' }, text: t })))), h('tbody', {}, ...rows)),
      ),
      footer(
        h('button', { class: 'btn', text: 'Cancelar', attrs: { type: 'button' }, on: { click: close } }),
        h('button', {
          class: 'btn btn-primary',
          text: 'Aplicar',
          attrs: { type: 'button' },
          on: {
            click: () => {
              entries.forEach((e) => store.setOverride(fileId, e.sourceIndex, chosen.get(e.sourceIndex)));
              close();
            },
          },
        }),
      ),
    ];
  });
}

// ---------------------------------------------------------------------------
export function openStructureDialog(store: HubStore, trigger: HTMLElement): void {
  const computed = store.getComputed();
  if (!computed) return;
  const before = [...computed.grid.columns];
  const draft = [...before];
  const originalAll = computed.merge.columns;

  openDialog('Editar estrutura de colunas', trigger, (close) => {
    const list = h('ol', { class: 'column-list' });
    const input = h('input', { attrs: { type: 'text', id: 'new-col', maxlength: String(store.limits.maxHeaderChars), autocomplete: 'off' } });
    const message = h('p', { class: 'hint', attrs: { role: 'status' } });

    const renderList = (): void => {
      list.replaceChildren(
        ...draft.map((name, i) =>
          h(
            'li',
            { class: 'column-item' },
            h('span', { text: name }),
            h('button', { class: 'btn btn-icon', text: '↑', attrs: { type: 'button', 'aria-label': `Subir ${name}`, ...(i === 0 ? { disabled: '' } : {}) }, on: { click: () => { [draft[i - 1], draft[i]] = [draft[i] as string, draft[i - 1] as string]; renderList(); } } }),
            h('button', { class: 'btn btn-icon', text: '↓', attrs: { type: 'button', 'aria-label': `Descer ${name}`, ...(i === draft.length - 1 ? { disabled: '' } : {}) }, on: { click: () => { [draft[i + 1], draft[i]] = [draft[i] as string, draft[i + 1] as string]; renderList(); } } }),
            h('button', { class: 'btn btn-icon btn-danger', text: '✕', attrs: { type: 'button', 'aria-label': `Remover coluna ${name}` }, on: { click: () => { if (draft.length <= 1) { message.textContent = 'A estrutura precisa de ao menos 1 coluna.'; return; } draft.splice(i, 1); renderList(); } } }),
          ),
        ),
      );
    };
    renderList();

    const add = (): void => {
      const name = input.value.trim().slice(0, store.limits.maxHeaderChars);
      if (name === '') return;
      if (draft.some((c) => c.toLowerCase() === name.toLowerCase())) {
        message.textContent = 'Já existe uma coluna com esse nome.';
        return;
      }
      draft.push(name);
      input.value = '';
      message.textContent = '';
      renderList();
    };

    return [
      list,
      h('div', { class: 'row' }, h('label', { text: 'Nova coluna', attrs: { for: 'new-col' } }), input, h('button', { class: 'btn', text: 'Adicionar', attrs: { type: 'button' }, on: { click: add } })),
      message,
      footer(
        h('button', { class: 'btn', text: 'Cancelar', attrs: { type: 'button' }, on: { click: close } }),
        h('button', {
          class: 'btn btn-primary',
          text: 'Salvar',
          attrs: { type: 'button' },
          on: {
            click: () => {
              const prior = store.getState().structure;
              const known = new Set(originalAll);
              const deleted = new Set(prior.deleted);
              before.forEach((c) => { if (!draft.includes(c)) deleted.add(c); });
              draft.forEach((c) => deleted.delete(c));
              store.setStructure({ order: [...draft], deleted: [...deleted], added: draft.filter((c) => !known.has(c)) });
              close();
            },
          },
        }),
      ),
    ];
  });
}

// ---------------------------------------------------------------------------
export function openFixDialog(store: HubStore, trigger: HTMLElement): void {
  const computed = store.getComputed();
  if (!computed) return;
  const rules = { ...store.getState().fixes };
  const d = computed.diagnostics;

  openDialog('Corrigir dados', trigger, (close) => {
    const fill = h('input', { attrs: { type: 'text', id: 'fill-text', value: rules.fillEmpty ?? 'N/D', maxlength: '64', autocomplete: 'off', 'aria-label': 'Texto de preenchimento' } });
    const fillCheck = h('input', { attrs: { type: 'checkbox', id: 'fill-check', ...(rules.fillEmpty !== null ? { checked: '' } : {}) } });
    const blank = h('input', { attrs: { type: 'checkbox', ...(rules.removeBlankRows ? { checked: '' } : {}) } });
    const dup = h('input', { attrs: { type: 'checkbox', ...(rules.removeDuplicateRows ? { checked: '' } : {}) } });

    return [
      h('p', { class: 'hint', text: 'As correções são regras: continuam valendo quando você adiciona ou remove arquivos. Os arquivos originais nunca são alterados.' }),
      h('label', { class: 'check' }, blank, ` Remover linhas totalmente em branco (${formatInt(d.blankRows)})`),
      h('label', { class: 'check' }, dup, ` Remover linhas duplicadas (${formatInt(d.duplicateRows)})`),
      h('div', { class: 'row' }, h('label', { class: 'check', attrs: { for: 'fill-check' } }, fillCheck, ' Preencher células vazias com'), fill),
      h('p', { class: 'hint', text: `Hoje: ${formatInt(d.emptyCells)} célula(s) vazia(s). Colunas 100% numéricas e a coluna de origem não são preenchidas.` }),
      footer(
        h('button', { class: 'btn', text: 'Cancelar', attrs: { type: 'button' }, on: { click: close } }),
        h('button', { class: 'btn', text: 'Desfazer todas', attrs: { type: 'button' }, on: { click: () => { store.setFixes({ fillEmpty: null, removeBlankRows: false, removeDuplicateRows: false }); close(); } } }),
        h('button', {
          class: 'btn btn-primary',
          text: 'Aplicar',
          attrs: { type: 'button' },
          on: {
            click: () => {
              store.setFixes({
                fillEmpty: fillCheck.checked ? fill.value.slice(0, 64) : null,
                removeBlankRows: blank.checked,
                removeDuplicateRows: dup.checked,
              });
              close();
            },
          },
        }),
      ),
    ];
  });
}
