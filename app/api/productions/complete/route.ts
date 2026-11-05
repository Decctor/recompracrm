import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canCompleteProductions } from "@/lib/permissions/productions";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getItemUnitCost, getItemSalePrice, getProductPricingMap } from "@/lib/productions/valuation";
import { applyStockMovement, isStockTrackingActive } from "@/lib/stock/apply-stock-movement";
import { consumeStockLotsByFefo } from "@/lib/stock/consume-stock-lots-fefo";
import { db } from "@/services/drizzle";
import { productStockLots, productionInputs, productionOutputs, productions } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CompleteProductionInputSchema = z.object({
	productionId: z.string({
		required_error: "ID da produção não informado.",
		invalid_type_error: "Tipo inválido para ID da produção.",
	}),
});
export type TCompleteProductionInput = z.infer<typeof CompleteProductionInputSchema>;

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

async function completeProduction({ input, session }: { input: TCompleteProductionInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	const userId = session.user.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	return await db.transaction(async (tx) => {
		const production = await tx.query.productions.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.productionId), eq(fields.organizacaoId, organizationId)),
			with: {
				entradas: true,
				saidas: true,
			},
		});
		if (!production) throw new createHttpError.NotFound("Produção não encontrada.");
		if (production.status === "CONCLUIDA") throw new createHttpError.BadRequest("Produção já concluída.");
		if (production.status === "CANCELADA") throw new createHttpError.BadRequest("Produção cancelada não pode ser concluída.");

		const outputsWithRealQuantity = production.saidas.filter((output) => (output.quantidadeReal ?? 0) > 0);
		if (outputsWithRealQuantity.length === 0) throw new createHttpError.BadRequest("Informe ao menos uma saída real para concluir a produção.");

		// Preços vigentes agora: é este o instante que a produção congela. Servem de fallback do custo
		// (produtos sem rastreio de estoque não têm lote com custo) e de base do retorno esperado.
		const pricingMap = await getProductPricingMap({
			trx: tx,
			organizationId,
			items: [...production.entradas, ...production.saidas],
		});

		let consumedCostTotal = 0;
		for (const inputItem of production.entradas) {
			const realQuantity = inputItem.quantidadeReal ?? 0;
			if (realQuantity <= 0) continue;

			// Quanto da quantidade consumida teve custo real apurado (lote ou custo médio anterior).
			// O resto cai no custo de catálogo, senão insumos sem rastreio zerariam o custo da produção.
			let inputCostTotal = 0;
			let costedQuantity = 0;

			const consumedLots = await consumeStockLotsByFefo({
				trx: tx,
				organizationId,
				userId,
				produtoId: inputItem.produtoId,
				produtoVarianteId: inputItem.produtoVarianteId,
				quantidade: realQuantity,
				movementType: "SAIDA_PRODUCAO",
				reason: "Consumo de insumo em produção",
				unitCost: null,
				links: {
					producaoId: production.id,
					producaoEntradaId: inputItem.id,
				},
				allowPartial: true,
			});

			const consumedFromLots = consumedLots.reduce((total, lot) => total + lot.quantidadeConsumida, 0);
			for (const lot of consumedLots) {
				if (lot.applied && lot.unitCost != null) {
					inputCostTotal += lot.quantidadeConsumida * lot.unitCost;
					costedQuantity += lot.quantidadeConsumida;
				}
			}

			const remainingQuantity = realQuantity - consumedFromLots;
			if (remainingQuantity > 0) {
				const movement = await applyStockMovement({
					trx: tx,
					organizationId,
					userId,
					produtoId: inputItem.produtoId,
					produtoVarianteId: inputItem.produtoVarianteId,
					signedQuantity: -remainingQuantity,
					movementType: "SAIDA_PRODUCAO",
					reason: "Consumo de insumo em produção",
					unitCost: null,
					links: {
						producaoId: production.id,
						producaoEntradaId: inputItem.id,
					},
					validateSufficientStock: true,
				});

				if (movement.applied && movement.previousUnitCost != null) {
					inputCostTotal += remainingQuantity * movement.previousUnitCost;
					costedQuantity += remainingQuantity;
				}
			}

			const uncostedQuantity = realQuantity - costedQuantity;
			const catalogUnitCost = getItemUnitCost({ item: inputItem, pricingMap });
			if (uncostedQuantity > 0 && catalogUnitCost != null) inputCostTotal += uncostedQuantity * catalogUnitCost;

			await tx
				.update(productionInputs)
				.set({ custoUnitario: inputCostTotal / realQuantity })
				.where(and(eq(productionInputs.id, inputItem.id), eq(productionInputs.organizacaoId, organizationId)));

			consumedCostTotal += inputCostTotal;
		}

		const outputQuantityTotal = outputsWithRealQuantity.reduce((total, output) => total + (output.quantidadeReal ?? 0), 0);
		const producedUnitCost = consumedCostTotal > 0 && outputQuantityTotal > 0 ? consumedCostTotal / outputQuantityTotal : null;
		const completedAt = new Date();
		let expectedReturnTotal = 0;
		const createdStockLots: { id: string; codigoLote: string | null }[] = [];

		for (const [index, outputItem] of outputsWithRealQuantity.entries()) {
			const realQuantity = outputItem.quantidadeReal ?? 0;
			const dataValidade =
				outputItem.dataValidade ??
				calculateValidityDate({
					referenceDate: completedAt,
					measure: outputItem.prazoValidadeMedida,
					value: outputItem.prazoValidadeValor,
				});

			const unitSalePrice = getItemSalePrice({ item: outputItem, pricingMap });
			if (unitSalePrice != null) expectedReturnTotal += unitSalePrice * realQuantity;

			await tx
				.update(productionOutputs)
				.set({ dataValidade, valorUnitarioVenda: unitSalePrice })
				.where(and(eq(productionOutputs.id, outputItem.id), eq(productionOutputs.organizacaoId, organizationId)));

			const shouldCreateLot = await isStockTrackingActive({
				trx: tx,
				organizationId,
				produtoId: outputItem.produtoId,
				produtoVarianteId: outputItem.produtoVarianteId,
			});

			let loteId: string | null = null;
			if (shouldCreateLot) {
				const [insertedLot] = await tx
					.insert(productStockLots)
					.values({
						organizacaoId: organizationId,
						produtoId: outputItem.produtoId,
						produtoVarianteId: outputItem.produtoVarianteId,
						codigoLote: buildProductionLotCode({ productionId: production.id, index }),
						dataFabricacao: completedAt,
						dataValidade,
						quantidadeInicial: realQuantity,
						quantidadeAtual: realQuantity,
						status: "ATIVO",
						producaoId: production.id,
					})
					.returning({ id: productStockLots.id, codigoLote: productStockLots.codigoLote });
				loteId = insertedLot?.id ?? null;
				if (!loteId) throw new createHttpError.InternalServerError("Erro ao criar lote da produção.");
				createdStockLots.push({ id: loteId, codigoLote: insertedLot.codigoLote });
			}

			await applyStockMovement({
				trx: tx,
				organizationId,
				userId,
				produtoId: outputItem.produtoId,
				produtoVarianteId: outputItem.produtoVarianteId,
				signedQuantity: realQuantity,
				movementType: "ENTRADA_PRODUCAO",
				reason: "Entrada de produto produzido",
				unitCost: producedUnitCost,
				links: {
					producaoId: production.id,
					producaoSaidaId: outputItem.id,
					loteId,
				},
			});
		}

		const [updatedProduction] = await tx
			.update(productions)
			.set({
				status: "CONCLUIDA",
				dataInicio: production.dataInicio ?? completedAt,
				dataConclusao: completedAt,
				custoTotal: consumedCostTotal,
				retornoEsperado: expectedReturnTotal,
				dataSnapshotValores: completedAt,
			})
			.where(and(eq(productions.id, production.id), eq(productions.organizacaoId, organizationId)))
			.returning({ id: productions.id });

		if (!updatedProduction?.id) throw new createHttpError.InternalServerError("Erro ao concluir produção.");

		return {
			data: {
				completedId: updatedProduction.id,
				createdStockLots,
			},
			message: "Produção concluída com sucesso.",
		};
	});
}
export type TCompleteProductionOutput = Awaited<ReturnType<typeof completeProduction>>;

async function completeProductionRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	if (!canCompleteProductions(session.membership?.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para concluir produções.");
	const input = CompleteProductionInputSchema.parse(await request.json());
	const result = await completeProduction({ input, session });
	return NextResponse.json(result);
}

function calculateValidityDate({
	referenceDate,
	measure,
	value,
}: {
	referenceDate: Date;
	measure: "MINUTOS" | "HORAS" | "DIAS" | "SEMANAS" | "MESES" | "ANOS" | null;
	value: number | null;
}) {
	if (!measure || value == null) return null;
	const date = new Date(referenceDate);

	if (measure === "MINUTOS") date.setMinutes(date.getMinutes() + value);
	if (measure === "HORAS") date.setHours(date.getHours() + value);
	if (measure === "DIAS") date.setDate(date.getDate() + value);
	if (measure === "SEMANAS") date.setDate(date.getDate() + value * 7);
	if (measure === "MESES") date.setMonth(date.getMonth() + value);
	if (measure === "ANOS") date.setFullYear(date.getFullYear() + value);

	return date;
}

function buildProductionLotCode({ productionId, index }: { productionId: string; index: number }) {
	const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
	return `PROD-${datePart}-${productionId.slice(0, 8).toUpperCase()}-${index + 1}`;
}

export const POST = appApiHandler({ POST: completeProductionRoute });
