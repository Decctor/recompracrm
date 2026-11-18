import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanManageClientBase } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { mergeClients } from "@/lib/clients/merge";
import { ClientMergeFieldChoicesSchema } from "@/schemas/clients";
import { db } from "@/services/drizzle";
import { clientDuplicateCandidates } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const MergeClientDuplicateInputSchema = z.object({
	pairId: z
		.string({
			required_error: "ID do par de duplicidade não informado.",
			invalid_type_error: "Tipo não válido para o ID do par de duplicidade.",
		})
		.min(1, "ID do par de duplicidade não informado."),
	keeperId: z
		.string({
			required_error: "ID do cliente mantido não informado.",
			invalid_type_error: "Tipo não válido para o ID do cliente mantido.",
		})
		.min(1, "ID do cliente mantido não informado."),
	fieldChoices: ClientMergeFieldChoicesSchema.optional().nullable(),
});
export type TMergeClientDuplicateInput = z.infer<typeof MergeClientDuplicateInputSchema>;

async function mergeClientDuplicate({ input, session }: { input: TMergeClientDuplicateInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const pair = await db.query.clientDuplicateCandidates.findFirst({
		where: and(eq(clientDuplicateCandidates.id, input.pairId), eq(clientDuplicateCandidates.organizacaoId, organizacaoId)),
	});
	if (!pair) throw new createHttpError.NotFound("Par de duplicidade não encontrado.");
	if (pair.status !== "PENDENTE") throw new createHttpError.Conflict("Este par já foi resolvido.");
	if (input.keeperId !== pair.clienteAId && input.keeperId !== pair.clienteBId) {
		throw new createHttpError.BadRequest("O cliente mantido precisa pertencer ao par.");
	}

	const sourceId = input.keeperId === pair.clienteAId ? pair.clienteBId : pair.clienteAId;

	const result = await mergeClients({
		db,
		organizacaoId,
		keeperId: input.keeperId,
		sourceId,
		fieldChoices: input.fieldChoices ?? null,
		autorId: session.user.id,
		candidateId: pair.id,
	});

	return {
		data: {
			keeperId: result.keeperId,
			sourceId: result.sourceId,
			registrosMovidos: result.registrosMovidos,
			saldosCashback: result.saldosCashback,
			mergeLogId: result.mergeLogId,
		},
		message: "Clientes mesclados com sucesso.",
	};
}
export type TMergeClientDuplicateOutput = Awaited<ReturnType<typeof mergeClientDuplicate>>;

async function mergeClientDuplicateRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	// Ver e comparar segue clientes.visualizar; descartar e mesclar são gestão da base.
	assertCanManageClientBase(session);

	const payload = await request.json();
	const input = MergeClientDuplicateInputSchema.parse(payload);
	const result = await mergeClientDuplicate({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: mergeClientDuplicateRoute });
