import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getSalesSessionDetail } from "@/lib/sales-sessions/get-session-detail";
import { db } from "@/services/drizzle";
import { salesSessions } from "@/services/drizzle/schema";
import { and, count, desc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PAGE_SIZE = 25;

const GetSalesSessionsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo invalido para o ID da sessao." }).optional().nullable(),
	page: z
		.string({ invalid_type_error: "Tipo invalido para pagina." })
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : 1)),
	status: z.enum(["ABERTA", "FECHADA", "CONFERIDA", "CANCELADA"]).optional().nullable(),
});
export type TGetSalesSessionsInput = z.infer<typeof GetSalesSessionsInputSchema>;

async function getSalesSessions({ input, session }: { input: TGetSalesSessionsInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");

	if (input.id) {
		const byId = await getSalesSessionDetail({ orgId, sessionId: input.id });
		return {
			data: {
				byId,
				default: undefined,
			},
			message: "Sessao de venda encontrada com sucesso.",
		};
	}

	const conditions = [eq(salesSessions.organizacaoId, orgId)];
	if (input.status) conditions.push(eq(salesSessions.status, input.status));

	const page = input.page && input.page > 0 ? input.page : 1;
	const skip = PAGE_SIZE * (page - 1);

	const [sessionsResult, totalResult] = await Promise.all([
		db.query.salesSessions.findMany({
			where: and(...conditions),
			with: { vendedorPadrao: { columns: { id: true, nome: true } } },
			orderBy: desc(salesSessions.dataAbertura),
			offset: skip,
			limit: PAGE_SIZE,
		}),
		db
			.select({ count: count() })
			.from(salesSessions)
			.where(and(...conditions)),
	]);

	const matched = totalResult[0]?.count ?? 0;

	return {
		data: {
			byId: undefined,
			default: {
				sessions: sessionsResult,
				sessionsMatched: matched,
				totalPages: Math.ceil(matched / PAGE_SIZE),
			},
		},
		message: "Sessoes de venda listadas com sucesso.",
	};
}
export type TGetSalesSessionsOutput = Awaited<ReturnType<typeof getSalesSessions>>;
export type TGetSalesSessionsOutputById = Exclude<TGetSalesSessionsOutput["data"]["byId"], undefined>;
export type TGetSalesSessionsOutputDefault = Exclude<TGetSalesSessionsOutput["data"]["default"], undefined>;

async function getSalesSessionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Voce nao esta autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Voce precisa estar vinculado a uma organizacao.");

	const { searchParams } = new URL(request.url);
	const input = GetSalesSessionsInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		page: searchParams.get("page") ?? undefined,
		status: searchParams.get("status") ?? undefined,
	});
	const result = await getSalesSessions({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSalesSessionsRoute });
