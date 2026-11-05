import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { canReviewSalesSession } from "@/lib/permissions/sales";
import { reviewSalesSession } from "@/lib/sales-sessions";
import { ReviewSalesSessionInputSchema, type TReviewSalesSessionInput } from "@/schemas/sales-sessions";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

async function reviewSalesSessionHandler({ input, session }: { input: TReviewSalesSessionInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");

	const result = await reviewSalesSession({ orgId, sessaoVendaId: input.sessaoVendaId, conferidaPorUsuarioId: session.user.id });

	return {
		data: result,
		message: "Sessao de venda conferida com sucesso.",
	};
}
export type TReviewSalesSessionOutput = Awaited<ReturnType<typeof reviewSalesSessionHandler>>;

async function reviewSalesSessionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");
	if (!canReviewSalesSession(session.membership.permissoes)) throw new createHttpError.Forbidden("Voce nao possui permissao para conferir sessoes de venda.");

	const body = await request.json();
	const input = ReviewSalesSessionInputSchema.parse(body);
	const result = await reviewSalesSessionHandler({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({ POST: reviewSalesSessionRoute });
