import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { assertCanViewClients } from "@/lib/clients/access";
import { getClientMergeSuggestions } from "@/lib/clients/merge-suggestions";
import { db } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetClientMergeSuggestionsInputSchema = z.object({
	clientId: z
		.string({
			required_error: "ID do cliente não informado.",
			invalid_type_error: "Tipo não válido para o ID do cliente.",
		})
		.min(1, "ID do cliente não informado."),
});
export type TGetClientMergeSuggestionsInput = z.infer<typeof GetClientMergeSuggestionsInputSchema>;

/**
 * Candidatos a mesclagem de um cliente, para o menu "Mesclar com outro cadastro". Calculados na hora
 * e nunca gravados na fila: as regras são mais ousadas que as da varredura noturna e só fazem
 * sentido com alguém olhando. Ver lib/clients/merge-suggestions.ts.
 */
async function getClientMergeSuggestionsForClient({ input, session }: { input: TGetClientMergeSuggestionsInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const client = await db.query.clients.findFirst({
		columns: { id: true },
		where: and(eq(clients.id, input.clientId), eq(clients.organizacaoId, organizacaoId)),
	});
	if (!client) throw new createHttpError.NotFound("Cliente não encontrado.");

	const suggestions = await getClientMergeSuggestions({ db, organizacaoId, clienteId: client.id });
	return { data: { suggestions }, message: "Sugestões de mesclagem carregadas." };
}
export type TGetClientMergeSuggestionsOutput = Awaited<ReturnType<typeof getClientMergeSuggestionsForClient>>;

async function getClientMergeSuggestionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanViewClients(session);

	const input = GetClientMergeSuggestionsInputSchema.parse({ clientId: request.nextUrl.searchParams.get("clientId") });
	const result = await getClientMergeSuggestionsForClient({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getClientMergeSuggestionsRoute });
