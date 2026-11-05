import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canOperateCashRegister } from "@/lib/permissions/sales";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { isUniqueViolationError } from "@/lib/db-utils";
import { validateActiveSeller } from "@/lib/sellers/validate-active-seller";
import { OpenSalesSessionInputSchema, type TOpenSalesSessionInput } from "@/schemas/sales-sessions";
import { db } from "@/services/drizzle";
import { salesSessions } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function openSalesSession({ input, session }: { input: TOpenSalesSessionInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");
	const organization = await db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, orgId) });
	if (!organization) throw new createHttpError.NotFound("Organizacao nao encontrada.");
	const config = organization.configuracao.preferencias.sessoesVenda;
	if (!config?.habilitado) throw new createHttpError.BadRequest("As sessoes de venda nao estao habilitadas para esta organizacao.");
	if (config.exigirFundoTroco && input.saldoInicial <= 0)
		throw new createHttpError.BadRequest("Informe o fundo de troco (saldo inicial) para abrir o caixa.");

	await validateActiveSeller({ orgId, sellerId: input.vendedorPadraoId });
	if (input.politica === "VENDEDOR_UNICO") {
		const existingOpen = await db.query.salesSessions.findFirst({
			where: and(
				eq(salesSessions.organizacaoId, orgId),
				eq(salesSessions.vendedorPadraoId, input.vendedorPadraoId as string),
				eq(salesSessions.politica, "VENDEDOR_UNICO"),
				eq(salesSessions.status, "ABERTA"),
			),
			columns: { id: true },
		});
		if (existingOpen) throw new createHttpError.Conflict("Ja existe uma sessao de vendedor unico aberta para este vendedor.");
	}

	let created: { id: string } | undefined;
	try {
		[created] = await db
			.insert(salesSessions)
			.values({
				organizacaoId: orgId,
				contaFinanceiraId: input.contaFinanceiraId ?? null,
				politica: input.politica,
				vendedorPadraoId: input.vendedorPadraoId ?? null,
				abertaPorUsuarioId: session.user.id,
				status: "ABERTA",
				saldoInicial: input.saldoInicial,
				observacoesAbertura: input.observacoesAbertura ?? null,
			})
			.returning({ id: salesSessions.id });
	} catch (error) {
		if (isUniqueViolationError(error)) throw new createHttpError.Conflict("Ja existe uma sessao de vendedor unico aberta para este vendedor.");
		throw error;
	}
	if (!created?.id) throw new createHttpError.InternalServerError("Erro ao abrir sessao de venda.");
	return { data: { createdId: created.id }, message: "Sessao de venda aberta com sucesso." };
}
export type TOpenSalesSessionOutput = Awaited<ReturnType<typeof openSalesSession>>;

async function openSalesSessionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");
	if (!canOperateCashRegister(session.membership.permissoes)) throw new createHttpError.Forbidden("Voce nao possui permissao para abrir o caixa.");
	const input = OpenSalesSessionInputSchema.parse(await request.json());
	return NextResponse.json(await openSalesSession({ input, session }));
}

export const POST = appApiHandler({ POST: openSalesSessionRoute });
