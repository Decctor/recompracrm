import assert from "node:assert/strict";
import test from "node:test";
import { PaymentTerminalError } from "./errors";
import {
	TERMINAL_MANUAL_COUPON_REASON,
	TERMINAL_GIFT_COUPON_REASON,
	buildTerminalCashbackView,
	buildTerminalCouponView,
	decideTerminalBenefits,
	getTerminalCashbackMaximum,
} from "./terminal-benefits-policy";

const program = {
	id: "prog-1",
	ativo: true,
	terminologia: "DINHEIRO",
	modalidadeDescontosPermitida: true,
	resgateLimiteTipo: "PERCENTUAL" as const,
	resgateLimiteValor: 50,
};
const cashback = buildTerminalCashbackView({ program, availableBalance: 30, surfaceBlockReason: null });
const couponBase = { titulo: "10% off", descricao: null, codigo: "DEZ", vigenciaFim: null };
const automatic = buildTerminalCouponView({
	...couponBase,
	id: "c-auto",
	validacaoModo: "AUTOMATICA",
	avaliacao: { elegivel: true, valorDesconto: 5, aplicacao: "VENDA_TOTAL", descontosPorItem: [] },
});
const manual = buildTerminalCouponView({ ...couponBase, id: "c-manual", validacaoModo: "MANUAL", avaliacao: null });

test("gift coupons stay unavailable on terminals without product selection", () => {
	const gift = buildTerminalCouponView({ ...couponBase, id: "gift", beneficioTipo: "BRINDE", validacaoModo: "AUTOMATICA", avaliacao: { elegivel: true, valorDesconto: 10, aplicacao: "ITENS_ELEGIVEIS", descontosPorItem: [{ chave: "item", valorDesconto: 10 }] } });
	assert.equal(gift.selecionavel, false);
	assert.equal(gift.valorDesconto, null);
	assert.equal(gift.motivo, TERMINAL_GIFT_COUPON_REASON);
});

function rejects(fn: () => unknown, message: RegExp) {
	assert.throws(fn, (error: unknown) => error instanceof PaymentTerminalError && error.status === 422 && message.test(error.message));
}

test("cashback view explains why the balance cannot become a discount", () => {
	assert.equal(cashback.permitido, true);
	assert.equal(buildTerminalCashbackView({ program, availableBalance: 0, surfaceBlockReason: null }).motivo, "O cliente ainda não tem saldo.");
	assert.equal(
		buildTerminalCashbackView({ program, availableBalance: 30, surfaceBlockReason: "Resgates pelo PDV estão desativados neste programa de cashback." })
			.permitido,
		false,
	);
	assert.equal(
		buildTerminalCashbackView({ program: { ...program, modalidadeDescontosPermitida: false }, availableBalance: 30, surfaceBlockReason: null })
			.permitido,
		false,
	);
	assert.equal(getTerminalCashbackMaximum(cashback, 40), 20);
	assert.equal(getTerminalCashbackMaximum(null, 40), 0);
});

test("manual coupons are listed but not selectable on the terminal", () => {
	assert.equal(manual.selecionavel, false);
	assert.equal(manual.motivo, TERMINAL_MANUAL_COUPON_REASON);
	assert.equal(automatic.selecionavel, true);
	assert.equal(automatic.valorDesconto, 5);
});

test("coupon then cashback: the cashback ceiling applies to what is left after the coupon", () => {
	const decision = decideTerminalBenefits({
		itemsTotal: 40,
		hasClient: true,
		request: { cupomId: "c-auto", cashbackResgate: 17.5 },
		coupons: [automatic, manual],
		cashback,
	});
	assert.equal(decision.cupomDesconto, 5);
	assert.equal(decision.cashbackResgate, 17.5);
	assert.equal(decision.cashbackProgramaId, "prog-1");
	assert.equal(decision.total, 17.5);
	rejects(
		() =>
			decideTerminalBenefits({ itemsTotal: 40, hasClient: true, request: { cupomId: "c-auto", cashbackResgate: 18 }, coupons: [automatic], cashback }),
		/excede o máximo/,
	);
});

test("refusals: no client, manual coupon, rewards combined with another benefit", () => {
	rejects(
		() => decideTerminalBenefits({ itemsTotal: 40, hasClient: false, request: { cashbackResgate: 5 }, coupons: [], cashback }),
		/Identifique o cliente/,
	);
	rejects(
		() => decideTerminalBenefits({ itemsTotal: 40, hasClient: true, request: { cupomId: "c-manual" }, coupons: [manual], cashback }),
		/validação manual/,
	);
	rejects(() => decideTerminalBenefits({ itemsTotal: 40, hasClient: true, request: { cupomId: "c-gone" }, coupons: [], cashback }), /indisponível/);
	rejects(
		() =>
			decideTerminalBenefits({
				itemsTotal: 40,
				hasClient: true,
				request: { cashbackResgate: 5, recompensas: [{ recompensaId: "r1" }] },
				coupons: [],
				cashback,
			}),
		/Recompensa não se combina/,
	);
});

test("no benefit requested keeps the items total and needs no client", () => {
	const decision = decideTerminalBenefits({ itemsTotal: 40, hasClient: false, request: null, coupons: [], cashback: null });
	assert.equal(decision.total, 40);
	assert.equal(decision.cupom, null);
	const rewardsOnly = decideTerminalBenefits({
		itemsTotal: 0,
		hasClient: true,
		request: { recompensas: [{ recompensaId: "r1", quantidade: 2 }] },
		coupons: [],
		cashback,
	});
	assert.deepEqual(rewardsOnly.recompensas, [{ recompensaId: "r1", quantidade: 2 }]);
	assert.equal(rewardsOnly.total, 0);
});
