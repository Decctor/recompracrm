import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeStoreCreditDenial, evaluateStoreCredit, getStoreCreditAvailable, requiresStoreCreditRelease, sumStoreCreditPayments } from "./policy";

const liberado = (fiadoLimite: number | null) => ({ fiadoLiberado: true, fiadoLimite });
const naoLiberado = { fiadoLiberado: false, fiadoLimite: null };

describe("evaluateStoreCredit", () => {
	it("sem exigência na organização, qualquer fiado passa (comportamento de sempre)", () => {
		assert.deepEqual(evaluateStoreCredit({ exigeLiberacao: false, terms: naoLiberado, saldoEmAberto: 9999, valorSolicitado: 500 }), {
			status: "PERMITIDO",
		});
	});

	it("venda sem fiado nunca é barrada", () => {
		assert.equal(evaluateStoreCredit({ exigeLiberacao: true, terms: naoLiberado, saldoEmAberto: 0, valorSolicitado: 0 }).status, "PERMITIDO");
	});

	it("cliente não liberado é barrado", () => {
		assert.deepEqual(evaluateStoreCredit({ exigeLiberacao: true, terms: naoLiberado, saldoEmAberto: 0, valorSolicitado: 10 }), {
			status: "NAO_LIBERADO",
		});
	});

	it("liberado sem limite passa qualquer valor", () => {
		assert.equal(evaluateStoreCredit({ exigeLiberacao: true, terms: liberado(null), saldoEmAberto: 5000, valorSolicitado: 3000 }).status, "PERMITIDO");
	});

	it("o limite é sobre o saldo em aberto, não sobre a venda", () => {
		assert.equal(evaluateStoreCredit({ exigeLiberacao: true, terms: liberado(500), saldoEmAberto: 420, valorSolicitado: 80 }).status, "PERMITIDO");
		assert.deepEqual(evaluateStoreCredit({ exigeLiberacao: true, terms: liberado(500), saldoEmAberto: 420, valorSolicitado: 80.01 }), {
			status: "ACIMA_DO_LIMITE",
			disponivel: 80,
		});
	});

	it("tolera arredondamento de ponto flutuante no saldo", () => {
		assert.equal(evaluateStoreCredit({ exigeLiberacao: true, terms: liberado(100), saldoEmAberto: 70.00000001, valorSolicitado: 30 }).status, "PERMITIDO");
	});

	it("limite zero bloqueia qualquer fiado", () => {
		assert.deepEqual(evaluateStoreCredit({ exigeLiberacao: true, terms: liberado(0), saldoEmAberto: 0, valorSolicitado: 1 }), {
			status: "ACIMA_DO_LIMITE",
			disponivel: 0,
		});
	});
});

describe("getStoreCreditAvailable", () => {
	it("não liberado = 0, sem limite = null, nunca negativo", () => {
		assert.equal(getStoreCreditAvailable({ terms: naoLiberado, saldoEmAberto: 0 }), 0);
		assert.equal(getStoreCreditAvailable({ terms: liberado(null), saldoEmAberto: 100 }), null);
		assert.equal(getStoreCreditAvailable({ terms: liberado(300), saldoEmAberto: 450 }), 0);
		assert.equal(getStoreCreditAvailable({ terms: liberado(300), saldoEmAberto: 120.5 }), 179.5);
	});
});

describe("sumStoreCreditPayments", () => {
	it("soma só a parte fiado da venda", () => {
		assert.equal(
			sumStoreCreditPayments([
				{ metodo: "PIX", valor: 50 },
				{ metodo: "FIADO_NOTA", valor: 30.1 },
				{ metodo: "FIADO_NOTA", valor: 0.2 },
			]),
			30.3,
		);
	});
});

describe("requiresStoreCreditRelease", () => {
	it("ausente no JSON antigo = não exige", () => {
		assert.equal(requiresStoreCreditRelease({ preferencias: {} as never }), false);
		assert.equal(requiresStoreCreditRelease(null), false);
		assert.equal(requiresStoreCreditRelease({ preferencias: { fiado: { exigeLiberacao: true } } as never }), true);
	});
});

describe("describeStoreCreditDenial", () => {
	it("explica o bloqueio em linguagem de balcão", () => {
		assert.equal(describeStoreCreditDenial({ status: "NAO_LIBERADO" }), "Este cliente não está liberado para comprar fiado.");
		assert.equal(describeStoreCreditDenial({ status: "ACIMA_DO_LIMITE", disponivel: 0 }), "Este cliente já usou todo o limite de fiado.");
		assert.equal(
			describeStoreCreditDenial({ status: "ACIMA_DO_LIMITE", disponivel: 1234.5 }),
			"O fiado passa do limite disponível do cliente (R$ 1.234,50).",
		);
	});
});
