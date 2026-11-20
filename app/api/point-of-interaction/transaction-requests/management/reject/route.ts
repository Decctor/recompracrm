import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import {
	POI_REJECTION_NOTE_MAX_LENGTH,
	type TPoiTransactionRequestSummary,
	withPoiTransactionProcessingResult,
} from "@/lib/point-of-interaction/transaction-requests";
import { POI_TRANSACTION_REJECTION_REASON_LABELS, PoiTransactionRejectionReasonEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { poiTransactionRequests } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const RejectPoiTransactionRequestInputSchema = z.object({
	requestId: z.string({
		required_error: "ID da solicitação não informado.",
		invalid_type_error: "Tipo não válido para ID da solicitação.",
	}),
	// O cliente lê o motivo (e a observação) na tela de espera do celular.
	motivo: PoiTransactionRejectionReasonEnum,
	observacao: z
		.string({ invalid_type_error: "Tipo não válido para a observação da rejeição." })
		.max(POI_REJECTION_NOTE_MAX_LENGTH, `A observação passa de ${POI_REJECTION_NOTE_MAX_LENGTH} caracteres.`)
		.optional()
		.nullable()
		.transform((value) => value?.replace(/\s+/g, " ").trim() || null),
});
export type TRejectPoiTransactionRequestInput = z.input<typeof RejectPoiTransactionRequestInputSchema>;

async function rejectPoiTransactionRequest({
	session,
	input,
}: {
	session: TAuthUserSession;
	input: z.output<typeof RejectPoiTransactionRequestInputSchema>;
}) {
	const membership = session.membership;
	if (!membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (input.motivo === "OUTRO" && !input.observacao) throw new createHttpError.BadRequest("Descreva o motivo da rejeição.");

	const orgId = membership.organizacao.id;
	const poiRequest = await db.query.poiTransactionRequests.findFirst({
		where: and(eq(poiTransactionRequests.id, input.requestId), eq(poiTransactionRequests.organizacaoId, orgId)),
	});

	if (!poiRequest) throw new createHttpError.NotFound("Solicitação não encontrada.");
	if (poiRequest.status !== "PENDENTE") throw new createHttpError.BadRequest("A solicitação não está pendente de aprovação.");

	const rejeicao = { motivo: input.motivo, observacao: input.observacao };
	const resumo = (poiRequest.resumoSolicitacao as TPoiTransactionRequestSummary | null) ?? null;
	const reasonLabel = POI_TRANSACTION_REJECTION_REASON_LABELS[input.motivo];

	await db
		.update(poiTransactionRequests)
		.set({
			status: "REJEITADO",
			operadorAprovadorId: membership.id,
			operadorAprovadorVendedorId: membership.usuarioVendedorId,
			motivoInternoRejeicao: input.observacao ? `${reasonLabel}: ${input.observacao}` : reasonLabel,
			resumoSolicitacao: { ...withPoiTransactionProcessingResult({ resumo, resultado: null, status: "REJEITADO" }), rejeicao },
			dataRejeicao: new Date(),
			dataAtualizacao: new Date(),
		})
		.where(eq(poiTransactionRequests.id, input.requestId));

	return {
		data: { id: input.requestId },
		message: "Solicitação rejeitada.",
	};
}
export type TRejectPoiTransactionRequestOutput = Awaited<ReturnType<typeof rejectPoiTransactionRequest>>;

async function rejectPoiTransactionRequestRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const body = await request.json();
	const input = RejectPoiTransactionRequestInputSchema.parse(body);
	const result = await rejectPoiTransactionRequest({ session, input });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: rejectPoiTransactionRequestRoute });
