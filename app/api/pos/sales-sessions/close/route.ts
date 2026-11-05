import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canOperateCashRegister } from "@/lib/permissions/sales";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { closeSalesSession } from "@/lib/sales-sessions";
import { CloseSalesSessionInputSchema, type TCloseSalesSessionInput } from "@/schemas/sales-sessions";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function closeSalesSessionHandler({ input, session }: { input: TCloseSalesSessionInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");

	const organization = await db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, orgId) });
	if (!organization) throw new createHttpError.NotFound("Organizacao nao encontrada.");

	const bloquearComPendenciaFiscal = organization.configuracao.preferencias.sessoesVenda?.bloquearFechamentoComPendenciaFiscal ?? false;

	const result = await closeSalesSession({
		orgId,
		input,
		fechadaPorUsuarioId: session.user.id,
		bloquearComPendenciaFiscal,
	});

	return {
		data: result,
		message: "Sessao de venda fechada com sucesso.",
	};
}
export type TCloseSalesSessionOutput = Awaited<ReturnType<typeof closeSalesSessionHandler>>;

async function closeSalesSessionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");
	if (!canOperateCashRegister(session.membership.permissoes)) throw new createHttpError.Forbidden("Voce nao possui permissao para fechar o caixa.");

	const body = await request.json();
	const input = CloseSalesSessionInputSchema.parse(body);
	const result = await closeSalesSessionHandler({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: closeSalesSessionRoute });
