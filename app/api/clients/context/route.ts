import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanLookupClients } from "@/lib/clients/access";
import { GetClientContextInputSchema, getClientContext } from "@/lib/clients/context";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

export type { TGetClientContextInput, TGetClientContextOutput } from "@/lib/clients/context";

async function getClientContextRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	// Painel do cliente no hub de atendimentos: quem atende lê sem precisar do módulo de clientes.
	assertCanLookupClients(session);

	const { searchParams } = new URL(request.url);
	const input = GetClientContextInputSchema.parse({
		clientId: searchParams.get("clientId"),
	});
	const result = await getClientContext({ input, organizacaoId: session.membership.organizacao.id });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({
	GET: getClientContextRoute,
});
