import type { DBTransaction } from "@/services/drizzle";
import { saleItemModifiers, saleItems } from "@/services/drizzle/schema";
import { POS_REWARD_SALE_ITEM_ORIGIN } from "@/lib/sales/sale-reward-snapshot";
import { and, eq, inArray } from "drizzle-orm";

export type TDraftItemModifierInput = {
	opcaoId: string;
	nome: string;
	quantidade: number;
	valorUnitario: number;
	valorTotal: number;
};

export type TDraftItemInput = {
	/** Presente = linha existente do rascunho; ausente = item novo. */
	id?: string | null;
	produtoId: string;
	produtoVarianteId?: string | null;
	nome: string;
	codigo: string;
	imagemUrl?: string | null;
	quantidade: number;
	valorUnitarioBase: number;
	valorModificadores: number;
	valorUnitarioFinal: number;
	valorTotalBruto: number;
	valorDesconto: number;
	valorTotalLiquido: number;
	modificadores: TDraftItemModifierInput[];
	observacoes?: string | null;
};

/** Duas listas de modificadores são a mesma escolha quando batem opção a opção, em qualquer ordem. */
export function modifierIdentityKey(modifiers: { opcaoId: string | null; quantidade: number }[]) {
	return modifiers
		.map((modifier) => `${modifier.opcaoId ?? ""}:${modifier.quantidade}`)
		.sort()
		.join("|");
}

/**
 * O snapshot que o carrinho relê ao reabrir o rascunho.
 *
 * Enquanto a venda é ORCAMENTO ele acompanha as edições; a partir da confirmação vira registro
 * histórico do que foi vendido. Sem ele não dá para reconstruir "base + adicionais": a coluna
 * `valorVendaUnitario` guarda só o unitário final somado.
 */
export function buildDraftItemSnapshot(item: TDraftItemInput) {
	return {
		nome: item.nome,
		codigo: item.codigo,
		imagemUrl: item.imagemUrl ?? null,
		produtoId: item.produtoId,
		produtoVarianteId: item.produtoVarianteId ?? null,
		valorUnitarioBase: item.valorUnitarioBase,
		valorModificadores: item.valorModificadores,
		modificadores: item.modificadores.map((mod) => ({
			opcaoId: mod.opcaoId,
			nome: mod.nome,
			quantidade: mod.quantidade,
			valorUnitario: mod.valorUnitario,
			valorTotal: mod.valorTotal,
		})),
	};
}

/**
 * Reconcilia os itens de um rascunho com a lista enviada pelo checkout.
 *
 * Linhas existentes são atualizadas no lugar (o id sobrevive à edição), novas são inseridas e as
 * ausentes são removidas. As linhas de `saleItemModifiers` são reescritas quando a escolha de
 * adicionais muda: elas não são detalhe de exibição, alimentam a baixa de estoque em
 * `lib/data-collecting-v2/sync-sales.ts`.
 *
 * Os preços já devem ter passado por `validateSaleItemsPricing` — aqui eles são tratados como
 * verdade e só recompomos os totais da venda.
 */
export async function syncDraftItems({
	tx,
	orgId,
	saleId,
	clienteId,
	itens,
}: {
	tx: DBTransaction;
	orgId: string;
	saleId: string;
	clienteId: string | null;
	itens: TDraftItemInput[];
}): Promise<{ valorBaseItens: number; descontosTotalItens: number; custoTotal: number }> {
	const productIds = [...new Set(itens.map((item) => item.produtoId))];
	const variantIds = [...new Set(itens.map((item) => item.produtoVarianteId).filter((id): id is string => !!id))];

	const [produtos, variantes, todosExistentes] = await Promise.all([
		productIds.length > 0
			? tx.query.products.findMany({
					where: (fields, { and: andWhere, eq: eqWhere, inArray: inArrayWhere }) =>
						andWhere(inArrayWhere(fields.id, productIds), eqWhere(fields.organizacaoId, orgId)),
					columns: { id: true, precoCusto: true },
				})
			: [],
		variantIds.length > 0
			? tx.query.productVariants.findMany({
					where: (fields, { and: andWhere, eq: eqWhere, inArray: inArrayWhere }) =>
						andWhere(inArrayWhere(fields.id, variantIds), eqWhere(fields.organizacaoId, orgId)),
					columns: { id: true, precoCusto: true },
				})
			: [],
		tx.query.saleItems.findMany({
			where: (fields, { and: andWhere, eq: eqWhere }) => andWhere(eqWhere(fields.vendaId, saleId), eqWhere(fields.organizacaoId, orgId)),
			columns: { id: true, metadados: true },
			with: { adicionais: { columns: { opcaoId: true, quantidade: true } } },
		}),
	]);
	// Itens de recompensa (construídos pelo servidor a partir do snapshot do rascunho) não são do
	// checkout: um PUT que reenvia o carrinho sem eles não pode apagá-los — o rascunho da loja
	// digital já nasce com esses itens gravados.
	const existentes = todosExistentes.filter((item) => (item.metadados as { origem?: string } | null)?.origem !== POS_REWARD_SALE_ITEM_ORIGIN);

	const productCostMap = new Map(produtos.map((p) => [p.id, p.precoCusto ?? 0]));
	const variantCostMap = new Map(variantes.map((v) => [v.id, v.precoCusto ?? 0]));
	const existingById = new Map(existentes.map((item) => [item.id, item]));

	const resolveCost = (item: TDraftItemInput) =>
		item.produtoVarianteId ? (variantCostMap.get(item.produtoVarianteId) ?? 0) : (productCostMap.get(item.produtoId) ?? 0);

	const keptIds = new Set<string>();

	for (const item of itens) {
		const existing = item.id ? existingById.get(item.id) : undefined;
		const valorCustoUnitario = resolveCost(item);

		const columns = {
			organizacaoId: orgId,
			vendaId: saleId,
			clienteId,
			produtoId: item.produtoId,
			produtoVarianteId: item.produtoVarianteId ?? null,
			quantidade: item.quantidade,
			valorVendaUnitario: item.valorUnitarioFinal,
			valorCustoUnitario,
			valorVendaTotalBruto: item.valorTotalBruto,
			valorTotalDesconto: item.valorDesconto,
			valorVendaTotalLiquido: item.valorTotalLiquido,
			valorCustoTotal: valorCustoUnitario * item.quantidade,
			observacoes: item.observacoes ?? null,
			metadados: buildDraftItemSnapshot(item),
		};

		if (!existing) {
			const [inserted] = await tx.insert(saleItems).values(columns).returning({ id: saleItems.id });
			if (item.modificadores.length > 0) {
				await tx.insert(saleItemModifiers).values(item.modificadores.map((mod) => ({ ...mod, itemVendaId: inserted.id })));
			}
			keptIds.add(inserted.id);
			continue;
		}

		await tx.update(saleItems).set(columns).where(and(eq(saleItems.id, existing.id), eq(saleItems.organizacaoId, orgId)));

		if (modifierIdentityKey(existing.adicionais) !== modifierIdentityKey(item.modificadores)) {
			await tx.delete(saleItemModifiers).where(eq(saleItemModifiers.itemVendaId, existing.id));
			if (item.modificadores.length > 0) {
				await tx.insert(saleItemModifiers).values(item.modificadores.map((mod) => ({ ...mod, itemVendaId: existing.id })));
			}
		}

		keptIds.add(existing.id);
	}

	const removedIds = existentes.map((item) => item.id).filter((id) => !keptIds.has(id));
	if (removedIds.length > 0) {
		await tx.delete(saleItemModifiers).where(inArray(saleItemModifiers.itemVendaId, removedIds));
		await tx.delete(saleItems).where(and(inArray(saleItems.id, removedIds), eq(saleItems.organizacaoId, orgId)));
	}

	return {
		valorBaseItens: itens.reduce((sum, item) => sum + item.valorTotalLiquido, 0),
		descontosTotalItens: itens.reduce((sum, item) => sum + item.valorDesconto, 0),
		custoTotal: itens.reduce((sum, item) => sum + resolveCost(item) * item.quantidade, 0),
	};
}
