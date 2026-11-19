import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanManageClientBase } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { clientDuplicateCandidates, clients } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Dois modos: `pairId` (par da fila) ou `clientIds` (dois clientes escolhidos à mão no menu de
// mesclagem). No manual o par nasce já DESCARTADO, para não ser sugerido de novo.
const DismissClientDuplicateInputSchema = z
	.object({
		pairId: z.string({ invalid_type_error: "Tipo não válido para o ID do par de duplicidade." }).optional().nullable(),
		clientIds: z
			.array(z.string({ invalid_type_error: "Tipo não válido para o ID do cliente." }), {
				invalid_type_error: "Tipo não válido para os IDs dos clientes.",
			})
			.optional()
			.nullable(),
	})
	.refine((input) => !!input.pairId || (input.clientIds?.length === 2 && input.clientIds[0] !== input.clientIds[1]), {
		message: "Informe o par de duplicidade ou dois clientes diferentes.",
	});
export type TDismissClientDuplicateInput = z.infer<typeof DismissClientDuplicateInputSchema>;

async function dismissClientDuplicate({ input, session }: { input: TDismissClientDuplicateInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (!input.pairId) {
		const [clienteXId, clienteYId] = input.clientIds as [string, string];
		const owned = await db.query.clients.findMany({
			columns: { id: true },
			where: and(eq(clients.organizacaoId, organizacaoId), inArray(clients.id, [clienteXId, clienteYId])),
		});
		if (owned.length !== 2) throw new createHttpError.NotFound("Cliente não encontrado.");
		const [clienteAId, clienteBId] = clienteXId < clienteYId ? [clienteXId, clienteYId] : [clienteYId, clienteXId];
		const now = new Date();
		const [dismissed] = await db
			.insert(clientDuplicateCandidates)
			.values({
				organizacaoId,
				clienteAId,
				clienteBId,
				motivos: [],
				status: "DESCARTADO",
				descarteData: now,
				descarteAutorId: session.user.id,
			})
			.onConflictDoUpdate({
				target: [clientDuplicateCandidates.organizacaoId, clientDuplicateCandidates.clienteAId, clientDuplicateCandidates.clienteBId],
				set: { status: "DESCARTADO", descarteData: now, descarteAutorId: session.user.id, dataAtualizacao: now },
			})
			.returning({ id: clientDuplicateCandidates.id });
		if (!dismissed) throw new createHttpError.InternalServerError("Não foi possível descartar o par.");
		return { data: { dismissedId: dismissed.id }, message: "Par descartado — não será sugerido novamente." };
	}

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
