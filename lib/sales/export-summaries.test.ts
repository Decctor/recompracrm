import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSaleCompositionSummary, buildSaleFiscalSummary, buildSalePaymentsSummary, resolvePrimarySaleFiscalDocument } from "./export-summaries";
import type { TSalePaymentGroup } from "./utils";

/**
 * Cada célula-resumo da exportação de vendas tem um formato fixo: quem abre a planilha lê
 * "2x Camiseta (P) - R$ 59,80" sem precisar do sistema. Estes testes fixam esse formato e o corte
 * por tamanho, que é o que impede uma venda de atacado de estourar a célula.
 */

function paymentGroup(overrides: Partial<TSalePaymentGroup> = {}): TSalePaymentGroup {
	return {
		id: "grupo-1",
		lancamentoContabilId: "lancamento-1",
		metodo: "PIX",
		valor: 50,
		parcelasTotal: 1,
		parcelasRecebidas: 1,
		valorRecebido: 50,
		proximoVencimento: null,
		ultimoRecebimento: new Date("2026-09-01T12:00:00.000Z"),
		cancelado: false,
		emAtraso: false,
		...overrides,
	};
}

test("composição: quantidade, nome, variante e valor líquido por item", () => {
	const summary = buildSaleCompositionSummary([
		{ quantidade: 2, valorVendaTotalLiquido: 59.8, produto: { nome: "Camiseta" }, produtoVariante: { nome: "P" } },
		{ quantidade: 1.5, valorVendaTotalLiquido: 35, produto: { nome: "Queijo" }, produtoVariante: null },
		{ quantidade: 1, valorVendaTotalLiquido: 10, produto: null },
	]);
	assert.equal(summary, "2x Camiseta (P) - R$ 59,80; 1,5x Queijo - R$ 35,00; 1x Produto removido - R$ 10,00");
});

test("composição: corta no limite e diz quantos itens ficaram de fora", () => {
	const itens = Array.from({ length: 5 }, (_, index) => ({
		quantidade: 1,
		valorVendaTotalLiquido: 10,
		produto: { nome: `Produto ${index + 1}` },
	}));
	const full = buildSaleCompositionSummary(itens);
	const limited = buildSaleCompositionSummary(itens, 60);
	assert.equal(full.split("; ").length, 5);
	assert.equal(limited, "1x Produto 1 - R$ 10,00; 1x Produto 2 - R$ 10,00 (+3 itens)");
	assert.ok(limited.length <= 60 + " (+3 itens)".length);
});

test("composição: venda sem itens vira célula vazia", () => {
	assert.equal(buildSaleCompositionSummary([]), "");
});

test("pagamentos: à vista recebido, parcelado em andamento e cancelado", () => {
	const summary = buildSalePaymentsSummary([
		paymentGroup(),
		paymentGroup({
			id: "grupo-2",
			metodo: "CARTAO_CREDITO",
			valor: 300,
			parcelasTotal: 3,
			parcelasRecebidas: 2,
			valorRecebido: 200,
			emAtraso: true,
		}),
		paymentGroup({ id: "grupo-3", metodo: "BOLETO", valor: 80, parcelasRecebidas: 0, valorRecebido: 0, cancelado: true }),
	]);
	assert.equal(summary, "Pix R$ 50,00 (recebido); Cartão de crédito 3x R$ 300,00 (2/3 recebidas, em atraso); Boleto R$ 80,00 (cancelado)");
});

test("pagamentos: pendente informa o vencimento quando existe", () => {
	const summary = buildSalePaymentsSummary([
		paymentGroup({ parcelasRecebidas: 0, valorRecebido: 0, ultimoRecebimento: null, proximoVencimento: new Date("2026-09-20T03:00:00.000Z") }),
	]);
	assert.equal(summary, "Pix R$ 50,00 (pendente, vence em 20/09/2026)");
});

test("fiscal: documentos em ordem cronológica com a data do evento relevante", () => {
	const summary = buildSaleFiscalSummary([
		{
			tipo: "NFCE",
			statusInterno: "CANCELADO",
			numero: "1234",
			serie: "1",
			dataAutorizacao: new Date("2026-09-12T03:00:00.000Z"),
			dataCancelamento: new Date("2026-09-13T03:00:00.000Z"),
			dataInsercao: new Date("2026-09-13T00:00:00.000Z"),
		},
		{
			tipo: "NFCE",
			statusInterno: "AUTORIZADO",
			numero: "1234",
			serie: "1",
			dataAutorizacao: new Date("2026-09-12T03:00:00.000Z"),
			dataCancelamento: null,
			dataInsercao: new Date("2026-09-12T00:00:00.000Z"),
		},
		{
			tipo: "NFE",
			statusInterno: "REJEITADO",
			numero: null,
			serie: null,
			dataAutorizacao: null,
			dataCancelamento: null,
			dataInsercao: new Date("2026-09-14T00:00:00.000Z"),
		},
	]);
	assert.equal(summary, "NFC-e Nº 1234 série 1, autorizada em 12/09/2026; NFC-e Nº 1234 série 1, cancelada em 13/09/2026; NF-e, rejeitada");
});

test("fiscal: documento principal é o autorizado mais recente, senão o último", () => {
	const authorized = { statusInterno: "AUTORIZADO" as const, id: "a" };
	const rejected = { statusInterno: "REJEITADO" as const, id: "b" };
	assert.equal(resolvePrimarySaleFiscalDocument([authorized, rejected]), authorized);
	assert.equal(resolvePrimarySaleFiscalDocument([rejected]), rejected);
	assert.equal(resolvePrimarySaleFiscalDocument([]), null);
});
