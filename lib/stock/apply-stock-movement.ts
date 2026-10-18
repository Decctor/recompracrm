import type { TStockMovementOriginEnum, TStockMovementTypeEnum } from "@/schemas/enums";
import type { DBTransaction } from "@/services/drizzle";
import { productStockTransactions, productVariants, products } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";

type StockMovementLinks = {
	compraId?: string | null;
	compraItemId?: string | null;
	vendaId?: string | null;
	vendaItemId?: string | null;
	producaoId?: string | null;
	producaoEntradaId?: string | null;
	producaoSaidaId?: string | null;
	loteId?: string | null;
};

type ApplyStockMovementParams = {
	trx: DBTransaction;
	organizationId: string;
	userId: string | null;
	produtoId: string;
	produtoVarianteId?: string | null;
	signedQuantity: number;
	movementType: TStockMovementTypeEnum;
	reason: string;
	unitCost?: number | null;
	links?: StockMovementLinks;
	validateSufficientStock?: boolean;
	/** MANUAL quando lançada diretamente pelo usuário; SISTEMA (padrão) para os processos do app. */
	origin?: TStockMovementOriginEnum;
};

type StockMovementResult = {
	applied: boolean;
	produtoId: string;
	produtoVarianteId: string | null;
	previousQuantity: number;
	nextQuantity: number;
	previousUnitCost: number | null;
	nextUnitCost: number | null;
};

export async function applyStockMovement({
	trx,
	organizationId,
	userId,
	produtoId,
	produtoVarianteId,
	signedQuantity,
	movementType,
	reason,
	unitCost = null,
	links,
	validateSufficientStock = false,
	origin = "SISTEMA",
}: ApplyStockMovementParams): Promise<StockMovementResult> {
	if (signedQuantity === 0) {
		return {
			applied: false,
			produtoId,
			produtoVarianteId: produtoVarianteId ?? null,
			previousQuantity: 0,
			nextQuantity: 0,
			previousUnitCost: null,
			nextUnitCost: null,
		};
	}

	if (produtoVarianteId) {
		return await applyVariantStockMovement({
			trx,
			organizationId,
			userId,
			produtoId,
			produtoVarianteId,
			signedQuantity,
			movementType,
			reason,
			unitCost,
			links,
			validateSufficientStock,
			origin,
		});
	}

	return await applyProductStockMovement({
		trx,
		organizationId,
		userId,
		produtoId,
		signedQuantity,
		movementType,
		reason,
		unitCost,
		links,
		validateSufficientStock,
		origin,
	});
}

export async function isStockTrackingActive({
	trx,
	organizationId,
	produtoId,
	produtoVarianteId,
}: {
	trx: DBTransaction;
	organizationId: string;
	produtoId: string;
	produtoVarianteId?: string | null;
}) {
	if (produtoVarianteId) {
		const variant = await trx.query.productVariants.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, produtoVarianteId), eq(fields.organizacaoId, organizationId)),
			columns: { id: true, rastreamentoEstoqueAtivo: true },
		});
		if (!variant) throw new createHttpError.NotFound("Variante de produto não encontrada para movimentação de estoque.");
		return !!variant.rastreamentoEstoqueAtivo;
	}

	const product = await trx.query.products.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, produtoId), eq(fields.organizacaoId, organizationId)),
		columns: { id: true, rastreamentoEstoqueAtivo: true },
	});
	if (!product) throw new createHttpError.NotFound("Produto não encontrado para movimentação de estoque.");
	return !!product.rastreamentoEstoqueAtivo;
}

async function applyProductStockMovement({
	trx,
	organizationId,
	userId,
	produtoId,
	signedQuantity,
	movementType,
	reason,
	unitCost,
	links,
	validateSufficientStock,
	origin = "SISTEMA",
}: Omit<ApplyStockMovementParams, "produtoVarianteId">): Promise<StockMovementResult> {
	const product = await trx.query.products.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, produtoId), eq(fields.organizacaoId, organizationId)),
		columns: { id: true, quantidade: true, precoCusto: true, rastreamentoEstoqueAtivo: true },
	});
	if (!product) throw new createHttpError.NotFound("Produto não encontrado para movimentação de estoque.");

	const previousQuantity = product.quantidade ?? 0;
	const previousUnitCost = product.precoCusto ?? null;
	const nextQuantity = previousQuantity + signedQuantity;
	const nextUnitCost = computeNextUnitCost({ previousQuantity, previousUnitCost, signedQuantity, unitCost: unitCost ?? null });

	if (!product.rastreamentoEstoqueAtivo) {
		return {
			applied: false,
			produtoId,
			produtoVarianteId: null,
			previousQuantity,
			nextQuantity: previousQuantity,
			previousUnitCost,
			nextUnitCost: previousUnitCost,
		};
	}

	if (validateSufficientStock && nextQuantity < 0) {
		throw new createHttpError.BadRequest("Saldo insuficiente para movimentação de estoque do produto.");
	}

	await trx.insert(productStockTransactions).values({
		organizacaoId: organizationId,
		produtoId,
		produtoVarianteId: null,
		compraId: links?.compraId ?? null,
		compraItemId: links?.compraItemId ?? null,
		vendaId: links?.vendaId ?? null,
		vendaItemId: links?.vendaItemId ?? null,
		producaoId: links?.producaoId ?? null,
		producaoEntradaId: links?.producaoEntradaId ?? null,
		producaoSaidaId: links?.producaoSaidaId ?? null,
		loteId: links?.loteId ?? null,
		tipo: movementType,
		origem: origin,
		quantidade: Math.abs(signedQuantity),
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

	return {
		applied: true,
		produtoId,
		produtoVarianteId: null,
		previousQuantity,
		nextQuantity,
		previousUnitCost,
		nextUnitCost,
	};
}

async function applyVariantStockMovement({
	trx,
	organizationId,
	userId,
	produtoId,
	produtoVarianteId,
	signedQuantity,
	movementType,
	reason,
	unitCost,
	links,
	validateSufficientStock,
	origin = "SISTEMA",
}: ApplyStockMovementParams & { produtoVarianteId: string }): Promise<StockMovementResult> {
	const variant = await trx.query.productVariants.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, produtoVarianteId), eq(fields.organizacaoId, organizationId)),
		columns: { id: true, produtoId: true, quantidade: true, precoCusto: true, rastreamentoEstoqueAtivo: true },
	});
	if (!variant) throw new createHttpError.NotFound("Variante de produto não encontrada para movimentação de estoque.");
	if (variant.produtoId !== produtoId) throw new createHttpError.BadRequest("Variante de estoque não pertence ao produto informado.");

	const previousQuantity = variant.quantidade ?? 0;
	const previousUnitCost = variant.precoCusto ?? null;
	const nextQuantity = previousQuantity + signedQuantity;
	const nextUnitCost = computeNextUnitCost({ previousQuantity, previousUnitCost, signedQuantity, unitCost: unitCost ?? null });

	if (!variant.rastreamentoEstoqueAtivo) {
		return {
			applied: false,
			produtoId: variant.produtoId,
			produtoVarianteId,
			previousQuantity,
			nextQuantity: previousQuantity,
			previousUnitCost,
			nextUnitCost: previousUnitCost,
		};
	}

	if (validateSufficientStock && nextQuantity < 0) {
		throw new createHttpError.BadRequest("Saldo insuficiente para movimentação de estoque da variante.");
	}

	await trx.insert(productStockTransactions).values({
		organizacaoId: organizationId,
		produtoId: variant.produtoId,
		produtoVarianteId,
		compraId: links?.compraId ?? null,
		compraItemId: links?.compraItemId ?? null,
		vendaId: links?.vendaId ?? null,
		vendaItemId: links?.vendaItemId ?? null,
		producaoId: links?.producaoId ?? null,
		producaoEntradaId: links?.producaoEntradaId ?? null,
		producaoSaidaId: links?.producaoSaidaId ?? null,
		loteId: links?.loteId ?? null,
		tipo: movementType,
		origem: origin,
		quantidade: Math.abs(signedQuantity),
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
		.where(and(eq(productVariants.id, produtoVarianteId), eq(productVariants.organizacaoId, organizationId)));

	return {
		applied: true,
		produtoId: variant.produtoId,
		produtoVarianteId,
		previousQuantity,
		nextQuantity,
		previousUnitCost,
		nextUnitCost,
	};
}

function computeNextUnitCost({
	previousQuantity,
	previousUnitCost,
	signedQuantity,
	unitCost,
}: {
	previousQuantity: number;
	previousUnitCost: number | null;
	signedQuantity: number;
	unitCost: number | null;
}) {
	const nextQuantity = previousQuantity + signedQuantity;
	if (unitCost == null) return previousUnitCost;

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
