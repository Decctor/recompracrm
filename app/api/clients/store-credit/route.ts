import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getClientStoreCreditPosition, lockClientStoreCredit } from "@/lib/finances/store-credit/authorization";
import { requiresStoreCreditRelease } from "@/lib/finances/store-credit/policy";
import { canGrantStoreCredit } from "@/lib/permissions/finances";
import { db } from "@/services/drizzle";
import { clients, organizations, users } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

/**
 * Liberação de fiado de um cliente: a posição (liberado, limite, em aberto, disponível) e a decisão
 * de crédito. A posição é lida pelo checkout para explicar um bloqueio antes do clique — a decisão
 * de verdade é da confirmação (lib/finances/store-credit/authorization.ts).
 */

// ---------------------------------------------------------------- GET

const GetClientStoreCreditInputSchema = z.object({
	clientId: z.string({ required_error: "ID do cliente não informado.", invalid_type_error: "Tipo inválido para ID do cliente." }),
});
export type TGetClientStoreCreditInput = z.infer<typeof GetClientStoreCreditInputSchema>;

async function getClientStoreCredit({ input, session }: { input: TGetClientStoreCreditInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const [position, organization] = await Promise.all([
		getClientStoreCreditPosition({ organizacaoId, clienteId: input.clientId }),
		db.query.organizations.findFirst({ where: eq(organizations.id, organizacaoId), columns: { configuracao: true } }),
	]);
	if (!position) throw new createHttpError.NotFound("Cliente não encontrado.");

	const liberadoPor = position.fiadoLiberadoPorId
		? await db.query.users.findFirst({ where: eq(users.id, position.fiadoLiberadoPorId), columns: { id: true, nome: true } })
		: null;

	return {
		data: {
			position: { ...position, liberadoPor: liberadoPor ?? null },
			exigeLiberacao: requiresStoreCreditRelease(organization?.configuracao),
			canGrant: canGrantStoreCredit(session.membership?.permissoes),
		},
		message: "Liberação de fiado do cliente encontrada.",
	};
}
export type TGetClientStoreCreditOutput = Awaited<ReturnType<typeof getClientStoreCredit>>;

async function getClientStoreCreditRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	const input = GetClientStoreCreditInputSchema.parse({ clientId: request.nextUrl.searchParams.get("clientId") ?? undefined });
	return NextResponse.json(await getClientStoreCredit({ input, session }));
}

// ---------------------------------------------------------------- PUT

const UpdateClientStoreCreditInputSchema = z
	.object({
		clientId: z.string({ required_error: "ID do cliente não informado.", invalid_type_error: "Tipo inválido para ID do cliente." }),
		fiadoLiberado: z.boolean({
			required_error: "Liberação de fiado não informada.",
			invalid_type_error: "Tipo inválido para a liberação de fiado.",
		}),
		// null = sem limite (só faz sentido com o cliente liberado).
		fiadoLimite: z
			.number({ invalid_type_error: "Tipo inválido para o limite de fiado." })
			.min(0, "O limite de fiado não pode ser negativo.")
			.nullable(),
	})
	.transform((input) => ({ ...input, fiadoLimite: input.fiadoLiberado ? input.fiadoLimite : null }));
export type TUpdateClientStoreCreditInput = z.input<typeof UpdateClientStoreCreditInputSchema>;

async function updateClientStoreCredit({
	input,
	session,
}: {
	input: z.output<typeof UpdateClientStoreCreditInputSchema>;
	session: TAuthUserSession;
}) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	// Mesma trava das vendas fiado do cliente: a decisão só vale depois que as confirmações em
	// andamento terminarem, e as seguintes já leem a decisão nova.
	const [updated] = await db.transaction(async (tx) => {
		await lockClientStoreCredit(tx, organizacaoId, input.clientId);
		return tx
			.update(clients)
			.set({
				fiadoLiberado: input.fiadoLiberado,
				fiadoLimite: input.fiadoLimite === null ? null : Math.round(input.fiadoLimite * 100) / 100,
				fiadoLiberadoPorId: session.user.id,
				fiadoLiberadoEm: new Date(),
			})
			.where(and(eq(clients.id, input.clientId), eq(clients.organizacaoId, organizacaoId)))
			.returning({ id: clients.id });
	});
	if (!updated) throw new createHttpError.NotFound("Cliente não encontrado.");

	return {
		data: { clientId: updated.id },
		message: input.fiadoLiberado ? "Liberação de fiado atualizada." : "Fiado bloqueado para o cliente.",
	};
}
export type TUpdateClientStoreCreditOutput = Awaited<ReturnType<typeof updateClientStoreCredit>>;

async function updateClientStoreCreditRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canGrantStoreCredit(session.membership.permissoes)) {
		throw new createHttpError.Forbidden("Você não possui permissão para liberar fiado.");
	}
	const input = UpdateClientStoreCreditInputSchema.parse(await request.json());
	return NextResponse.json(await updateClientStoreCredit({ input, session }));
}

export const GET = appApiHandler({ GET: getClientStoreCreditRoute });
export const PUT = appApiHandler({ PUT: updateClientStoreCreditRoute });
