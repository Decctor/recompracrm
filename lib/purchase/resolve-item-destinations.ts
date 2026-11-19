import { isPurchaseDestinationAccountNature } from "@/lib/purchase/destination";
import type { DBTransaction } from "@/services/drizzle";
import { accountsCharts } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";

/**
 * Valida e normaliza a conta de destino de cada item de compra.
 *
 * - A conta precisa ser da organização e de natureza ativo, custo ou despesa.
 * - Escolher a própria conta de estoque é o mesmo que não escolher: grava nulo. Assim a decisão de
 *   movimentar estoque (`purchaseItemEntersStock`) depende só do item gravado, nunca de uma
 *   configuração de contas que pode mudar entre o recebimento e um cancelamento.
 *
 * A conta de estoque só é resolvida quando algum item tem destino próprio: uma compra só de estoque
 * não depende da configuração contábil para salvar.
 */
export async function resolvePurchaseItemDestinations<T extends { contaContabilId?: string | null; deletar?: boolean | null }>({
	trx,
	organizationId,
	resolveInventoryAccountId,
	items,
}: {
	trx: DBTransaction;
	organizationId: string;
	resolveInventoryAccountId: () => Promise<string>;
	items: T[];
}): Promise<T[]> {
	const chosenIds = [...new Set(items.flatMap((item) => (!item.deletar && item.contaContabilId ? [item.contaContabilId] : [])))];
	if (chosenIds.length === 0) return items.map((item) => ({ ...item, contaContabilId: null }));

	const inventoryAccountId = await resolveInventoryAccountId();
	const accounts = await trx
		.select({ id: accountsCharts.id, nome: accountsCharts.nome, natureza: accountsCharts.natureza })
		.from(accountsCharts)
		.where(and(eq(accountsCharts.organizacaoId, organizationId), inArray(accountsCharts.id, chosenIds)));
	const accountById = new Map(accounts.map((account) => [account.id, account]));

	for (const id of chosenIds) {
		const account = accountById.get(id);
		if (!account) throw new createHttpError.BadRequest("Conta de destino de um item da compra não encontrada nesta organização.");
		if (id !== inventoryAccountId && !isPurchaseDestinationAccountNature(account.natureza))
			throw new createHttpError.BadRequest(`A conta "${account.nome}" não pode receber o custo de uma compra: use uma conta de ativo, custo ou despesa.`);
	}

	return items.map((item) => ({
		...item,
		contaContabilId: item.contaContabilId && item.contaContabilId !== inventoryAccountId ? item.contaContabilId : null,
	}));
}
