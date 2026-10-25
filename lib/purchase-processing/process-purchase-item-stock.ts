import type { TAcquisitionNatureEnum } from "@/schemas/enums";
import { DBTransaction } from "@/services/drizzle";
import { productStockLots, productStockTransactions, productVariants, products, purchaseItems } from "@/services/drizzle/schema";
import { calculatePurchaseItemCost } from "@/lib/purchase/costing";
import { createFixedAssetsForPurchaseItem, removeFixedAssetsForPurchaseItem } from "@/lib/fixed-assets/from-purchase";
import { isStockTrackingActive } from "@/lib/stock/apply-stock-movement";
import type { TPurchaseCostModifiersSnapshot } from "@/schemas/purchases";
import { and, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";

export type TPurchaseItemStockOperation = "RECEIVING" | "UNRECEIVING" | "UPDATING_RECEIVED" | "UPDATING_UNRECEIVED";

export type TPurchaseItemInput = {
	destinacao?: TAcquisitionNatureEnum | null;
	id?: string | null;
	deletar?: boolean | null;
	produtoId: string;
	produtoVarianteId?: string | null;
	snapshotProdutoDescricao: string;
	snapshotProdutoCodigo: string;
	quantidade: number;
	valorUnitarioBruto: number;
	valorUnitarioLiquido?: number | null;
	valorTotalBruto: number;
	valorTotalLiquido?: number | null;
	descontosTotal?: number | null;
	acrescimosTotal?: number | null;
	modificadoresCusto?: TPurchaseCostModifiersSnapshot | null;
	valorTotalCusto?: number | null;
	valorUnitarioCusto?: number | null;
	externoQtde?: number | null;
	externoValor?: number | null;
	externoUnidade?: string | null;
	externoFatorConversao?: number | null;
	anotacoes?: string | null;
	documentoRef?: string | null;
	documentoItem?: number | null;
	dataValidade?: Date | null;
};

type HandlePurchaseItemStockProcessingParams = {
	trx: DBTransaction;
	organizationId: string;
	userId: string;
	purchaseId: string;
	operation: TPurchaseItemStockOperation;
	item: TPurchaseItemInput;
	reasonOverride?: {
		entry?: string;
		exit?: string;
	};
};

const DEFAULT_REASONS = {
	receiving: "Recebimento de compra",
	unreceiving: "Rollback - compra desfeita",
	rollbackForUpdate: "Ajuste - item de compra alterado (rollback)",
	reapplyForUpdate: "Ajuste - item de compra alterado",
} as const;

export async function handlePurchaseItemStockProcessing({
	trx,
	organizationId,
	userId,
	purchaseId,
	operation,
	item,
	reasonOverride,
}: HandlePurchaseItemStockProcessingParams) {
	// Um item em remoção não precisa de composição de custo válida — e não pode ser impedido de sair
	// por ela. Ver `normalizePurchaseItems` em app/api/purchases/route.ts.
	if (!item.deletar) item = normalizePurchaseItemCostValues(item);
	const isExisting = !!item.id;
	const shouldDelete = !!item.deletar;
	const unitCost = resolveUnitCost(item);

	if (operation === "UPDATING_UNRECEIVED") {
		await persistPurchaseItemRow({ trx, organizationId, purchaseId, item });
		return;
	}

	// Bem do ativo imobilizado não é estoque (ADR-0002, decisão 8): o recebimento cria o registro em
	// `fixed_assets`; desfazer o recebimento o remove, se nenhum fechamento mensal já o contou.
	const isFixedAsset = item.destinacao === "ATIVO_IMOBILIZADO";

	if (operation === "RECEIVING") {
		if (isExisting && shouldDelete) {
			await deletePurchaseItemRow({ trx, organizationId, itemId: item.id! });
			return;
		}

		const persistedItemId = await persistPurchaseItemRow({ trx, organizationId, purchaseId, item });
		if (isFixedAsset) {
			await createFixedAssetsForPurchaseItem({ trx, organizationId, userId, purchaseId, purchaseItemId: persistedItemId, item, receivedAt: new Date() });
			return;
		}
		await applyStockEntry({
			trx,
			organizationId,
			userId,
			purchaseId,
			purchaseItemId: persistedItemId,
			item,
			unitCost,
			reason: reasonOverride?.entry ?? DEFAULT_REASONS.receiving,
		});
		return;
	}

	if (operation === "UNRECEIVING") {
		if (!isExisting) {
			await persistPurchaseItemRow({ trx, organizationId, purchaseId, item });
			return;
		}

		const previousItem = await loadPreviousItem({ trx, organizationId, itemId: item.id! });
		if (previousItem.destinacao === "ATIVO_IMOBILIZADO") {
			await removeFixedAssetsForPurchaseItem({ trx, organizationId, purchaseItemId: previousItem.id });
		} else {
			await applyPurchaseItemStockExit({
				trx,
				organizationId,
				userId,
				purchaseId,
				purchaseItemId: previousItem.id,
				produtoId: previousItem.produtoId,
				produtoVarianteId: previousItem.produtoVarianteId,
				quantidade: previousItem.quantidade,
				unitCost: resolveUnitCost(previousItem),
				reason: reasonOverride?.exit ?? DEFAULT_REASONS.unreceiving,
			});
			// Reverse the lot spawned by this item's receipt. The route only allows un-receiving while lots
			// are pristine, so zeroing here keeps the FEFO sub-ledger in sync with products.quantidade.
			await discardPurchaseItemLot({ trx, organizationId, purchaseItemId: previousItem.id });
		}

		if (shouldDelete) {
			await deletePurchaseItemRow({ trx, organizationId, itemId: item.id! });
			return;
		}
		await persistPurchaseItemRow({ trx, organizationId, purchaseId, item });
		return;
	}

	if (operation === "UPDATING_RECEIVED") {
		if (!isExisting) {
			const persistedItemId = await persistPurchaseItemRow({ trx, organizationId, purchaseId, item });
			await applyStockEntry({
				trx,
				organizationId,
				userId,
				purchaseId,
				purchaseItemId: persistedItemId,
				item,
				unitCost,
				reason: reasonOverride?.entry ?? DEFAULT_REASONS.receiving,
			});
			return;
		}

		const previousItem = await loadPreviousItem({ trx, organizationId, itemId: item.id! });
		await applyPurchaseItemStockExit({
			trx,
			organizationId,
			userId,
			purchaseId,
			purchaseItemId: previousItem.id,
			produtoId: previousItem.produtoId,
			produtoVarianteId: previousItem.produtoVarianteId,
			quantidade: previousItem.quantidade,
			unitCost: resolveUnitCost(previousItem),
			reason: reasonOverride?.exit ?? DEFAULT_REASONS.rollbackForUpdate,
		});

		if (shouldDelete) {
			await deletePurchaseItemRow({ trx, organizationId, itemId: item.id! });
			return;
		}

		await persistPurchaseItemRow({ trx, organizationId, purchaseId, item });
		await applyStockEntry({
			trx,
			organizationId,
			userId,
			purchaseId,
			purchaseItemId: item.id!,
			item,
			unitCost,
			reason: reasonOverride?.entry ?? DEFAULT_REASONS.reapplyForUpdate,
		});
		return;
	}

	throw new createHttpError.InternalServerError("Operação de estoque de compra não suportada.");
}

export function normalizePurchaseItemCostValues<T extends TPurchaseItemInput>(item: T): T {
	const calculated = calculatePurchaseItemCost(item);
	return {
		...item,
		modificadoresCusto: calculated.modificadoresCusto,
		descontosTotal: calculated.descontosTotal,
		acrescimosTotal: calculated.acrescimosTotal,
		valorTotalLiquido: calculated.valorTotalLiquido,
		valorUnitarioLiquido: calculated.valorUnitarioLiquido,
		valorTotalCusto: calculated.valorTotalCusto,
		valorUnitarioCusto: calculated.valorUnitarioCusto,
	};
}

function resolveUnitCost(item: { valorUnitarioCusto?: number | null; valorUnitarioLiquido?: number | null; valorUnitarioBruto: number }) {
	return item.valorUnitarioCusto ?? item.valorUnitarioLiquido ?? item.valorUnitarioBruto;
}

type CreatePurchaseItemLotParams = {
	trx: DBTransaction;
	organizationId: string;
	purchaseId: string;
	purchaseItemId: string;
	produtoId: string;
	produtoVarianteId?: string | null;
	quantidade: number;
	dataValidade?: Date | null;
};

async function createPurchaseItemLotIfNeeded({
	trx,
	organizationId,
	purchaseId,
	purchaseItemId,
	produtoId,
	produtoVarianteId,
	quantidade,
	dataValidade,
}: CreatePurchaseItemLotParams): Promise<string | null> {
	// v1 trigger: a lot is spawned only when the user provided an expiry date. Gated by the same
	// stock-tracking flag that guards the movement, so no lot is created when the movement is skipped.
	if (dataValidade == null) return null;
	const trackingActive = await isStockTrackingActive({ trx, organizationId, produtoId, produtoVarianteId });
	if (!trackingActive) return null;

	const inserted = await trx
		.insert(productStockLots)
		.values({
			organizacaoId: organizationId,
			produtoId,
			produtoVarianteId: produtoVarianteId ?? null,
			codigoLote: buildPurchaseLotCode({ purchaseId, purchaseItemId }),
			dataValidade,
			quantidadeInicial: quantidade,
			quantidadeAtual: quantidade,
			status: "ATIVO",
			compraId: purchaseId,
			compraItemId: purchaseItemId,
		})
		.returning({ id: productStockLots.id });

	const loteId = inserted[0]?.id;
	if (!loteId) throw new createHttpError.InternalServerError("Erro ao criar lote da compra.");
	return loteId;
}

async function discardPurchaseItemLot({
	trx,
	organizationId,
	purchaseItemId,
}: {
	trx: DBTransaction;
	organizationId: string;
	purchaseItemId: string;
}) {
	await trx
		.update(productStockLots)
		.set({ quantidadeAtual: 0, status: "DESCARTADO" })
		.where(and(eq(productStockLots.compraItemId, purchaseItemId), eq(productStockLots.organizacaoId, organizationId)));
}

function buildPurchaseLotCode({ purchaseId, purchaseItemId }: { purchaseId: string; purchaseItemId: string }) {
	const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
	return `COMPRA-${datePart}-${purchaseId.slice(0, 8).toUpperCase()}-${purchaseItemId.slice(0, 4).toUpperCase()}`;
}

type PersistPurchaseItemRowParams = {
	trx: DBTransaction;
	organizationId: string;
	purchaseId: string;
	item: TPurchaseItemInput;
};

async function persistPurchaseItemRow({ trx, organizationId, purchaseId, item }: PersistPurchaseItemRowParams) {
	if (item.id) {
		await trx
			.update(purchaseItems)
			.set({
				produtoId: item.produtoId,
				produtoVarianteId: item.produtoVarianteId ?? null,
				destinacao: item.destinacao ?? "REVENDA",
				snapshotProdutoDescricao: item.snapshotProdutoDescricao,
				snapshotProdutoCodigo: item.snapshotProdutoCodigo,
				quantidade: item.quantidade,
				valorUnitarioBruto: item.valorUnitarioBruto,
				valorUnitarioLiquido: item.valorUnitarioLiquido ?? null,
				valorTotalBruto: item.valorTotalBruto,
				valorTotalLiquido: item.valorTotalLiquido ?? null,
				descontosTotal: item.descontosTotal ?? null,
				acrescimosTotal: item.acrescimosTotal ?? null,
				modificadoresCusto: item.modificadoresCusto ?? null,
				valorTotalCusto: item.valorTotalCusto ?? null,
				valorUnitarioCusto: item.valorUnitarioCusto ?? null,
				externoQtde: item.externoQtde ?? null,
				externoValor: item.externoValor ?? null,
				externoUnidade: item.externoUnidade ?? null,
				externoFatorConversao: item.externoFatorConversao ?? null,
				anotacoes: item.anotacoes ?? null,
				documentoRef: item.documentoRef ?? null,
				documentoItem: item.documentoItem ?? null,
				dataValidade: item.dataValidade ?? null,
			})
			.where(and(eq(purchaseItems.id, item.id), eq(purchaseItems.organizacaoId, organizationId)));
		return item.id;
	}

	const inserted = await trx
		.insert(purchaseItems)
		.values({
			organizacaoId: organizationId,
			compraId: purchaseId,
			produtoId: item.produtoId,
			produtoVarianteId: item.produtoVarianteId ?? null,
			destinacao: item.destinacao ?? "REVENDA",
			snapshotProdutoDescricao: item.snapshotProdutoDescricao,
			snapshotProdutoCodigo: item.snapshotProdutoCodigo,
			quantidade: item.quantidade,
			valorUnitarioBruto: item.valorUnitarioBruto,
			valorUnitarioLiquido: item.valorUnitarioLiquido ?? null,
			valorTotalBruto: item.valorTotalBruto,
			valorTotalLiquido: item.valorTotalLiquido ?? null,
			descontosTotal: item.descontosTotal ?? null,
			acrescimosTotal: item.acrescimosTotal ?? null,
			modificadoresCusto: item.modificadoresCusto ?? null,
			valorTotalCusto: item.valorTotalCusto ?? null,
			valorUnitarioCusto: item.valorUnitarioCusto ?? null,
			externoQtde: item.externoQtde ?? null,
			externoValor: item.externoValor ?? null,
			externoUnidade: item.externoUnidade ?? null,
			externoFatorConversao: item.externoFatorConversao ?? null,
			anotacoes: item.anotacoes ?? null,
			documentoRef: item.documentoRef ?? null,
			documentoItem: item.documentoItem ?? null,
			dataValidade: item.dataValidade ?? null,
		})
		.returning({ id: purchaseItems.id });

	const insertedId = inserted[0]?.id;
	if (!insertedId) throw new createHttpError.InternalServerError("Erro ao persistir item da compra.");
	return insertedId;
}

async function deletePurchaseItemRow({ trx, organizationId, itemId }: { trx: DBTransaction; organizationId: string; itemId: string }) {
	await trx.delete(purchaseItems).where(and(eq(purchaseItems.id, itemId), eq(purchaseItems.organizacaoId, organizationId)));
}

async function loadPreviousItem({ trx, organizationId, itemId }: { trx: DBTransaction; organizationId: string; itemId: string }) {
	const previous = await trx.query.purchaseItems.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, itemId), eq(fields.organizacaoId, organizationId)),
	});
	if (!previous) throw new createHttpError.NotFound("Item da compra não encontrado para processamento de estoque.");
	return previous;
}

type ApplyStockEntryParams = {
	trx: DBTransaction;
	organizationId: string;
	userId: string;
	purchaseId: string;
	purchaseItemId: string;
	item: { produtoId: string; produtoVarianteId?: string | null; quantidade: number; dataValidade?: Date | null };
	unitCost: number;
	reason: string;
};

async function applyStockEntry({ trx, organizationId, userId, purchaseId, purchaseItemId, item, unitCost, reason }: ApplyStockEntryParams) {
	// Perishable control: when the item carries an expiry date, receiving it spawns a traceable lot
	// linked to this purchase item. The lot is created alongside the entry movement so its id is
	// stamped on the ledger row (mirrors the production flow). No double-count: products.quantidade
	// stays the master balance, the lot is a FEFO sub-ledger.
	const loteId = await createPurchaseItemLotIfNeeded({
		trx,
		organizationId,
		purchaseId,
		purchaseItemId,
		produtoId: item.produtoId,
		produtoVarianteId: item.produtoVarianteId,
		quantidade: item.quantidade,
		dataValidade: item.dataValidade,
	});

	if (item.produtoVarianteId) {
		await applyVariantStockMovement({
			trx,
			organizationId,
			userId,
			purchaseId,
			purchaseItemId,
			variantId: item.produtoVarianteId,
			signedQuantity: item.quantidade,
			unitCost,
			reason,
			loteId,
		});
		return;
	}
	await applyProductStockMovement({
		trx,
		organizationId,
		userId,
		purchaseId,
		purchaseItemId,
		produtoId: item.produtoId,
		signedQuantity: item.quantidade,
		unitCost,
		reason,
		loteId,
	});
}

type ApplyStockExitParams = {
	trx: DBTransaction;
	organizationId: string;
	userId: string;
	purchaseId: string;
	purchaseItemId: string;
	produtoId: string;
	produtoVarianteId?: string | null;
	quantidade: number;
	unitCost: number;
	reason: string;
};

export async function applyPurchaseItemStockExit({
	trx,
	organizationId,
	userId,
	purchaseId,
	purchaseItemId,
	produtoId,
	produtoVarianteId,
	quantidade,
	unitCost,
	reason,
}: ApplyStockExitParams) {
	if (produtoVarianteId) {
		await applyVariantStockMovement({
			trx,
			organizationId,
			userId,
			purchaseId,
			purchaseItemId,
			variantId: produtoVarianteId,
			signedQuantity: -quantidade,
			unitCost,
			reason,
		});
		return;
	}
	await applyProductStockMovement({
		trx,
		organizationId,
		userId,
		purchaseId,
		purchaseItemId,
		produtoId,
		signedQuantity: -quantidade,
		unitCost,
		reason,
	});
}

type ApplyProductStockMovementParams = {
	trx: DBTransaction;
	organizationId: string;
	userId: string;
	purchaseId: string;
	purchaseItemId: string;
	produtoId: string;
	signedQuantity: number;
	unitCost: number;
	reason: string;
	loteId?: string | null;
};

async function applyProductStockMovement({
	trx,
	organizationId,
	userId,
	purchaseId,
	purchaseItemId,
	produtoId,
	signedQuantity,
	unitCost,
	reason,
	loteId = null,
}: ApplyProductStockMovementParams) {
	const product = await trx.query.products.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, produtoId), eq(fields.organizacaoId, organizationId)),
		columns: { id: true, quantidade: true, precoCusto: true, rastreamentoEstoqueAtivo: true },
	});
	if (!product) throw new createHttpError.NotFound("Produto não encontrado para movimentação de estoque.");
	if (!product.rastreamentoEstoqueAtivo) return;

	const previousQuantity = product.quantidade ?? 0;
	const previousUnitCost = product.precoCusto ?? null;
	const nextQuantity = previousQuantity + signedQuantity;
	const nextUnitCost = computeNextUnitCost({ previousQuantity, previousUnitCost, signedQuantity, unitCost });

	const movementType = signedQuantity >= 0 ? "ENTRADA_AQUISICAO" : "SAIDA";
	const recordedQuantity = Math.abs(signedQuantity);

	await trx.insert(productStockTransactions).values({
		organizacaoId: organizationId,
		produtoId,
		produtoVarianteId: null,
		compraId: purchaseId,
		compraItemId: purchaseItemId,
		loteId,
		tipo: movementType,
		quantidade: recordedQuantity,
		saldoAnterior: previousQuantity,
		saldoPosterior: nextQuantity,
		custoUnitarioMovimentado: unitCost,
		custoUnitarioAnterior: previousUnitCost,
		custoUnitarioPosterior: nextUnitCost,
		motivo: reason,
		operadorId: userId,
	});

	await trx
		.update(products)
		.set({
			quantidade: sql`COALESCE(${products.quantidade}, 0) + ${signedQuantity}`,
			...(nextUnitCost != null ? { precoCusto: nextUnitCost } : {}),
		})
		.where(and(eq(products.id, produtoId), eq(products.organizacaoId, organizationId)));
}

type ApplyVariantStockMovementParams = {
	trx: DBTransaction;
	organizationId: string;
	userId: string;
	purchaseId: string;
	purchaseItemId: string;
	variantId: string;
	signedQuantity: number;
	unitCost: number;
	reason: string;
	loteId?: string | null;
};

async function applyVariantStockMovement({
	trx,
	organizationId,
	userId,
	purchaseId,
	purchaseItemId,
	variantId,
	signedQuantity,
	unitCost,
	reason,
	loteId = null,
}: ApplyVariantStockMovementParams) {
	const variant = await trx.query.productVariants.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, variantId), eq(fields.organizacaoId, organizationId)),
		columns: { id: true, produtoId: true, quantidade: true, precoCusto: true, rastreamentoEstoqueAtivo: true },
	});
	if (!variant) throw new createHttpError.NotFound("Variante de produto não encontrada para movimentação de estoque.");
	if (!variant.rastreamentoEstoqueAtivo) return;

	const previousQuantity = variant.quantidade ?? 0;
	const previousUnitCost = variant.precoCusto ?? null;
	const nextQuantity = previousQuantity + signedQuantity;
	const nextUnitCost = computeNextUnitCost({ previousQuantity, previousUnitCost, signedQuantity, unitCost });

	const movementType = signedQuantity >= 0 ? "ENTRADA_AQUISICAO" : "SAIDA";
	const recordedQuantity = Math.abs(signedQuantity);

	await trx.insert(productStockTransactions).values({
		organizacaoId: organizationId,
		produtoId: variant.produtoId,
		produtoVarianteId: variantId,
		compraId: purchaseId,
		compraItemId: purchaseItemId,
		loteId,
		tipo: movementType,
		quantidade: recordedQuantity,
		saldoAnterior: previousQuantity,
		saldoPosterior: nextQuantity,
		custoUnitarioMovimentado: unitCost,
		custoUnitarioAnterior: previousUnitCost,
		custoUnitarioPosterior: nextUnitCost,
		motivo: reason,
		operadorId: userId,
	});

	await trx
		.update(productVariants)
		.set({
			quantidade: sql`COALESCE(${productVariants.quantidade}, 0) + ${signedQuantity}`,
			...(nextUnitCost != null ? { precoCusto: nextUnitCost } : {}),
		})
		.where(and(eq(productVariants.id, variantId), eq(productVariants.organizacaoId, organizationId)));
}

type ComputeNextUnitCostParams = {
	previousQuantity: number;
	previousUnitCost: number | null;
	signedQuantity: number;
	unitCost: number;
};

function computeNextUnitCost({ previousQuantity, previousUnitCost, signedQuantity, unitCost }: ComputeNextUnitCostParams): number | null {
	const nextQuantity = previousQuantity + signedQuantity;

	if (signedQuantity >= 0) {
		if (previousQuantity <= 0 || previousUnitCost == null) return unitCost;
		if (nextQuantity <= 0) return previousUnitCost;
		return (previousQuantity * previousUnitCost + signedQuantity * unitCost) / nextQuantity;
	}

	if (previousUnitCost == null) return null;
	if (nextQuantity <= 0) return previousUnitCost;
	const numerator = previousQuantity * previousUnitCost - Math.abs(signedQuantity) * unitCost;
	const candidate = numerator / nextQuantity;
	if (!Number.isFinite(candidate) || candidate < 0) return previousUnitCost;
	return candidate;
}
