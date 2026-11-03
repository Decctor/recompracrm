import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getFiscalPendingSummary } from "@/lib/fiscal/pending";
import { loadFiscalOrganization } from "@/lib/fiscal/settings";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

async function getFiscalPending({ organizationId }: { organizationId: string }) {
	// O provedor so condiciona a consulta de prazos: a leitura da organizacao corre junto com as
	// demais consultas do resumo em vez de antes delas.
	const summary = await getFiscalPendingSummary({
		organizationId,
		provider: loadFiscalOrganization(organizationId).then((organizacao) => organizacao?.fiscalProvedor),
	});
	return { data: summary, message: "Pendências fiscais encontradas com sucesso." };
}
export type TGetFiscalPendingOutput = Awaited<ReturnType<typeof getFiscalPending>>;

async function getFiscalPendingRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const sessionMembership = session.membership;
	if (!sessionMembership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!sessionMembership.permissoes.fiscal.visualizar)
		throw new createHttpError.Forbidden("Oops, você não possui permissão para visualizar o módulo fiscal.");

	const result = await getFiscalPending({ organizationId: sessionMembership.organizacao.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getFiscalPendingRoute });
