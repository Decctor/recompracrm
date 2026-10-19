import { type TDiscountAuthority, evaluateDiscount, getDiscountCeiling } from "@/lib/permissions/discounts";
import { PaymentTerminalError } from "./errors";
import { roundCents } from "./terminal-cart-item";

// Desconto manual na venda do terminal, em funções puras. A regra é a do checkout web
// (`lib/permissions/discounts.ts`): o teto é o do vendedor da venda (membership vinculada); sem
// vendedor com membership, o teto do dispositivo é zero e qualquer desconto pede aprovação de um
// gestor. O terminal manda um desconto geral da venda, em reais.

/**
 * Teto como o app o lê na configuração: `null` = sem teto; `{ tipo: "FIXO", valor: 0 }` = nenhum
 * desconto sem aprovação. O app avisa antes de "Cobrar"; o servidor decide de novo.
 */
export type TTerminalDiscountLimit = { tipo: "PERCENTUAL" | "FIXO"; valor: number } | null;

export function toTerminalDiscountLimit(authority: TDiscountAuthority): TTerminalDiscountLimit {
	if (!authority.aplicar) return { tipo: "FIXO", valor: 0 };
	if (!authority.limiteTipo || authority.limiteValor === null) return null;
	return { tipo: authority.limiteTipo, valor: authority.limiteValor };
}

/** Desconto pedido, conferido contra o valor dos itens: nunca negativo, nunca maior que a venda. */
export function resolveTerminalDiscount({ descontosTotal, itemsTotal }: { descontosTotal: number | null | undefined; itemsTotal: number }) {
	const value = roundCents(descontosTotal ?? 0);
	if (value < 0) throw new PaymentTerminalError(422, "VALIDATION_ERROR", "O desconto não pode ser negativo.");
	if (value > roundCents(itemsTotal) + 0.001)
		throw new PaymentTerminalError(422, "VALIDATION_ERROR", "O desconto não pode passar do valor dos itens.");
	return value;
}

/** Precisa de aprovação? Mesma avaliação do checkout, com o teto já resolvido do vendedor ou do dispositivo. */
export function terminalDiscountNeedsApproval({
	authority,
	valorBase,
	descontoTotal,
}: {
	authority: TDiscountAuthority;
	valorBase: number;
	descontoTotal: number;
}) {
	return evaluateDiscount({ authority, valorBase, descontoTotal }) === "REQUER_APROVACAO";
}

export function getTerminalDiscountCeiling({ authority, valorBase }: { authority: TDiscountAuthority; valorBase: number }) {
	const ceiling = getDiscountCeiling({ authority, valorBase });
	return ceiling === null ? null : roundCents(ceiling);
}
