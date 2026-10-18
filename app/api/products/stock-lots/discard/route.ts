import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { applyStockMovement, isStockTrackingActive } from "@/lib/stock/apply-stock-movement";
import { registerStockLossAccountingEntry, resolveStockLossUnitCost } from "@/lib/stock/stock-loss-accounting";
import { db } from "@/services/drizzle";
import { productStockLots } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const DiscardProductStockLotInputSchema = z.object({
	loteId: z.string({
		required_error: "ID do lote não informado.",
		invalid_type_error: "Tipo inválido para ID do lote.",
	}),
	quantidade: z
		.number({
			required_error: "Quantidade do descarte não informada.",
			invalid_type_error: "Tipo inválido para quantidade do descarte.",
		})
		.positive({ message: "Quantidade do descarte deve ser maior que zero." }),
	motivo: z
		.string({
			required_error: "Motivo do descarte não informado.",
			invalid_type_error: "Tipo inválido para motivo do descarte.",
		})
		.min(1, { message: "Motivo do descarte não informado." }),
});
export type TDiscardProductStockLotInput = z.infer<typeof DiscardProductStockLotInputSchema>;

function getSessionWithOrg(session: TAuthUserSession | null) {
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return session;
}

async function discardProductStockLot({ input, session }: { input: TDiscardProductStockLotInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	const userId = session.user.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	return await db.transaction(async (tx) => {
		const stockLot = await tx.query.productStockLots.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.loteId), eq(fields.organizacaoId, organizationId)),
		});
		if (!stockLot) throw new createHttpError.NotFound("Lote não encontrado.");
		if (stockLot.status === "DESCARTADO") throw new createHttpError.BadRequest("Lote já descartado.");
		if (stockLot.status === "ESGOTADO") throw new createHttpError.BadRequest("Lote esgotado não pode ser descartado.");
		if (stockLot.quantidadeAtual <= 0) throw new createHttpError.BadRequest("Lote sem saldo disponível para descarte.");
		if (input.quantidade > stockLot.quantidadeAtual) throw new createHttpError.BadRequest("Quantidade de descarte maior que o saldo do lote.");

		const trackingActive = await isStockTrackingActive({
			trx: tx,
			organizationId,
			produtoId: stockLot.produtoId,
			produtoVarianteId: stockLot.produtoVarianteId,
		});
		if (!trackingActive) throw new createHttpError.BadRequest("Produto do lote não possui rastreamento de estoque ativo.");

		const nextQuantity = stockLot.quantidadeAtual - input.quantidade;
		const nextStatus = nextQuantity <= 0 ? "DESCARTADO" : stockLot.status;

		const unitCost = await resolveStockLossUnitCost({
			trx: tx,
			organizationId,
			produtoId: stockLot.produtoId,
			produtoVarianteId: stockLot.produtoVarianteId,
			compraItemId: stockLot.compraItemId,
		});

		await applyStockMovement({
			trx: tx,
			organizationId,
			userId,
			produtoId: stockLot.produtoId,
			produtoVarianteId: stockLot.produtoVarianteId,
			signedQuantity: -input.quantidade,
			movementType: "DESCARTE",
			reason: input.motivo,
			unitCost,
			links: {
				loteId: stockLot.id,
				producaoId: stockLot.producaoId,
			},
			validateSufficientStock: true,
		});

		const [updatedLot] = await tx
			.update(productStockLots)
			.set({
				quantidadeAtual: Math.max(0, nextQuantity),
				status: nextStatus,
			})
			.where(and(eq(productStockLots.id, stockLot.id), eq(productStockLots.organizacaoId, organizationId)))
			.returning({ id: productStockLots.id });

		if (!updatedLot?.id) throw new createHttpError.InternalServerError("Erro ao descartar lote.");

		const perda = await registerStockLossAccountingEntry({
			trx: tx,
			organizationId,
			userId,
			unitCost,
			quantity: input.quantidade,
			title: `DESCARTE LOTE ${stockLot.codigoLote ?? `#${stockLot.id}`}`,
			notes: input.motivo,
			loteId: stockLot.id,
		});

		return {
			data: {
				discardedId: updatedLot.id,
				perda,
			},
			message: perda.lancamentoContabilId
				? "Descarte de lote registrado com sucesso. Lançamento contábil de perda gerado."
				: "Descarte de lote registrado com sucesso. Sem custo conhecido para o produto, nenhum lançamento contábil de perda foi gerado.",
		};
	});
}
export type TDiscardProductStockLotOutput = Awaited<ReturnType<typeof discardProductStockLot>>;

async function discardProductStockLotRoute(request: NextRequest) {
	const session = getSessionWithOrg(await getCurrentSessionUncached());
	const input = DiscardProductStockLotInputSchema.parse(await request.json());
	const result = await discardProductStockLot({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: discardProductStockLotRoute });
