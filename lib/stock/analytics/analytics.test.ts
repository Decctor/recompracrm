import assert from "node:assert/strict";
import test from "node:test";
import { classifyAbc, sampleAbcCurve, summarizeAbc } from "./abc";
import { buildBackwardSeries, resolveStartValue, weekKeyOf } from "./balance-series";
import { resolveAverageBalance, resolveConsumption, resolveCoverageDays, resolveTurnover } from "./consumption";
import { inferStockLossReason } from "./loss-reasons";
import { listLocalDayKeys } from "./periods";
import { derivePriceHistory } from "./price-history";
import { DEFAULT_LEAD_TIME_DAYS, resolveLeadTime, resolveReorderPoint } from "./replenishment";

const days = Array.from({ length: 10 }, (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`);

test("consumo médio ignora a saída atípica e mantém o resto", () => {
	const lines = days.map((dia) => ({ dia, quantidade: 2 }));
	lines.push({ dia: "2026-10-05", quantidade: 30 });
	const result = resolveConsumption({ lines, days });
	assert.equal(result.consumoMedioDia, 2);
	assert.equal(result.desvioPadrao, 0);
	assert.equal(result.saidasAtipicas, 1);
	// média bruta = (20 + 30) / 10 = 5 → limite 15
	assert.equal(result.limiteAtipico, 15);
});

test("linha de uma unidade nunca é atípica e sem consumo não há limite", () => {
	const result = resolveConsumption({ lines: [{ dia: "2026-10-01", quantidade: 1 }], days });
	assert.equal(result.saidasAtipicas, 0);
	assert.equal(result.consumoMedioDia, 0.1);
	assert.equal(resolveConsumption({ lines: [], days }).limiteAtipico, null);
});

test("cobertura, giro e saldo médio", () => {
	assert.equal(resolveCoverageDays(14, 4.8)?.toFixed(2), "2.92");
	assert.equal(resolveCoverageDays(14, 0), null);
	assert.equal(resolveCoverageDays(-3, 2), 0);
	// saldo final 10, entrada de +6 no dia índice 2 de 4 → saldos [4, 4, 10, 10] → média 7
	assert.equal(resolveAverageBalance({ finalBalance: 10, weightedDeltaSum: 6 * 2, dayCount: 4 }), 7);
	assert.equal(resolveTurnover(14, 7), 2);
	assert.equal(resolveTurnover(14, 0), null);
});

test("prazo de reposição usa as últimas 6 compras e cai em 7 dias sem amostra", () => {
	assert.deepEqual(resolveLeadTime([]), { prazoDias: DEFAULT_LEAD_TIME_DAYS, origem: "PADRAO", compras: 0 });
	const samples = Array.from({ length: 8 }, (_, index) => ({
		pedidoData: new Date(Date.UTC(2026, 0, 1 + index * 10)),
		recebimentoData: new Date(Date.UTC(2026, 0, 1 + index * 10 + (index < 2 ? 8 : 4))),
	}));
	assert.deepEqual(resolveLeadTime(samples), { prazoDias: 4, origem: "COMPRAS", compras: 6 });
});

test("ponto de pedido, segurança e sugestão", () => {
	const result = resolveReorderPoint({ dailyConsumption: 4.8, dailyStdDev: 1.2, leadTimeDays: 5, balance: 14 });
	assert.equal(result.estoqueSeguranca, 4); // 1,65 × 1,2 × √5 = 4,43
	assert.equal(result.pontoPedido, 28); // 4,8 × 5 + 4
	assert.equal(result.sugestao, 86); // 4,8 × 20 + 4 − 14
	assert.equal(result.abaixoPontoPedido, true);
	assert.equal(resolveReorderPoint({ dailyConsumption: 0, dailyStdDev: 0, leadTimeDays: 7, balance: 0 }).abaixoPontoPedido, false);
});

test("curva ABC: limites de 80% e 95% e quem não vendeu é C", () => {
	const ranked = classifyAbc([
		{ produtoId: "a", valor: 70 },
		{ produtoId: "b", valor: 15 },
		{ produtoId: "c", valor: 8 },
		{ produtoId: "d", valor: 4 },
		{ produtoId: "e", valor: 3 },
		{ produtoId: "f", valor: 0 },
	]);
	assert.deepEqual(
		ranked.map((item) => item.classe),
		["A", "A", "B", "B", "C", "C"],
	);
	assert.equal(ranked[0].posicao, 1);
	const summary = summarizeAbc(ranked);
	assert.equal(summary.A.produtos, 2);
	assert.equal(summary.A.participacao, 0.85);
	const curve = sampleAbcCurve(ranked, 3);
	assert.deepEqual(curve[0], { x: 0, y: 0 });
	assert.equal(curve[curve.length - 1].x, 1);
});

test("série reconstruída termina no valor atual", () => {
	const deltaByDay = new Map([
		["2026-10-02", 10],
		["2026-10-03", -4],
	]);
	const series = buildBackwardSeries({ days: ["2026-10-01", "2026-10-02", "2026-10-03"], currentValue: 20, deltaByDay });
	assert.deepEqual(
		series.map((point) => point.valor),
		[14, 24, 20],
	);
	assert.equal(resolveStartValue({ currentValue: 20, deltaByDay }), 14);
	assert.equal(weekKeyOf("2026-10-18"), "2026-10-12");
});

test("dias locais cobrem o intervalo inteiro no fuso da operação", () => {
	const keys = listLocalDayKeys(new Date("2026-10-01T12:00:00Z"), new Date("2026-10-05T02:00:00Z"));
	assert.deepEqual(keys, ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
});

test("motivo de perda inferido", () => {
	const date = new Date("2026-10-10T12:00:00Z");
	assert.equal(inferStockLossReason({ tipo: "AJUSTE", dataMovimentacao: date, loteDataValidade: null }), "AJUSTE_RECONTAGEM");
	assert.equal(
		inferStockLossReason({ tipo: "DESCARTE", dataMovimentacao: date, loteDataValidade: new Date("2026-10-09T00:00:00Z") }),
		"VALIDADE_VENCIDA",
	);
	assert.equal(
		inferStockLossReason({ tipo: "DESCARTE", dataMovimentacao: date, loteDataValidade: new Date("2026-11-09T00:00:00Z") }),
		"DESCARTE_MANUAL",
	);
});

test("histórico de preço: reajuste confirmado, preço avulso ignorado, fecha no preço atual", () => {
	const result = derivePriceHistory({
		dailyPrices: [
			{ dia: "2026-01-01", preco: 69.9 },
			{ dia: "2026-01-05", preco: 59.9 }, // avulso: o dia seguinte volta a 69,90
			{ dia: "2026-01-06", preco: 69.9 },
			{ dia: "2026-03-02", preco: 72.9 },
			{ dia: "2026-03-04", preco: 72.9 },
		],
		currentPrice: 74.9,
		knownChange: null,
		windowStart: "2025-10-18",
	});
	assert.equal(result.precoInicio, 69.9);
	assert.deepEqual(
		result.alteracoes.map((change) => [change.dia, change.de, change.para, change.origem]),
		[
			["2026-03-02", 69.9, 72.9, "VENDAS"],
			["2026-03-04", 72.9, 74.9, "CADASTRO"],
		],
	);
});

test("histórico de preço: alteração de cadastro tem precedência a partir da sua data", () => {
	const result = derivePriceHistory({
		dailyPrices: [
			{ dia: "2026-01-01", preco: 69.9 },
			{ dia: "2026-10-09", preco: 74.9 },
			{ dia: "2026-10-10", preco: 74.9 },
		],
		currentPrice: 74.9,
		knownChange: { dia: "2026-10-08", de: 72.9, para: 74.9 },
		windowStart: "2025-10-18",
	});
	assert.deepEqual(
		result.alteracoes.map((change) => [change.dia, change.de, change.para, change.origem]),
		[["2026-10-08", 72.9, 74.9, "CADASTRO"]],
	);
});
