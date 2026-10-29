import assert from "node:assert/strict";
import test from "node:test";
import { resolvePaymentReceiptConditions } from "./receipt-conditions";
import { FALLBACK_PAYMENT_METHOD_DEFAULTS } from "./defaults";
import { FinancialAccountConfigurationSchema } from "@/schemas/financial";
import type { TPaymentSplit } from "./types";

const payment: TPaymentSplit = { metodo: "CARTAO_CREDITO", valor: 600, totalParcelas: 3, efetivacaoTipo: "IMEDIATA", dataPrevisao: "2026-11-01" };
function resolve(behavior: "TRANSACAO_UNICA" | "TRANSACOES_PARCELADAS", overrides: Partial<TPaymentSplit> = {}) {
	return resolvePaymentReceiptConditions({
		payment: { ...payment, ...overrides },
		methodConfig: FALLBACK_PAYMENT_METHOD_DEFAULTS.CARTAO_CREDITO,
		accountConfiguration: { categoria: "OUTRO", recebimentos: { metodos: [{ metodo: "CARTAO_CREDITO", comportamentoParcelas: behavior }] } },
	});
}

test("a conta determina a geração sem confundir parcelas com aprovação", () => {
	const single = resolve("TRANSACAO_UNICA");
	assert.equal(single.efetivacaoTipo, "IMEDIATA");
	assert.equal(single.totalParcelas, 3);
	assert.equal(single.condicoesRecebimento.intervaloMeses, null);
	assert.equal(resolve("TRANSACAO_UNICA", { efetivacaoTipo: "PENDENTE" }).efetivacaoTipo, "PENDENTE");
	assert.equal(resolve("TRANSACOES_PARCELADAS").efetivacaoTipo, "PENDENTE");
});

test("terminal permanece pendente e gera transação única mesmo em conta legada", () => {
	const result = resolve("TRANSACOES_PARCELADAS", { dispositivoId: "terminal" });
	assert.equal(result.efetivacaoTipo, "PENDENTE");
	assert.equal(result.condicoesRecebimento.comportamentoParcelas, "TRANSACAO_UNICA");
});

test("condições adulteradas não substituem a configuração da conta", () => {
	const result = resolve("TRANSACOES_PARCELADAS", { condicoesRecebimento: { comportamentoParcelas: "TRANSACAO_UNICA" } } as Partial<TPaymentSplit>);
	assert.equal(result.condicoesRecebimento.comportamentoParcelas, "TRANSACOES_PARCELADAS");
});

test("recusa quantidade fracionária, fora do limite e parcelas menores que um centavo", () => {
	for (const overrides of [{ totalParcelas: 1.5 }, { totalParcelas: 13 }, { totalParcelas: 0 }, { valor: 0.01 }, { valor: NaN }, { valor: -5 }]) {
		assert.throws(() => resolve("TRANSACAO_UNICA", overrides));
	}
});

test("parcelas futuras precisam de previsão válida", () => {
	assert.throws(() => resolve("TRANSACOES_PARCELADAS", { dataPrevisao: "inválida" }), /previsão válida/);
	assert.throws(() => resolve("TRANSACOES_PARCELADAS", { dataPrevisao: null }), /previsão válida/);
});

test("sem regra na conta, o cartão mantém o comportamento anterior à configuração", () => {
	for (const accountConfiguration of [null, { categoria: "OUTRO" } as const]) {
		const result = resolvePaymentReceiptConditions({ payment, methodConfig: FALLBACK_PAYMENT_METHOD_DEFAULTS.CARTAO_CREDITO, accountConfiguration });
		assert.equal(result.condicoesRecebimento.comportamentoParcelas, "TRANSACOES_PARCELADAS");
		assert.equal(result.efetivacaoTipo, "PENDENTE");
	}
});

test("conta com lista explícita recusa método fora dela", () => {
	assert.throws(() => resolve("TRANSACAO_UNICA", { metodo: "PIX", totalParcelas: undefined }), /não aceita este método/);
});

test("edição preserva as condições gravadas mesmo após mudança na conta", () => {
	const result = resolvePaymentReceiptConditions({
		payment,
		methodConfig: FALLBACK_PAYMENT_METHOD_DEFAULTS.CARTAO_CREDITO,
		accountConfiguration: { categoria: "OUTRO", recebimentos: { metodos: [{ metodo: "CARTAO_CREDITO", comportamentoParcelas: "TRANSACOES_PARCELADAS" }] } },
		previousConditions: { versao: 1, comportamentoParcelas: "TRANSACAO_UNICA", intervaloMeses: null },
	});
	assert.equal(result.condicoesRecebimento.comportamentoParcelas, "TRANSACAO_UNICA");
	assert.equal(result.efetivacaoTipo, "IMEDIATA");
});

test("schema impede métodos repetidos e parcelamento em débito", () => {
	const rule = { metodo: "CARTAO_CREDITO", comportamentoParcelas: "TRANSACAO_UNICA" };
	assert.equal(FinancialAccountConfigurationSchema.safeParse({ categoria: "OUTRO", recebimentos: { metodos: [rule, rule] } }).success, false);
	assert.equal(FinancialAccountConfigurationSchema.safeParse({ categoria: "OUTRO", recebimentos: { metodos: [{ metodo: "CARTAO_DEBITO", comportamentoParcelas: "TRANSACOES_PARCELADAS" }] } }).success, false);
});
