import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanManageClientBase } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { clientDuplicateCandidates } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const DismissClientDuplicateInputSchema = z.object({
	pairId: z
		.string({
			required_error: "ID do par de duplicidade não informado.",
			invalid_type_error: "Tipo não válido para o ID do par de duplicidade.",
		})
		.min(1, "ID do par de duplicidade não informado."),
});
export type TDismissClientDuplicateInput = z.infer<typeof DismissClientDuplicateInputSchema>;

async function dismissClientDuplicate({ input, session }: { input: TDismissClientDuplicateInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const [updated] = await db
		.update(clientDuplicateCandidates)
		.set({ status: "DESCARTADO", descarteData: new Date(), descarteAutorId: session.user.id, dataAtualizacao: new Date() })
		.where(
			and(
				eq(clientDuplicateCandidates.id, input.pairId),
				eq(clientDuplicateCandidates.organizacaoId, organizacaoId),
				eq(clientDuplicateCandidates.status, "PENDENTE"),
			),
		)
		.returning({ id: clientDuplicateCandidates.id });

	if (!updated) throw new createHttpError.NotFound("Par de duplicidade não encontrado ou já resolvido.");
	return { data: { dismissedId: updated.id }, message: "Par descartado — não será sugerido novamente." };
}
export type TDismissClientDuplicateOutput = Awaited<ReturnType<typeof dismissClientDuplicate>>;

async function dismissClientDuplicateRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	// Ver e comparar segue clientes.visualizar; descartar e mesclar são gestão da base.
	assertCanManageClientBase(session);

	const payload = await request.json();
	const input = DismissClientDuplicateInputSchema.parse(payload);
	const result = await dismissClientDuplicate({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: dismissClientDuplicateRoute });
