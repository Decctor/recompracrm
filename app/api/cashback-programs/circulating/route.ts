import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const MAX_WINDOW_DAYS = 90;

/**
 * Cashback circulando: quanto de saldo dos clientes está vivo agora e qual parte dele vence na
 * janela. O widget de expiração lista quem tem a vencer; este dá o denominador — sem ele, "R$ 1.940
 * expirando" não diz se é uma sobra ou metade do programa.
 *
 * O total sai de `cashbackProgramBalances` (o saldo consolidado) e o recorte a expirar das
 * transações ainda ATIVAs, com piso em "agora", a mesma regra da rota de expiração.
 */
const GetCirculatingCashbackInputSchema = z.object({
	days: z
		.string({ invalid_type_error: "Tipo inválido para a janela em dias." })
		.optional()
		.nullable()
		.transform((v) => (v ? Math.min(Math.max(Number(v), 1), MAX_WINDOW_DAYS) : 30)),
});
export type TGetCirculatingCashbackInput = z.infer<typeof GetCirculatingCashbackInputSchema>;

async function getCirculatingCashback({ input, session }: { input: TGetCirculatingCashbackInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (!session.membership?.organizacao.configuracao.recursos.programasCashback.acesso)
		throw new createHttpError.Forbidden("Sua organização não possui acesso ao programa de cashback.");

	const now = new Date();
	const windowEnd = dayjs(now).add(input.days, "day").toDate();

	const [circulando, expirando] = await Promise.all([
		db
			.select({
				valor: sql<number>`coalesce(sum(${cashbackProgramBalances.saldoValorDisponivel}), 0)`,
				clientes: sql<number>`count(distinct ${cashbackProgramBalances.clienteId}) filter (where ${cashbackProgramBalances.saldoValorDisponivel} > 0)`,
			})
			.from(cashbackProgramBalances)
			.where(eq(cashbackProgramBalances.organizacaoId, organizacaoId)),
		db
			.select({
				valor: sql<number>`coalesce(sum(${cashbackProgramTransactions.valorRestante}), 0)`,
				clientes: sql<number>`count(distinct ${cashbackProgramTransactions.clienteId})`,
				primeiroEm: sql<string | null>`min(${cashbackProgramTransactions.expiracaoData})`,
			})
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, organizacaoId),
					eq(cashbackProgramTransactions.status, "ATIVO"),
					gt(cashbackProgramTransactions.expiracaoData, now),
					lte(cashbackProgramTransactions.expiracaoData, windowEnd),
				),
			),
	]);

	return {
		data: {
			janelaDias: input.days,
			circulando: { valor: Number(circulando[0]?.valor ?? 0), clientes: Number(circulando[0]?.clientes ?? 0) },
			expirando: {
				valor: Number(expirando[0]?.valor ?? 0),
				clientes: Number(expirando[0]?.clientes ?? 0),
				primeiroEm: expirando[0]?.primeiroEm ?? null,
			},
		},
		message: "Cashback circulando recuperado com sucesso.",
	};
}
export type TGetCirculatingCashbackOutput = Awaited<ReturnType<typeof getCirculatingCashback>>;

async function getCirculatingCashbackRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetCirculatingCashbackInputSchema.parse({ days: request.nextUrl.searchParams.get("days") });
	const result = await getCirculatingCashback({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCirculatingCashbackRoute });
