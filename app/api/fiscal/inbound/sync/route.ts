import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { requestInboundSyncNow } from "@/lib/fiscal/inbound";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

async function requestInboundSync({ orgId }: { orgId: string }) {
	const result = await requestInboundSyncNow({ organizationId: orgId });
	return {
		data: result,
		message: result.accepted
			? "Sincronização solicitada. As novas notas aparecem em alguns minutos."
			: "Uma consulta já foi solicitada ou está no intervalo de espera. Aguarde o horário indicado para consultar novamente.",
	};
}
export type TRequestInboundSyncOutput = Awaited<ReturnType<typeof requestInboundSync>>;

async function requestInboundSyncRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!session.membership?.permissoes.fiscal.visualizar) throw new createHttpError.Forbidden("Oops, você não possui permissão para o módulo fiscal.");

	const result = await requestInboundSync({ orgId });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: requestInboundSyncRoute });
