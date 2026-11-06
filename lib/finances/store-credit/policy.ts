import type { TPaymentMethodEnum, TStoreCreditApprovalReasonEnum } from "@/schemas/enums";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { STORE_CREDIT_METHOD, STORE_CREDIT_TOLERANCE } from "./constants";

/**
 * Regra de liberação de fiado — pura, sem banco. Quem compra fiado e até quanto.
 *
 * Fiado é crédito da loja ao cliente, então a decisão mora no cliente (liberado + limite) e é
 * tomada por quem tem `financeiro.liberarFiado`. O limite é sobre o saldo EM ABERTO, não sobre
 * cada venda: um cliente com limite de R$ 500 e R$ 420 pendurados ainda pode levar R$ 80.
 *
 * A exigência é opcional por organização: sem ela, qualquer cliente identificado compra fiado,
 * como sempre foi. Fora da regra, a venda só passa com uma aprovação VENDA_FIADO de um gestor —
 * avaliada em `lib/finances/store-credit/authorization.ts`, que é quem chama esta função.
 */

export type TClientStoreCreditTerms = {
	fiadoLiberado: boolean;
	/** Teto do saldo em aberto. `null` com o cliente liberado = sem limite. */
	fiadoLimite: number | null;
};

export type TStoreCreditEvaluation =
	| { status: "PERMITIDO" }
	| { status: "NAO_LIBERADO" }
	| { status: "ACIMA_DO_LIMITE"; disponivel: number };

/** A organização exige liberação para fiado? Ausente (JSON antigo) = não. */
export function requiresStoreCreditRelease(configuracao: Pick<TOrganizationConfiguration, "preferencias"> | null | undefined): boolean {
	return configuracao?.preferencias?.fiado?.exigeLiberacao === true;
}

/** Quanto fiado o cliente ainda pode tomar. `null` = sem limite; 0 = nada (ou não liberado). */
export function getStoreCreditAvailable({ terms, saldoEmAberto }: { terms: TClientStoreCreditTerms; saldoEmAberto: number }): number | null {
	if (!terms.fiadoLiberado) return 0;
	if (terms.fiadoLimite === null) return null;
	return Math.max(0, roundCents(terms.fiadoLimite - saldoEmAberto));
}

/** Soma do fiado de uma lista de pagamentos (a parte da venda que vira crédito). */
export function sumStoreCreditPayments(payments: { metodo: TPaymentMethodEnum; valor: number }[]): number {
	return roundCents(payments.filter((payment) => payment.metodo === STORE_CREDIT_METHOD).reduce((sum, payment) => sum + payment.valor, 0));
}

export function evaluateStoreCredit({
	exigeLiberacao,
	terms,
	saldoEmAberto,
	valorSolicitado,
}: {
	exigeLiberacao: boolean;
	terms: TClientStoreCreditTerms;
	saldoEmAberto: number;
	valorSolicitado: number;
}): TStoreCreditEvaluation {
	if (!exigeLiberacao || valorSolicitado <= 0) return { status: "PERMITIDO" };
	if (!terms.fiadoLiberado) return { status: "NAO_LIBERADO" };
	const disponivel = getStoreCreditAvailable({ terms, saldoEmAberto });
	if (disponivel === null) return { status: "PERMITIDO" };
	// Meio centavo de folga: o saldo vem de somas em ponto flutuante.
	if (valorSolicitado <= disponivel + STORE_CREDIT_TOLERANCE) return { status: "PERMITIDO" };
	return { status: "ACIMA_DO_LIMITE", disponivel };
}

/** Motivo que vai na solicitação de aprovação, a partir de uma avaliação negada. */
export function getStoreCreditApprovalReason(evaluation: Exclude<TStoreCreditEvaluation, { status: "PERMITIDO" }>): TStoreCreditApprovalReasonEnum {
	return evaluation.status;
}

/** Mensagem do bloqueio, a mesma no balcão e no erro do servidor. */
export function describeStoreCreditDenial(evaluation: Exclude<TStoreCreditEvaluation, { status: "PERMITIDO" }>): string {
	if (evaluation.status === "NAO_LIBERADO") return "Este cliente não está liberado para comprar fiado.";
	if (evaluation.disponivel <= 0) return "Este cliente já usou todo o limite de fiado.";
	return `O fiado passa do limite disponível do cliente (${formatMoney(evaluation.disponivel)}).`;
}

function roundCents(value: number) {
	return Math.round(value * 100) / 100;
}

// Sem `formatToMoney` (lib/formatting) para esta função seguir pura e importável em teste sem o DOM.
function formatMoney(value: number) {
	return `R$ ${value.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}
