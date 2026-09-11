import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { cashbackProgramTransactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const MAX_WINDOW_DAYS = 90;

/**
 * Uso de cashback: quanto voltou como resgate na janela e quanto foi gerado nela.
 *
 * Substitui o "circulando" (saldo parado dos clientes), que era um número sem ação possível —
 * grande ou pequeno, não dizia se o programa está puxando gente de volta. Resgate diz: cashback
 * usado é cliente que voltou à loja. A razão resgatado/gerado é direcional, não contábil — um
 * resgate pode consumir crédito de meses atrás (não há FIFO por janela aqui), então ela mede o
 * ritmo do programa, não o destino de cada real.
 */
const GetCashbackUsageInputSchema = z.object({
	days: z
		.string({ invalid_type_error: "Tipo inválido para a janela em dias." })
		.optional()
		.nullable()
		.transform((v) => (v ? Math.min(Math.max(Number(v), 1), MAX_WINDOW_DAYS) : 30)),
});
export type TGetCashbackUsageInput = z.infer<typeof GetCashbackUsageInputSchema>;

/** Transações de RESGATE gravam `valor` negativo, daí o `-sum` para devolver o total positivo. */
async function sumUsageWindow({ organizacaoId, after, before }: { organizacaoId: string; after: Date; before: Date }) {
	const [row] = await db
		.select({
			resgatadoValor: sql<number>`coalesce(-sum(${cashbackProgramTransactions.valor}) filter (where ${cashbackProgramTransactions.tipo} = 'RESGATE'), 0)`,
			resgatadoClientes: sql<number>`count(distinct ${cashbackProgramTransactions.clienteId}) filter (where ${cashbackProgramTransactions.tipo} = 'RESGATE')`,
			geradoValor: sql<number>`coalesce(sum(${cashbackProgramTransactions.valor}) filter (where ${cashbackProgramTransactions.tipo} = 'ACÚMULO'), 0)`,
		})
		.from(cashbackProgramTransactions)
		.where(
			and(
				eq(cashbackProgramTransactions.organizacaoId, organizacaoId),
				gte(cashbackProgramTransactions.dataInsercao, after),
				lt(cashbackProgramTransactions.dataInsercao, before),
			),
		);
	return {
		resgatadoValor: Number(row?.resgatadoValor ?? 0),
		resgatadoClientes: Number(row?.resgatadoClientes ?? 0),
		geradoValor: Number(row?.geradoValor ?? 0),
	};
}

async function getCashbackUsage({ input, session }: { input: TGetCashbackUsageInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (!session.membership?.organizacao.configuracao.recursos.programasCashback.acesso)
		throw new createHttpError.Forbidden("Sua organização não possui acesso ao programa de cashback.");

	const now = dayjs();
	const windowStart = now.subtract(input.days, "day").toDate();
	const previousStart = now.subtract(input.days * 2, "day").toDate();

	const [atual, anterior] = await Promise.all([
		sumUsageWindow({ organizacaoId, after: windowStart, before: now.toDate() }),
		sumUsageWindow({ organizacaoId, after: previousStart, before: windowStart }),
	]);

	return {
		data: {
			janelaDias: input.days,
			resgatado: { valor: atual.resgatadoValor, clientes: atual.resgatadoClientes },
			gerado: { valor: atual.geradoValor },
			// Só o resgatado do período anterior: é a referência do delta, e o dashboard não tem
			// filtros — a única comparação honesta é com o próprio histórico da loja.
			anterior: { valor: anterior.resgatadoValor },
		},
		message: "Uso de cashback recuperado com sucesso.",
	};
}
export type TGetCashbackUsageOutput = Awaited<ReturnType<typeof getCashbackUsage>>;

async function getCashbackUsageRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetCashbackUsageInputSchema.parse({ days: request.nextUrl.searchParams.get("days") });
	const result = await getCashbackUsage({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCashbackUsageRoute });
