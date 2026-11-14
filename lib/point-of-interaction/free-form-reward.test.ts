import assert from "node:assert/strict";
import test from "node:test";
import {
	FREE_FORM_REWARD_DESCRIPTION_MAX_LENGTH,
	getFreeFormRewardBlockReason,
	isFreeFormRewardAllowed,
	normalizeFreeFormRewardDescription,
} from "./free-form-reward";
import { getPoiSaleValueForConfirmation, poiSaleRequiresValueConfirmation } from "./sale-value-confirmation";
import { buildPoiTransactionRequestSummary, withPoiTransactionProcessingResult } from "./transaction-requests";

test("recompensa avulsa é sub-modalidade da troca por recompensas", () => {
	assert.equal(isFreeFormRewardAllowed({ modalidadeRecompensasPermitida: true, modalidadeRecompensaAvulsaPermitida: true }), true);
	assert.equal(isFreeFormRewardAllowed({ modalidadeRecompensasPermitida: false, modalidadeRecompensaAvulsaPermitida: true }), false);
	assert.equal(isFreeFormRewardAllowed({ modalidadeRecompensasPermitida: true, modalidadeRecompensaAvulsaPermitida: false }), false);
});

test("descrição é normalizada e obrigatória", () => {
	assert.equal(normalizeFreeFormRewardDescription("  Kit   churrasco \n"), "Kit churrasco");
	assert.equal(getFreeFormRewardBlockReason({ descricao: "   ", valor: 10 }), "Descreva a recompensa.");
	assert.match(getFreeFormRewardBlockReason({ descricao: "x".repeat(FREE_FORM_REWARD_DESCRIPTION_MAX_LENGTH + 1), valor: 10 }) ?? "", /caracteres/);
});

test("débito precisa ser positivo e caber no saldo, quando o saldo é conhecido", () => {
	assert.equal(getFreeFormRewardBlockReason({ descricao: "Kit", valor: null }), "Informe quanto debitar do saldo.");
	assert.equal(getFreeFormRewardBlockReason({ descricao: "Kit", valor: 0 }), "Informe quanto debitar do saldo.");
	assert.equal(getFreeFormRewardBlockReason({ descricao: "Kit", valor: Number.NaN }), "Informe quanto debitar do saldo.");
	assert.equal(getFreeFormRewardBlockReason({ descricao: "Kit", valor: 501, availableBalance: 500 }), "Saldo insuficiente.");
	assert.equal(getFreeFormRewardBlockReason({ descricao: "Kit", valor: 500, availableBalance: 500 }), null);
	// Sem saldo conhecido (aprovação sem linha de saldo), o servidor decide no débito FIFO.
	assert.equal(getFreeFormRewardBlockReason({ descricao: "Kit", valor: 9999 }), null);
});

test("recompensa avulsa não pede confirmação de valor de venda", () => {
	const sale = { valor: 0, cashback: { aplicar: false, valor: 0 }, freeFormReward: { descricao: "Kit", valor: 300 } };
	assert.equal(poiSaleRequiresValueConfirmation(true, sale), false);
	assert.equal(getPoiSaleValueForConfirmation(sale), 0);
	// Sem a recompensa avulsa, a regra de antes continua valendo.
	assert.equal(poiSaleRequiresValueConfirmation(true, { ...sale, freeFormReward: null }), true);
});

const baseInput = {
	orgId: "org",
	client: { id: "cli", nome: "Ana", cpfCnpj: null, telefone: "11999999999" },
	sale: { valor: 0, entregaModalidade: "PRESENCIAL" as const, cashback: { aplicar: false, valor: 0 }, partnerCode: null, coupon: null },
};

test("resumo do pedido do celular: modo RECOMPENSA, débito a definir", () => {
	const summary = buildPoiTransactionRequestSummary({
		...baseInput,
		sale: { ...baseInput.sale, freeFormReward: { descricao: "  Kit churrasco ", valor: null } },
	} as never);
	assert.equal(summary.venda.modo, "RECOMPENSA");
	assert.equal(summary.venda.valorBruto, 0);
	assert.equal(summary.venda.valorResgate, 0);
	assert.equal(summary.venda.valorFinal, 0);
	assert.deepEqual(summary.recompensaAvulsa, { descricao: "Kit churrasco", valor: null });
	assert.deepEqual(summary.recompensas, []);
});

test("aprovação grava no resumo o débito definido pelo operador", () => {
	const summary = buildPoiTransactionRequestSummary({
		...baseInput,
		sale: { ...baseInput.sale, freeFormReward: { descricao: "Kit churrasco", valor: null } },
	} as never);
	const approved = withPoiTransactionProcessingResult({
		resumo: summary,
		resultado: {
			saleId: null,
			freeFormReward: { descricao: "Kit churrasco", valor: 450 },
			clientAccumulatedCashbackValue: 0,
			clientNewOverallAvailableBalance: 50,
			visualClientAccumulatedCashbackValue: 0,
			visualClientNewOverallAvailableBalance: 50,
		},
		status: "APROVADO",
	});
	assert.deepEqual(approved.recompensaAvulsa, { descricao: "Kit churrasco", valor: 450 });
	assert.equal(approved.venda.valorResgate, 450);
	assert.equal(approved.statusPublico, "APROVADO");
});
