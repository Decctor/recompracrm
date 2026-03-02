import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { cashbackProgramBalances } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetClientCashbackBalanceInputSchema = z.object({
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo não válido para ID do cliente.",
	}),
});
export type TGetClientCashbackBalanceInput = z.infer<typeof GetClientCashbackBalanceInputSchema>;

async function getClientCashbackBalance({ input, session }: { input: TGetClientCashbackBalanceInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const balance = await db.query.cashbackProgramBalances.findFirst({
		where: and(eq(cashbackProgramBalances.organizacaoId, organizacaoId), eq(cashbackProgramBalances.clienteId, input.clienteId)),
		columns: {
			id: true,
			clienteId: true,
			programaId: true,
			saldoValorDisponivel: true,
			saldoValorAcumuladoTotal: true,
			saldoValorResgatadoTotal: true,
		},
	});

	return {
		data: balance ?? {
			id: null,
			clienteId: input.clienteId,
			programaId: null,
			saldoValorDisponivel: 0,
			saldoValorAcumuladoTotal: 0,
			saldoValorResgatadoTotal: 0,
		},
		message: "Saldo de cashback carregado com sucesso.",
	};
}
export type TGetClientCashbackBalanceOutput = Awaited<ReturnType<typeof getClientCashbackBalance>>;

async function getClientCashbackBalanceRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const { searchParams } = new URL(request.url);
	const input = GetClientCashbackBalanceInputSchema.parse({
		clienteId: searchParams.get("clienteId"),
	});
	const result = await getClientCashbackBalance({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({
	GET: getClientCashbackBalanceRoute,
});
