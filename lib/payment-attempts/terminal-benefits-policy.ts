import { getCashbackRedemptionMaximum } from "@/lib/cashback/client-position";
import type { TCouponEvaluationResult } from "@/lib/coupons/engine";
import type { TCouponBenefitTypeEnum } from "@/schemas/enums";
import { formatToMoney } from "@/lib/formatting";
import { PaymentTerminalError } from "./errors";
import { roundCents } from "./terminal-cart-item";

// Benefícios na venda do terminal, em funções puras: o que o terminal pode aplicar e quanto vale.
// As regras de fundo são as do checkout (cupom pelo motor, cashback pelo teto do programa,
// recompensa exclusiva); o recorte do terminal é só um:
//
// - cupom MANUAL não entra: a validação dele é do operador (condições em texto, valor digitado) e
//   conta no teto de desconto — no terminal, sem teto, viraria um pedido de aprovação a cada venda.

export const TERMINAL_MANUAL_COUPON_REASON = "Cupom de validação manual: aplique pelo PDV.";
export const TERMINAL_GIFT_COUPON_REASON = "Cupom de brinde: escolha o produto pelo PDV ou pela loja digital.";

/** Programa e saldo como o terminal precisa para decidir o cashback. */
export type TTerminalCashbackView = {
	programaId: string;
	terminologia: string;
	saldoDisponivel: number;
	limiteTipo: "FIXO" | "PERCENTUAL" | null;
	limiteValor: number | null;
	/** Pode virar desconto nesta superfície; quando falso, `motivo` diz por quê. */
	permitido: boolean;
	motivo: string | null;
};

export type TTerminalCashbackProgram = {
	id: string;
	ativo: boolean;
	terminologia: string;
	modalidadeDescontosPermitida: boolean;
	resgateLimiteTipo: "FIXO" | "PERCENTUAL" | null;
	resgateLimiteValor: number | null;
};

export function buildTerminalCashbackView({
	program,
	availableBalance,
	surfaceBlockReason,
}: {
	program: TTerminalCashbackProgram;
	availableBalance: number;
	surfaceBlockReason: string | null;
}): TTerminalCashbackView {
	const saldoDisponivel = roundCents(Math.max(0, availableBalance));
	const motivo = !program.ativo
		? "O programa de cashback está inativo."
		: !program.modalidadeDescontosPermitida
			? "O programa não usa o saldo como desconto."
			: surfaceBlockReason
				? surfaceBlockReason
				: saldoDisponivel <= 0
					? "O cliente ainda não tem saldo."
					: null;
	return {
		programaId: program.id,
		terminologia: program.terminologia,
		saldoDisponivel,
		limiteTipo: program.resgateLimiteTipo,
		limiteValor: program.resgateLimiteValor,
		permitido: motivo === null,
		motivo,
	};
}

/** Teto do cashback para o valor restante depois do cupom. Zero quando o programa não permite. */
export function getTerminalCashbackMaximum(cashback: TTerminalCashbackView | null, valueBeforeCashback: number) {
	if (!cashback || !cashback.permitido) return 0;
	return getCashbackRedemptionMaximum({
		program: { modalidadeDescontosPermitida: true, resgateLimiteTipo: cashback.limiteTipo, resgateLimiteValor: cashback.limiteValor },
		availableBalance: cashback.saldoDisponivel,
		valueBeforeCashback,
	});
}

/** Cupom como o terminal o mostra: selecionável (com o desconto deste carrinho) ou com o motivo. */
export type TTerminalCouponView = {
	id: string;
	titulo: string;
	descricao: string | null;
	codigo: string | null;
	vigenciaFim: Date | null;
	selecionavel: boolean;
	valorDesconto: number | null;
	motivo: string | null;
};

export function buildTerminalCouponView(coupon: {
	beneficioTipo?: TCouponBenefitTypeEnum;
	id: string;
	titulo: string;
	descricao: string | null;
	codigo: string | null;
	vigenciaFim: Date | null;
	validacaoModo: "AUTOMATICA" | "MANUAL";
	avaliacao: TCouponEvaluationResult | null;
}): TTerminalCouponView {
	const base = { id: coupon.id, titulo: coupon.titulo, descricao: coupon.descricao, codigo: coupon.codigo, vigenciaFim: coupon.vigenciaFim };
	if (coupon.beneficioTipo === "BRINDE") return { ...base, selecionavel: false, valorDesconto: null, motivo: TERMINAL_GIFT_COUPON_REASON };
	if (coupon.validacaoModo !== "AUTOMATICA") return { ...base, selecionavel: false, valorDesconto: null, motivo: TERMINAL_MANUAL_COUPON_REASON };
	const evaluation = coupon.avaliacao;
	if (!evaluation) return { ...base, selecionavel: false, valorDesconto: null, motivo: "Adicione itens para avaliar o cupom." };
	if (!evaluation.elegivel) return { ...base, selecionavel: false, valorDesconto: null, motivo: evaluation.motivo };
	if (evaluation.valorDesconto <= 0) return { ...base, selecionavel: false, valorDesconto: null, motivo: "O cupom não gera desconto neste carrinho." };
	return { ...base, selecionavel: true, valorDesconto: roundCents(evaluation.valorDesconto), motivo: null };
}

export type TTerminalBenefitsRequest = {
	cupomId?: string | null;
	cashbackResgate?: number | null;
	recompensas?: { recompensaId: string; quantidade?: number | null }[] | null;
};

/**
 * Decide os benefícios da venda contra o que o servidor acabou de ler (cupons avaliados no
 * carrinho precificado, programa e saldo). Recusa com mensagem para o operador; nunca ajusta um
 * valor em silêncio — o total que o cliente pagou foi calculado com o valor que a tela mostrou.
 */
/**
 * `itemsTotal` é o valor que os benefícios podem abater: os itens menos o desconto manual da venda
 * (que vem antes do cupom, como no checkout web).
 */
export function decideTerminalBenefits({
	itemsTotal,
	hasClient,
	request,
	coupons,
	cashback,
}: {
	itemsTotal: number;
	hasClient: boolean;
	request: TTerminalBenefitsRequest | null | undefined;
	coupons: TTerminalCouponView[];
	cashback: TTerminalCashbackView | null;
}) {
	const requestedCashback = roundCents(request?.cashbackResgate ?? 0);
	const rewards = (request?.recompensas ?? []).filter((reward) => (reward.quantidade ?? 1) > 0);
	const wantsAny = !!request?.cupomId || requestedCashback > 0 || rewards.length > 0;
	if (!wantsAny)
		return { cupom: null, cupomDesconto: 0, cashbackResgate: 0, cashbackProgramaId: null, recompensas: [], total: roundCents(itemsTotal) };

	const invalid = (message: string): never => {
		throw new PaymentTerminalError(422, "VALIDATION_ERROR", message);
	};
	if (requestedCashback < 0) invalid("O resgate de cashback não pode ser negativo.");
	if (!hasClient) invalid("Identifique o cliente para usar cupom, cashback ou recompensa.");
	if (rewards.length > 0 && (request?.cupomId || requestedCashback > 0)) {
		invalid("Recompensa não se combina com cupom nem com cashback: escolha um benefício.");
	}

	let cupom: TTerminalCouponView | null = null;
	if (request?.cupomId) {
		cupom = coupons.find((coupon) => coupon.id === request.cupomId) ?? null;
		if (!cupom) invalid("Cupom indisponível para este cliente.");
		if (!cupom!.selecionavel || cupom!.valorDesconto === null) invalid(cupom!.motivo ?? "Cupom indisponível para este carrinho.");
	}
	// O motor avalia o cupom sobre os itens; depois de um desconto manual ele pode passar do que
	// sobrou. Recusa em vez de cortar: o servidor confere o valor declarado contra o motor.
	const cupomDesconto = cupom?.valorDesconto ?? 0;
	if (cupomDesconto > roundCents(itemsTotal) + 0.001) invalid("O cupom passa do valor da venda depois do desconto: reduza o desconto ou tire o cupom.");
	const valueBeforeCashback = roundCents(itemsTotal - cupomDesconto);

	if (requestedCashback > 0) {
		if (!cashback) invalid("O cliente não participa de um programa de cashback.");
		if (!cashback!.permitido) invalid(cashback!.motivo ?? "Resgate de cashback indisponível.");
		const maximum = getTerminalCashbackMaximum(cashback, valueBeforeCashback);
		if (requestedCashback > maximum + 0.001) invalid(`O resgate de cashback excede o máximo desta venda (${formatToMoney(maximum)}).`);
	}

	return {
		cupom,
		cupomDesconto,
		cashbackResgate: requestedCashback,
		cashbackProgramaId: requestedCashback > 0 ? cashback!.programaId : null,
		recompensas: rewards.map((reward) => ({ recompensaId: reward.recompensaId, quantidade: reward.quantidade ?? 1 })),
		total: roundCents(valueBeforeCashback - requestedCashback),
	};
}
export type TTerminalBenefitsDecision = ReturnType<typeof decideTerminalBenefits>;
