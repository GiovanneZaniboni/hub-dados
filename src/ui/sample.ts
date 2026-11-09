/**
 * Dados fictícios embutidos para o botão "Ver com dados de exemplo".
 * Nada aqui vem da rede nem de disco; são textos fixos criados em memória.
 */

const MODEL = 'Nome;E-mail;Cidade;Valor\n';

const LOJA_A = ['cliente;email;cidade;preco', 'Ana Souza;ana@exemplo.com;Curitiba;120', 'Bruno Lima;bruno@exemplo.com;;85', ''].join('\n');

const LOJA_B = ['Nome;Email;Cidade;Valor;Observacao', 'Carla Dias;carla@exemplo.com;Recife;200;Cliente novo', 'Diego Reis;diego@exemplo.com;Salvador;150;', ''].join('\n');

const csv = (name: string, text: string): File => new File([text], name, { type: 'text/csv' });

export function makeSample(): { model: File; files: File[] } {
  return {
    model: csv('modelo_exemplo.csv', MODEL),
    files: [csv('vendas_loja_a.csv', LOJA_A), csv('vendas_loja_b.csv', LOJA_B)],
  };
}
