import { normalizeKey } from './text';

/** Dicionário de sinônimos (de-para). As chaves/valores são normalizados no carregamento. */
export const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  codigo: ['id', 'cod', 'identificador', 'matricula', 'numero', 'num', 'ref', 'referencia', 'chave'],
  nome: ['cliente', 'razao social', 'nome completo', 'colaborador', 'funcionario', 'paciente', 'usuario', 'pessoa', 'contato', 'comprador', 'titular'],
  descricao: ['produto', 'item', 'servico', 'mercadoria', 'detalhe', 'especificacao', 'titulo', 'material'],
  preco: ['valor', 'total', 'unitario', 'preco unitario', 'subtotal', 'montante', 'quantia', 'custo', 'vlr', 'vlr total'],
  valor: ['preco', 'total', 'unitario', 'preco unitario', 'subtotal', 'montante', 'quantia', 'custo', 'vlr', 'vlr total'],
  quantidade: ['qtd', 'quant', 'qnt', 'volume', 'unidades', 'qtde', 'pecas'],
  data: ['emissao', 'data emissao', 'data venda', 'data cadastro', 'periodo', 'data hora', 'dt', 'dt emissao'],
  cidade: ['municipio', 'localidade'],
  estado: ['uf', 'regiao', 'provincia'],
  telefone: ['fone', 'celular', 'contato', 'tel', 'whatsapp', 'zap'],
  email: ['e-mail', 'correio eletronico', 'mail'],
  status: ['situacao', 'estado atual', 'fase', 'etapa', 'condicao'],
};

interface Group {
  canonical: string;
  synonyms: ReadonlySet<string>;
}

function buildGroups(dict: Readonly<Record<string, readonly string[]>>): Group[] {
  return Object.entries(dict).map(([canonical, syns]) => ({
    canonical: normalizeKey(canonical),
    synonyms: new Set(syns.map(normalizeKey)),
  }));
}

const GROUPS = buildGroups(SYNONYMS);

export type MatchHow = 'exact' | 'synonym';

export interface Match {
  target: string;
  how: MatchHow;
}

/**
 * Encontra a coluna de destino para `source`.
 * 1) igualdade normalizada; 2) sinônimos. Grupos em que `source` é o termo canônico
 * têm prioridade, para o resultado não depender da ordem do dicionário.
 */
export function findBestMatch(source: string, targets: readonly string[]): Match | null {
  const s = normalizeKey(source);
  if (s === '') return null;

  for (const t of targets) {
    if (normalizeKey(t) === s) return { target: t, how: 'exact' };
  }

  const groups = GROUPS.filter((g) => g.canonical === s || g.synonyms.has(s)).sort(
    (a, b) => Number(b.canonical === s) - Number(a.canonical === s),
  );

  for (const g of groups) {
    for (const t of targets) {
      const tn = normalizeKey(t);
      if (tn === g.canonical || g.synonyms.has(tn)) return { target: t, how: 'synonym' };
    }
  }
  return null;
}
