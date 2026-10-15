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
				destaque: true,
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

test("job antigo, sem estação nem destaque, renderiza igual ao ticket único sem estação", () => {
	// `dados` gravados antes das estações de preparo: sem `estacao` e sem `destaque` nos itens.
	const legacyPayload = {
		...buildData(),
		data: "2026-10-08T15:30:00.000Z",
		itens: [
			{ nome: "Açaí 500ml", quantidade: 2, observacoes: "sem granola" },
			{ nome: "Suco de laranja", quantidade: 1 },
		],
	} as Record<string, unknown>;
	delete legacyPayload.estacao;

	const parsed = TicketPreparoDadosSchema.parse(legacyPayload);
	assert.ok(parsed.itens.every((item) => item.destaque === true));

	const legacyHtml = renderTicketPreparoHtml(parsed);
	const currentHtml = renderTicketPreparoHtml(
		buildData({
			estacao: null,
			itens: [
				{ nome: "Açaí 500ml", quantidade: 2, observacoes: "sem granola", destaque: true },
				{ nome: "Suco de laranja", quantidade: 1, destaque: true },
			],
		}),
	);
	assert.equal(legacyHtml, currentHtml);
	assert.doesNotMatch(legacyHtml, /class="centro estacao"/);
	assert.doesNotMatch(legacyHtml, /Também neste pedido/);
	assert.match(legacyHtml, /3 ITENS/);
	assert.doesNotMatch(legacyHtml, /OUTRAS ESTAÇÕES/);
});

test("mostra o nome da estação no cabeçalho, acima da etiqueta", () => {
	const html = renderTicketPreparoHtml(buildData({ estacao: { id: "estacao-1", nome: "Cozinha <quente>" } }));
	assert.match(html, /class="centro estacao">Cozinha &lt;quente&gt;<\/p>\n<div class="centro etiqueta">Mesa 12</);
});

test("itens de outras estações saem sob 'Também neste pedido', fora da tabela, e não entram no total", () => {
	const html = renderTicketPreparoHtml(
		buildData({
			estacao: { id: "estacao-1", nome: "Cozinha" },
			itens: [
				{ nome: "X-Burger", quantidade: 2, observacoes: "sem cebola", destaque: true },
				{ nome: "Coca-Cola lata", quantidade: 3, observacoes: "gelada", destaque: false },
			],
		}),
	);
	const [antesDoBloco, bloco] = html.split("Também neste pedido");
	assert.ok(bloco, "bloco 'Também neste pedido' ausente");
	// O item da estação fica na tabela com a quantidade grande; o de outra estação não.
	assert.match(antesDoBloco, /<td class="qtd">2<\/td>\s*<td class="desc">X-Burger/);
	assert.doesNotMatch(antesDoBloco, /Coca-Cola/);
	assert.match(bloco, /class="outro-item">3x Coca-Cola lata/);
	assert.match(bloco, /class="outro-observacao">&raquo; gelada/);
	assert.doesNotMatch(bloco, /class="qtd"/);
	assert.match(html, /2 ITENS &middot; \+3 EM OUTRAS ESTAÇÕES/);
});

test("ticket só com itens da estação não abre o bloco 'Também neste pedido'", () => {
	const html = renderTicketPreparoHtml(buildData({ estacao: { id: "estacao-1", nome: "Bar" } }));
	assert.doesNotMatch(html, /Também neste pedido/);
	assert.doesNotMatch(html, /OUTRAS ESTAÇÕES/);
});

test("rejeita ticket sem itens", () => {
	assert.throws(() => TicketPreparoDadosSchema.parse({ ...buildData(), itens: [] }));
});
