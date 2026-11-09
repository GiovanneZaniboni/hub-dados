import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountHub, type HubHandle } from '../src/ui/app';
import { h } from '../src/ui/dom';

const tick = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function upload(id: string, files: File[]): Promise<void> {
  const input = document.getElementById(id) as HTMLInputElement;
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await tick(60);
}

const csv = (name: string, text: string): File => new File([text], name, { type: 'text/csv' });

describe('dom helper', () => {
  it('recusa atributos perigosos', () => {
    for (const bad of ['onclick', 'onerror', 'style', 'href', 'src', 'srcdoc', 'action', 'formaction']) {
      expect(() => h('div', { attrs: { [bad]: 'x' } })).toThrow();
    }
  });

  it('trata texto como texto', () => {
    const el = h('p', { text: '<img src=x onerror=alert(1)>' }, '<b>oi</b>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
  });
});

describe('interface', () => {
  let root: HTMLElement;
  let hub: HubHandle;

  beforeEach(() => {
    document.body.replaceChildren();
    root = document.createElement('div');
    document.body.append(root);
    hub = mountHub(root);
  });
  afterEach(() => hub.destroy());

  it('monta com a faixa de privacidade e sem resultado', () => {
    expect(root.querySelector('.privacy')?.textContent).toContain('Nenhum dado sai deste computador');
    expect(hub.getResult()).toBeNull();
  });

  it('nome de arquivo malicioso aparece como texto, nunca como HTML', async () => {
    const evil = '"><img src=x onerror=alert(1)>.csv';
    await upload('files-input', [csv(evil, 'a;b\n1;2\n')]);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(evil);
    const result = hub.getResult();
    expect(result?.rows).toEqual([['1', '2', evil]]);
  });

  it('célula maliciosa também vira texto na prévia', async () => {
    await upload('files-input', [csv('a.csv', 'x\n<script>alert(1)</script>\n')]);
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('tbody td')?.textContent).toBe('<script>alert(1)</script>');
  });

  it('formato não suportado gera alerta e não entra na fila', async () => {
    await upload('files-input', [new File(['x'], 'foto.png'), csv('ok.csv', 'a\n1\n')]);
    expect(root.querySelector('.alerts')?.textContent).toContain('foto.png');
    expect(root.querySelectorAll('.file-list li')).toHaveLength(1);
  });

  it('modelo + arquivo, remoção e "Limpar tudo" apagam os dados da memória', async () => {
    await upload('model-input', [csv('m.csv', 'Nome;Valor\n')]);
    await upload('files-input', [csv('a.csv', 'cliente;preco\nAna;10\n')]);
    expect(hub.getResult()?.columns).toEqual(['Nome', 'Valor', 'Arquivo_Origem']);
    const clear = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Limpar tudo') as HTMLButtonElement;
    clear.click(); // primeiro clique só pede confirmação
    expect(hub.getResult()).not.toBeNull();
    expect(clear.textContent).toContain('Clique de novo');
    clear.click();
    expect(hub.getResult()).toBeNull();
    expect(root.querySelector('.file-list')).toBeNull();
  });

  it('guia mostra o próximo passo e o exemplo carrega dados fictícios', async () => {
    expect(root.querySelector('.guide-text')?.textContent).toContain('Comece por aqui');
    const sample = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Ver com dados de exemplo') as HTMLButtonElement;
    sample.click();
    await tick(150);
    expect(hub.getResult()?.rows.length).toBe(4);
    expect(root.querySelectorAll('.file-list li')).toHaveLength(2);
    expect(root.querySelector('.stage-card.is-current')).not.toBeNull();
    expect(root.querySelector('.th-origin')).not.toBeNull();
    expect(root.querySelector('.banner-warn .btn-small')).not.toBeNull();
  });

  it('onChange recebe o resultado atual', async () => {
    const seen: (number | null)[] = [];
    hub.destroy();
    root = document.createElement('div');
    document.body.replaceChildren(root);
    hub = mountHub(root, { onChange: (g) => seen.push(g ? g.rows.length : null) });
    await upload('files-input', [csv('a.csv', 'x\n1\n2\n')]);
    expect(seen.at(-1)).toBe(2);
  });
});
