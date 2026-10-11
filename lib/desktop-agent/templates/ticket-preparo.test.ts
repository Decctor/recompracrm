import assert from "node:assert/strict";
import test from "node:test";
import { TicketPreparoDadosSchema, renderTicketPreparoHtml, type TTicketPreparoDados } from "./ticket-preparo";

function buildData(overrides: Partial<TTicketPreparoDados> = {}): TTicketPreparoDados {
	return {
		etiqueta: "Mesa 12",
		numeroPedido: 3,
		origem: "PEDIDO_CONTA",
		modalidade: "COMANDA",
		canal: "COMANDA",
		data: new Date("2026-10-08T15:30:00Z"),
		clienteNome: null,
		codigoInterno: null,
		observacoes: null,
		itens: [
			{
				nome: "Açaí 500ml",
				quantidade: 2,
				observacoes: "sem granola",
				gruposAdicionais: [{ grupo: "Escolha seu gelato", adicionais: [{ nome: "Pistache", quantidade: 1 }] }],
			},
		],
		...overrides,
	};
}

test("coloca o lugar e o número do pedido no topo, sem nenhum preço", () => {
	const html = renderTicketPreparoHtml(buildData());
	assert.match(html, /class="centro etiqueta">Mesa 12</);
	assert.match(html, /PEDIDO 3/);
	assert.doesNotMatch(html, /R\$/);
});

test("imprime quantidade, adicionais agrupados e a observação do item", () => {
	const html = renderTicketPreparoHtml(buildData());
	assert.match(html, /<td class="qtd">2<\/td>/);
	assert.match(html, /grupo-adicionais">Escolha seu gelato</);
	assert.match(html, /\+ Pistache/);
	assert.match(html, /sem granola/);
});

test("comanda não repete modalidade; entrega mostra modalidade e canal", () => {
	const comanda = renderTicketPreparoHtml(buildData());
	assert.doesNotMatch(comanda, /class="centro contexto"/);

	const entrega = renderTicketPreparoHtml(
		buildData({ origem: "VENDA", etiqueta: "Entrega", numeroPedido: null, modalidade: "ENTREGA", canal: "iFood" }),
	);
	// A etiqueta já é "Entrega": o contexto não repete a modalidade, só acrescenta o canal.
	assert.match(entrega, /class="centro contexto">IFOOD</);
	assert.doesNotMatch(entrega, /ENTREGA · IFOOD/);
	assert.doesNotMatch(entrega, /PEDIDO/);

	const retiradaBalcao = renderTicketPreparoHtml(
		buildData({ origem: "VENDA", etiqueta: "Comanda 7", numeroPedido: null, modalidade: "RETIRADA", canal: "POS" }),
	);
	assert.match(retiradaBalcao, /RETIRADA · POS/);
});

test("escapa HTML vindo das observações do cliente", () => {
	const html = renderTicketPreparoHtml(buildData({ observacoes: "<b>urgente</b>" }));
	assert.match(html, /OBS: &lt;b&gt;urgente&lt;\/b&gt;/);
	assert.doesNotMatch(html, /<b>urgente/);
});

test("rejeita ticket sem itens", () => {
	assert.throws(() => TicketPreparoDadosSchema.parse({ ...buildData(), itens: [] }));
});
