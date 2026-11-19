import type { TAccountChartNatureEnum, TPurchaseCostTreatmentEnum } from "@/schemas/enums";

/**
 * Destino do custo de um item de compra.
 *
 * Todo item é um produto (a entidade dos bens físicos), mas nem todo produto comprado vira estoque:
 * material de manutenção, reforma ou uso e consumo vai direto para uma conta de despesa ou de ativo.
 * O destino é escolhido na entrada da nota, item a item, e `contaContabilId` nulo significa o padrão
 * de compras da organização (a conta de estoque).
 *
 * Regra central: **o item só movimenta estoque quando o destino é o estoque.** Assim o saldo físico
 * (quantidade × custo médio) e a conta contábil de estoque nunca divergem — um item reconhecido como
 * despesa não pode continuar valendo como estoque nos relatórios.
 *
 * Client-safe: sem acesso a banco.
 */

/** Naturezas aceitas como destino de custo: o débito de uma compra só pode cair em ativo, custo ou despesa. */
export const PURCHASE_DESTINATION_ACCOUNT_NATURES: readonly TAccountChartNatureEnum[] = ["ATIVO", "CUSTO", "DESPESA"];

export function isPurchaseDestinationAccountNature(natureza: TAccountChartNatureEnum) {
	return PURCHASE_DESTINATION_ACCOUNT_NATURES.includes(natureza);
}

/** O item entra no estoque físico (saldo, custo médio, lote)? Só quando não tem conta própria de destino. */
export function purchaseItemEntersStock(item: { contaContabilId?: string | null }) {
	return item.contaContabilId == null;
}

/**
 * Pode trocar o destino de um item já recebido sem refazer a compra? Só entre contas fora do estoque:
 * isso muda apenas a classificação contábil. Entrar ou sair do estoque exige movimentar saldo, e uma
 * compra recebida tem os itens congelados — para isso ela é cancelada e refeita.
 */
export function canReclassifyReceivedPurchaseItem({ previous, next }: { previous?: string | null; next?: string | null }) {
	if ((previous ?? null) === (next ?? null)) return true;
	return previous != null && next != null;
}

/**
 * Tributos de um item fora do estoque entram no custo dele, não em crédito: material de uso e consumo
 * não dá crédito de ICMS/IPI, e o crédito de ativo imobilizado (CIAP, 1/48 ao mês) não é apurado aqui.
 * Ao mover um item para um destino próprio, tributos marcados como crédito — ou ainda sem tratamento —
 * passam a CUSTO_ESTOQUE, que no item fora do estoque significa "custo debitado na conta de destino".
 * Voltar para o estoque não desfaz: o operador decide de novo, como em qualquer item de estoque.
 *
 * É uma sugestão da tela; a regra fiscal concreta deve ser confirmada com a contabilidade.
 */
export function adjustTaxTreatmentsForDestination<T extends { chave: string; tratamento: TPurchaseCostTreatmentEnum | null }>({
	modifiers,
	entersStock,
}: {
	modifiers: T[];
	entersStock: boolean;
}): T[] {
	if (entersStock) return modifiers;
	return modifiers.map((modifier) =>
		modifier.chave.startsWith("IMPOSTOS_") && (modifier.tratamento === null || modifier.tratamento === "CREDITO_TRIBUTARIO")
			? ({ ...modifier, tratamento: "CUSTO_ESTOQUE" as const } as T)
			: modifier,
	);
}
