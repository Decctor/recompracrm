import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { canMoveCashRegister } from "@/lib/permissions/sales";
import { registerSalesSessionMovement } from "@/lib/sales-sessions";
import { listSalesSessionMovementOptions } from "@/lib/sales-sessions/drawer-account";
import { RegisterSalesSessionMovementInputSchema, type TRegisterSalesSessionMovementInput } from "@/schemas/sales-sessions";
import { db } from "@/services/drizzle";
import { salesSessions } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ---------------------------------------------------------------------------------------------------
// GET: contas e categorias que o modal de movimento oferece
// ---------------------------------------------------------------------------------------------------

const GetSalesSessionMovementOptionsInputSchema = z.object({
	sessaoVendaId: z.string({
		required_error: "ID da sessao de venda nao informado.",
		invalid_type_error: "Tipo nao valido para o ID da sessao de venda.",
	}),
});
export type TGetSalesSessionMovementOptionsInput = z.infer<typeof GetSalesSessionMovementOptionsInputSchema>;

async function getSalesSessionMovementOptions({ input, session }: { input: TGetSalesSessionMovementOptionsInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");

	const [salesSession, organization] = await Promise.all([
		db.query.salesSessions.findFirst({
			where: and(eq(salesSessions.id, input.sessaoVendaId), eq(salesSessions.organizacaoId, orgId)),
			columns: { id: true, contaFinanceiraId: true },
		}),
		db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, orgId), columns: { configuracao: true } }),
	]);
	if (!salesSession) throw new createHttpError.NotFound("Sessao de venda nao encontrada.");

	const options = await listSalesSessionMovementOptions({
		orgId,
		sessionAccountId: salesSession.contaFinanceiraId,
		configuracao: organization?.configuracao,
	});
	return { data: options, message: "Opcoes de movimento de caixa carregadas com sucesso." };
}
export type TGetSalesSessionMovementOptionsOutput = Awaited<ReturnType<typeof getSalesSessionMovementOptions>>;

async function getSalesSessionMovementOptionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");
	if (!canMoveCashRegister(session.membership.permissoes)) throw new createHttpError.Forbidden("Voce nao possui permissao para movimentar o caixa.");

	const input = GetSalesSessionMovementOptionsInputSchema.parse({ sessaoVendaId: request.nextUrl.searchParams.get("sessaoVendaId") });
	const result = await getSalesSessionMovementOptions({ input, session });
	return NextResponse.json(result);
}

// ---------------------------------------------------------------------------------------------------
// POST: registra sangria, suprimento ou despesa
// ---------------------------------------------------------------------------------------------------

const MOVEMENT_MESSAGES: Record<TRegisterSalesSessionMovementInput["tipo"], string> = {
	SANGRIA: "Sangria registrada com sucesso.",
	SUPRIMENTO: "Suprimento registrado com sucesso.",
	DESPESA: "Despesa registrada com sucesso.",
};

async function registerMovement({ input, session }: { input: TRegisterSalesSessionMovementInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");

	const organization = await db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, orgId), columns: { configuracao: true } });
	if (!organization) throw new createHttpError.NotFound("Organizacao nao encontrada.");

	const result = await registerSalesSessionMovement({
		orgId,
		input,
		autorId: session.user.id,
		configuracao: organization.configuracao,
	});

	return { data: result, message: MOVEMENT_MESSAGES[input.tipo] };
}
export type TRegisterSalesSessionMovementOutput = Awaited<ReturnType<typeof registerMovement>>;

async function registerMovementRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");
	if (!canMoveCashRegister(session.membership.permissoes))
		throw new createHttpError.Forbidden("Voce nao possui permissao para registrar sangria, suprimento ou despesa.");

	const body = await request.json();
	const input = RegisterSalesSessionMovementInputSchema.parse(body);
	const result = await registerMovement({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSalesSessionMovementOptionsRoute });
export const POST = appApiHandler({ POST: registerMovementRoute });
