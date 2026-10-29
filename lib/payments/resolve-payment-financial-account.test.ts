import assert from "node:assert/strict";
import { test } from "node:test";
import { FALLBACK_PAYMENT_METHOD_DEFAULTS } from "./defaults";
import { resolvePaymentFinancialAccountsAgainstAccounts } from "./resolve-payment-financial-account";

const CONTA_PADRAO_PIX = "conta-pix-padrao";
const CONTA_B2B = "conta-b2b";

function buildMethodsConfig({ contaFinanceiraEditavel }: { contaFinanceiraEditavel: boolean }) {
	return {
		...FALLBACK_PAYMENT_METHOD_DEFAULTS,
		PIX: {
			...FALLBACK_PAYMENT_METHOD_DEFAULTS.PIX,
			contaFinanceiraPadraoId: CONTA_PADRAO_PIX,
			contaFinanceiraEditavel,
		},
	};
}

const pagamentoBase = { metodo: "PIX", valor: 100, efetivacaoTipo: "IMEDIATA" } as const;

test("sem escolha explícita, cai na conta padrão do método", () => {
	const [resolved] = resolvePaymentFinancialAccountsAgainstAccounts({
		methodsConfig: buildMethodsConfig({ contaFinanceiraEditavel: false }),
		payments: [{ ...pagamentoBase }],
		activeAccountIds: new Set([CONTA_PADRAO_PIX]),
	});
	assert.equal(resolved.contaFinanceiraId, CONTA_PADRAO_PIX);
});

test("com o campo editável, a conta escolhida pelo operador prevalece sobre a padrão", () => {
	const [resolved] = resolvePaymentFinancialAccountsAgainstAccounts({
		methodsConfig: buildMethodsConfig({ contaFinanceiraEditavel: true }),
		payments: [{ ...pagamentoBase, contaFinanceiraId: CONTA_B2B }],
		activeAccountIds: new Set([CONTA_B2B, CONTA_PADRAO_PIX]),
	});
	assert.equal(resolved.contaFinanceiraId, CONTA_B2B);
});

test("conta escolhida com o campo desabilitado é recusada, não silenciosamente ignorada", () => {
	assert.throws(
		() =>
			resolvePaymentFinancialAccountsAgainstAccounts({
				methodsConfig: buildMethodsConfig({ contaFinanceiraEditavel: false }),
				payments: [{ ...pagamentoBase, contaFinanceiraId: CONTA_B2B }],
				activeAccountIds: new Set([CONTA_B2B, CONTA_PADRAO_PIX]),
			}),
		/não permite escolher a conta financeira/,
	);
});

test("conta de outra organização ou inativa é recusada", () => {
	assert.throws(
		() =>
			resolvePaymentFinancialAccountsAgainstAccounts({
				methodsConfig: buildMethodsConfig({ contaFinanceiraEditavel: true }),
				payments: [{ ...pagamentoBase, contaFinanceiraId: "conta-de-outra-org" }],
				activeAccountIds: new Set([CONTA_B2B, CONTA_PADRAO_PIX]),
			}),
		/não encontrada ou inativa/,
	);
});

test("método não habilitado é recusado antes de qualquer resolução de conta", () => {
	assert.throws(
		() =>
			resolvePaymentFinancialAccountsAgainstAccounts({
				methodsConfig: buildMethodsConfig({ contaFinanceiraEditavel: true }),
				payments: [{ metodo: "BOLETO", valor: 100, efetivacaoTipo: "PENDENTE" }],
				activeAccountIds: new Set([CONTA_PADRAO_PIX]),
			}),
		/não está habilitado/,
	);
});

test("a conta padrão também precisa estar ativa e pertencer à organização", () => {
	assert.throws(() => resolvePaymentFinancialAccountsAgainstAccounts({
		methodsConfig: buildMethodsConfig({ contaFinanceiraEditavel: true }),
		payments: [{ ...pagamentoBase }],
		activeAccountIds: new Set(),
	}), /não encontrada ou inativa/);
});

test("cada pagamento do split resolve sua própria conta", () => {
	const resolved = resolvePaymentFinancialAccountsAgainstAccounts({
		methodsConfig: buildMethodsConfig({ contaFinanceiraEditavel: true }),
		payments: [
			{ ...pagamentoBase, valor: 60, contaFinanceiraId: CONTA_B2B },
			{ ...pagamentoBase, valor: 40 },
		],
		activeAccountIds: new Set([CONTA_B2B, CONTA_PADRAO_PIX]),
	});
	assert.deepEqual(
		resolved.map((payment) => payment.contaFinanceiraId),
		[CONTA_B2B, CONTA_PADRAO_PIX],
	);
});
