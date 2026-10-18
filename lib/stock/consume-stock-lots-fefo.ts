import type { TStockMovementOriginEnum, TStockMovementTypeEnum } from "@/schemas/enums";
import type { DBTransaction } from "@/services/drizzle";
import { productStockLots } from "@/services/drizzle/schema";
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { applyStockMovement } from "./apply-stock-movement";

type StockLotConsumptionLinks = {
	compraId?: string | null;
	compraItemId?: string | null;
	vendaId?: string | null;
	vendaItemId?: string | null;
	producaoId?: string | null;
	producaoEntradaId?: string | null;
	producaoSaidaId?: string | null;
};

type ConsumeStockLotsByFefoParams = {
	trx: DBTransaction;
	organizationId: string;
	userId: string | null;
	produtoId: string;
	produtoVarianteId?: string | null;
	quantidade: number;
	reason: string;
	movementType?: TStockMovementTypeEnum;
	unitCost?: number | null;
	links?: StockLotConsumptionLinks;
	allowPartial?: boolean;
	origin?: TStockMovementOriginEnum;
};

export type TConsumedStockLot = {
	loteId: string;
	codigoLote: string | null;
	quantidadeConsumida: number;
	quantidadeAnterior: number;
	quantidadePosterior: number;
	dataValidade: Date | null;
	unitCost: number | null;
	applied: boolean;
};

export async function consumeStockLotsByFefo({
	trx,
	organizationId,
	userId,
	produtoId,
	produtoVarianteId,
	quantidade,
	reason,
	movementType = "SAIDA",
	unitCost = null,
	links,
	allowPartial = false,
	origin = "SISTEMA",
}: ConsumeStockLotsByFefoParams): Promise<TConsumedStockLot[]> {
	if (quantidade <= 0) throw new createHttpError.BadRequest("Quantidade para consumo por lote deve ser maior que zero.");

	const variantCondition = produtoVarianteId ? eq(productStockLots.produtoVarianteId, produtoVarianteId) : isNull(productStockLots.produtoVarianteId);
	const availableLots = await trx.query.productStockLots.findMany({
		where: and(
			eq(productStockLots.organizacaoId, organizationId),
			eq(productStockLots.produtoId, produtoId),
			variantCondition,
			eq(productStockLots.status, "ATIVO"),
			gt(productStockLots.quantidadeAtual, 0),
			or(isNull(productStockLots.dataValidade), gt(productStockLots.dataValidade, new Date())),
		),
		orderBy: [sql`${productStockLots.dataValidade} ASC NULLS LAST`, asc(productStockLots.dataInsercao), asc(productStockLots.id)],
	});

	const totalAvailable = availableLots.reduce((total, lot) => total + lot.quantidadeAtual, 0);
	if (!allowPartial && totalAvailable < quantidade) {
		throw new createHttpError.BadRequest("Saldo em lotes insuficiente para consumir a quantidade informada.");
	}

	const consumedLots: TConsumedStockLot[] = [];
	let remainingQuantity = quantidade;

	for (const lot of availableLots) {
		if (remainingQuantity <= 0) break;

		const quantityToConsume = Math.min(remainingQuantity, lot.quantidadeAtual);
		const nextQuantity = lot.quantidadeAtual - quantityToConsume;

		const movement = await applyStockMovement({
			trx,
			organizationId,
			userId,
			produtoId: lot.produtoId,
			produtoVarianteId: lot.produtoVarianteId,
			signedQuantity: -quantityToConsume,
			movementType,
			reason,
			unitCost,
			links: {
				...links,
				loteId: lot.id,
			},
			validateSufficientStock: true,
			origin,
		});

		await trx
			.update(productStockLots)
			.set({
				quantidadeAtual: nextQuantity,
				status: nextQuantity <= 0 ? "ESGOTADO" : lot.status,
			})
			.where(and(eq(productStockLots.id, lot.id), eq(productStockLots.organizacaoId, organizationId)));

		consumedLots.push({
			loteId: lot.id,
			codigoLote: lot.codigoLote,
			quantidadeConsumida: quantityToConsume,
			quantidadeAnterior: lot.quantidadeAtual,
			quantidadePosterior: nextQuantity,
			dataValidade: lot.dataValidade,
			unitCost: movement.previousUnitCost,
			applied: movement.applied,
		});

		remainingQuantity -= quantityToConsume;
	}

	return consumedLots;
}
