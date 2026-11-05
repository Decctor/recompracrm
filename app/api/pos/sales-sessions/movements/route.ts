import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canMoveCashRegister } from "@/lib/permissions/sales";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { registerSalesSessionMovement } from "@/lib/sales-sessions";
import { RegisterSalesSessionMovementInputSchema, type TRegisterSalesSessionMovementInput } from "@/schemas/sales-sessions";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function registerMovement({ input, session }: { input: TRegisterSalesSessionMovementInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");

	const organization = await db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, orgId) });
	if (!organization) throw new createHttpError.NotFound("Organizacao nao encontrada.");

	const transferencias = organization.configuracao.defaults.contabilidade.lancamentosPadrao.transferencias;

	const result = await registerSalesSessionMovement({
		orgId,
		input,
		autorId: session.user.id,
		transferAccounts: { debitoContaId: transferencias.debitoContaId, creditoContaId: transferencias.creditoContaId },
	});

	return {
		data: result,
		message: input.tipo === "SANGRIA" ? "Sangria registrada com sucesso." : "Suprimento registrado com sucesso.",
	};
}
export type TRegisterSalesSessionMovementOutput = Awaited<ReturnType<typeof registerMovement>>;

async function registerMovementRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");
	if (!canMoveCashRegister(session.membership.permissoes)) throw new createHttpError.Forbidden("Voce nao possui permissao para registrar sangria ou suprimento.");

	const body = await request.json();
	const input = RegisterSalesSessionMovementInputSchema.parse(body);
	const result = await registerMovement({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: registerMovementRoute });
