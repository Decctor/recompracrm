import type { TCashbackPaymentAccrualRule, TCashbackPaymentAccrualRules } from "@/schemas/cashback-programs";
import type { TPaymentMethodEnum } from "@/schemas/enums";

/**
 * Regras de acúmulo de cashback por forma de pagamento. Puro e client-safe: o PDV, a loja, as
 * integrações e a tela do programa usam a mesma conta. Desenho em
 * docs/cashback-payment-accrual-rules-design.md.
 *
 * Programa sem regras (`acumuloRegrasPagamento` null) NÃO passa por aqui: cada caminho de acúmulo
 * mantém o comportamento anterior às regras. Os chamadores decidem isso com
 * `hasCashbackPaymentAccrualRules`.
 */

/** Forma de pagamento ausente num mapa configurado: pontua, na data da venda. */
export const DEFAULT_CASHBACK_PAYMENT_ACCRUAL_RULE: TCashbackPaymentAccrualRule = { pontua: true, momento: "NA_VENDA" };

const TOLERANCE = 0.01;

export type TAccrualPayment = {
	metodo: TPaymentMethodEnum;
	/** Líquido; linhas negativas (troco) são aceitas e abatem a própria forma. */
	valor: number;
	/** Date = quitado nessa data; null = em aberto; undefined = a fonte não informa (vale a data da venda). */
	quitadoEm?: Date | null;
};

export type TSaleAccrualResolution =
	| { status: "PONTUAVEL"; base: number; momento: Date; metodos: TPaymentMethodEnum[] }
	| { status: "AGUARDANDO"; motivo: "PAGAMENTO_A_DEFINIR" | "PAGAMENTO_INCOMPLETO" | "QUITACAO_PENDENTE" }
	| { status: "SEM_BASE" };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function hasCashbackPaymentAccrualRules(program: { acumuloRegrasPagamento?: TCashbackPaymentAccrualRules | null }) {
	return program.acumuloRegrasPagamento != null;
}

/** Regra da forma; `null` para `A_DEFINIR`, que não tem regra (segura o acúmulo). */
export function getPaymentAccrualRule(rules: TCashbackPaymentAccrualRules | null | undefined, metodo: TPaymentMethodEnum): TCashbackPaymentAccrualRule | null {
	if (metodo === "A_DEFINIR") return null;
	return rules?.[metodo] ?? DEFAULT_CASHBACK_PAYMENT_ACCRUAL_RULE;
}

function sumNetByMethod(payments: TAccrualPayment[]) {
	const netByMethod = new Map<TPaymentMethodEnum, number>();
	for (const payment of payments) netByMethod.set(payment.metodo, (netByMethod.get(payment.metodo) ?? 0) + payment.valor);
	return netByMethod;
}

/**
 * Base do acúmulo, sem olhar o momento: o total da venda na proporção do que foi pago em formas que
 * pontuam. Proporção, e não soma dos pagamentos, porque a soma nem sempre bate com o total (troco
 * mal lançado, arredondamento do ERP) e o acúmulo sempre foi sobre o total da venda.
 */
export function computePaymentAccrualBase({
	saleTotal,
	payments,
	rules,
}: {
	saleTotal: number;
	payments: TAccrualPayment[];
	rules: TCashbackPaymentAccrualRules | null | undefined;
}) {
	const netByMethod = sumNetByMethod(payments);
	let totalNet = 0;
	let scoringNet = 0;
	const metodos: TPaymentMethodEnum[] = [];
	for (const [metodo, net] of netByMethod) {
		if (net <= 0) continue;
		totalNet += net;
		if (getPaymentAccrualRule(rules, metodo)?.pontua) {
			scoringNet += net;
			metodos.push(metodo);
		}
	}
	if (saleTotal <= 0 || totalNet <= TOLERANCE) return { base: 0, totalNet: round2(totalNet), metodos: [] as TPaymentMethodEnum[] };
	const share = Math.min(1, Math.max(0, scoringNet / totalNet));
	return { base: round2(saleTotal * share), totalNet: round2(totalNet), metodos };
}

/**
 * Venda de integração. Sem regras, ou sem pagamentos informados pela fonte (`null` ou lista vazia),
 * pontua o total na data da venda, como antes das regras: `base: null`. Com regras e pagamentos,
 * `resolveSaleAccrual` sem exigir cobertura (o ERP é a fonte da verdade da venda). `null` = não
 * pontua agora.
 */
export function resolveIntegratedSaleAccrual({
	rules,
	saleTotal,
	saleDate,
	payments,
}: {
	rules: TCashbackPaymentAccrualRules | null | undefined;
	saleTotal: number;
	saleDate: Date;
	payments: TAccrualPayment[] | null | undefined;
}): { base: number | null; momento: Date; metodos: TPaymentMethodEnum[] | null } | null {
	if (rules == null || !payments || payments.length === 0) return { base: null, momento: saleDate, metodos: null };
	const decision = resolveSaleAccrual({ saleTotal, saleDate, payments, rules });
	if (decision.status !== "PONTUAVEL") return null;
	return { base: decision.base, momento: decision.momento, metodos: decision.metodos };
}

/**
 * Decide se a venda pontua agora, sobre qual base e em que data.
 *
 * - Uma forma `NA_VENDA` pontua na data da venda. Uma `NA_QUITACAO` pontua em `quitadoEm`; em aberto
 *   (null) segura a venda; quitação desconhecida (undefined) vale a data da venda.
 * - A venda pontua UMA vez, inteira, quando o último pagamento que pontua fica pontuável. O sistema
 *   pressupõe um acúmulo por venda (idempotência, estorno, reatribuição, edição).
 * - Pagamento que não pontua nunca segura a venda. `A_DEFINIR` segura: ainda não se sabe a forma.
 * - `requireCoverage` (PDV e loja): pagamentos que ainda não cobrem o total seguram a venda, como o
 *   `isFullyPaid` fazia. Integrações não exigem: o ERP é a fonte da verdade da venda.
 */
export function resolveSaleAccrual({
	saleTotal,
	saleDate,
	payments,
	rules,
	requireCoverage = false,
}: {
	saleTotal: number;
	saleDate: Date;
	payments: TAccrualPayment[];
	rules: TCashbackPaymentAccrualRules | null | undefined;
	requireCoverage?: boolean;
}): TSaleAccrualResolution {
	if (payments.some((payment) => payment.metodo === "A_DEFINIR" && payment.valor > 0)) {
		return { status: "AGUARDANDO", motivo: "PAGAMENTO_A_DEFINIR" };
	}

	const { base, totalNet, metodos } = computePaymentAccrualBase({ saleTotal, payments, rules });
	if (requireCoverage && totalNet < saleTotal - TOLERANCE) return { status: "AGUARDANDO", motivo: "PAGAMENTO_INCOMPLETO" };
	if (base <= 0) return { status: "SEM_BASE" };

	let momento = saleDate;
	for (const payment of payments) {
		if (payment.valor <= 0) continue;
		const rule = getPaymentAccrualRule(rules, payment.metodo);
		if (!rule?.pontua || rule.momento === "NA_VENDA") continue;
		if (payment.quitadoEm === null) return { status: "AGUARDANDO", motivo: "QUITACAO_PENDENTE" };
		// Quitação desconhecida cai na data da venda; pagamento adiantado nunca pontua antes dela.
		if (payment.quitadoEm && payment.quitadoEm.getTime() > momento.getTime()) momento = payment.quitadoEm;
	}

	return { status: "PONTUAVEL", base, momento, metodos };
}
