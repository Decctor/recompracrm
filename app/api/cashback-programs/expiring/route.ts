import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { cashbackProgramTransactions, cashbackPrograms, clients } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CLIENTS_LIMIT = 5;

/**
 * Cashback prestes a expirar: total, quantos clientes e os maiores saldos por cliente. Janela com
 * piso em "agora" (o já expirado, ainda ATIVO até o cron passar, não entra) — mesma regra do cron
 * `cashback-expiring-notify`.
 */
const GetExpiringCashbackInputSchema = z.object({
	days: z
		.string({ invalid_type_error: "Tipo inválido para a janela em dias." })
		.optional()
		.nullable()
		.transform((v) => (v ? Math.min(Math.max(Number(v), 1), 90) : 30)),
});
export type TGetExpiringCashbackInput = z.infer<typeof GetExpiringCashbackInputSchema>;

async function getExpiringCashback({ input, session }: { input: TGetExpiringCashbackInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (!session.membership?.organizacao.configuracao.recursos.programasCashback.acesso)
		throw new createHttpError.Forbidden("Sua organização não possui acesso ao programa de cashback.");

	const now = new Date();
	const windowEnd = dayjs(now).add(input.days, "day").toDate();
	const conditions = and(
		eq(cashbackProgramTransactions.organizacaoId, organizacaoId),
		eq(cashbackProgramTransactions.status, "ATIVO"),
		gt(cashbackProgramTransactions.expiracaoData, now),
		lte(cashbackProgramTransactions.expiracaoData, windowEnd),
	);

	const [totals, porCliente, program] = await Promise.all([
		db
			.select({
				valor: sql<number>`coalesce(sum(${cashbackProgramTransactions.valorRestante}), 0)`,
				clientes: sql<number>`count(distinct ${cashbackProgramTransactions.clienteId})`,
			})
			.from(cashbackProgramTransactions)
			.where(conditions),
		db
			.select({
				clienteId: clients.id,
				nome: clients.nome,
				telefone: clients.telefone,
				valor: sql<number>`sum(${cashbackProgramTransactions.valorRestante})`,
				expiraEm: sql<string>`min(${cashbackProgramTransactions.expiracaoData})`,
			})
			.from(cashbackProgramTransactions)
			.innerJoin(clients, eq(clients.id, cashbackProgramTransactions.clienteId))
			.where(conditions)
			.groupBy(clients.id, clients.nome, clients.telefone)
			.orderBy(desc(sql`sum(${cashbackProgramTransactions.valorRestante})`))
			.limit(CLIENTS_LIMIT),
		db.query.cashbackPrograms.findFirst({ where: eq(cashbackPrograms.organizacaoId, organizacaoId), columns: { terminologia: true } }),
	]);

	return {
		data: {
			janelaDias: input.days,
			// O programa fala em dinheiro ou em pontos; quem exibe formata com `formatCashbackValue`.
			terminologia: program?.terminologia ?? ("DINHEIRO" as const),
			total: { valor: Number(totals[0]?.valor ?? 0), clientes: Number(totals[0]?.clientes ?? 0) },
			clientes: porCliente.map((row) => ({ ...row, valor: Number(row.valor) })),
		},
		message: "Cashback a expirar recuperado com sucesso.",
	};
}
export type TGetExpiringCashbackOutput = Awaited<ReturnType<typeof getExpiringCashback>>;

async function getExpiringCashbackRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetExpiringCashbackInputSchema.parse({ days: request.nextUrl.searchParams.get("days") });
	const result = await getExpiringCashback({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getExpiringCashbackRoute });
