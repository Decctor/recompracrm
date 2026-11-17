import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canViewCashback } from "@/lib/permissions/cashback";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions, cashbackPrograms, clients } from "@/services/drizzle/schema";
import { and, asc, count, desc, eq, gt, lte, sql } from "drizzle-orm";
import dayjs from "dayjs";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetCashbackBalancesInputSchema = z.object({
	clientId: z.string({ invalid_type_error: "Tipo não válido para ID do cliente." }).optional().nullable(),
	page: z
		.string({ invalid_type_error: "Tipo não válido para página." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 1)),
	limit: z
		.string({ invalid_type_error: "Tipo não válido para limite." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 20)),
	search: z
		.string({ invalid_type_error: "Tipo não válido para busca." })
		.optional()
		.nullable()
		.transform((value) => value?.trim() ?? ""),
	orderByField: z
		.enum(["clienteNome", "saldoValorDisponivel", "saldoValorAcumuladoTotal", "saldoValorResgatadoTotal"])
		.optional()
		.nullable()
		.transform((value) => value ?? "saldoValorDisponivel"),
	orderByDirection: z
		.enum(["asc", "desc"])
		.optional()
		.nullable()
		.transform((value) => value ?? "desc"),
});
export type TGetCashbackBalancesInput = z.infer<typeof GetCashbackBalancesInputSchema>;

const EXPIRING_SOON_WINDOW_DAYS = 30;

/**
 * Quanto do saldo do cliente vence em breve, e quando vence o primeiro pedaço.
 *
 * Mesmo predicado do cron de aviso de expiração: acúmulos ativos com valor restante, com prazo
 * entre hoje e o fim da janela. A janela consultada é sempre de 30 dias; a janela INFORMADA é
 * limitada à validade do programa, porque nenhum acúmulo vence além de "agora + validade" e um
 * programa de 15 dias diria "nos próximos 30 dias" sobre um valor que é o saldo inteiro. Limitar
 * só o rótulo, e não a consulta, mantém as três leituras em paralelo.
 */
async function getClientExpiringSoon({ organizationId, clientId }: { organizationId: string; clientId: string }) {
	const today = new Date();
	const windowEndDate = dayjs(today).add(EXPIRING_SOON_WINDOW_DAYS, "day").endOf("day").toDate();

	const [program, [aggregate]] = await Promise.all([
		db.query.cashbackPrograms.findFirst({
			where: eq(cashbackPrograms.organizacaoId, organizationId),
			columns: { expiracaoRegraValidadeValor: true },
		}),
		db
			.select({
				valor: sql<number>`coalesce(sum(${cashbackProgramTransactions.valorRestante}), 0)`.mapWith(Number),
				proximaExpiracaoData: sql<Date | null>`min(${cashbackProgramTransactions.expiracaoData})`.mapWith((value) => (value ? new Date(value) : null)),
			})
			.from(cashbackProgramTransactions)
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, organizationId),
					eq(cashbackProgramTransactions.clienteId, clientId),
					eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
					eq(cashbackProgramTransactions.status, "ATIVO"),
					gt(cashbackProgramTransactions.valorRestante, 0),
					gt(cashbackProgramTransactions.expiracaoData, today),
					lte(cashbackProgramTransactions.expiracaoData, windowEndDate),
				),
			),
	]);

	const validityDays = program?.expiracaoRegraValidadeValor ?? 0;
	const janelaDias = validityDays > 0 ? Math.min(EXPIRING_SOON_WINDOW_DAYS, Math.ceil(validityDays)) : EXPIRING_SOON_WINDOW_DAYS;

	return {
		valor: aggregate?.valor ?? 0,
		proximaExpiracaoData: aggregate?.proximaExpiracaoData ?? null,
		janelaDias,
	};
}

async function getCashbackBalances({ input, session }: { input: TGetCashbackBalancesInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (input.clientId) {
		const [balance, expiringSoon] = await Promise.all([
			db.query.cashbackProgramBalances.findFirst({
				where: and(eq(cashbackProgramBalances.organizacaoId, organizationId), eq(cashbackProgramBalances.clienteId, input.clientId)),
				columns: {
					id: true,
					clienteId: true,
					programaId: true,
					saldoValorDisponivel: true,
					saldoValorAcumuladoTotal: true,
					saldoValorResgatadoTotal: true,
				},
			}),
			getClientExpiringSoon({ organizationId, clientId: input.clientId }),
		]);

		return {
			data: {
				byClientId: {
					...(balance ?? {
						id: null,
						clienteId: input.clientId,
						programaId: null,
						saldoValorDisponivel: 0,
						saldoValorAcumuladoTotal: 0,
						saldoValorResgatadoTotal: 0,
					}),
					expirandoEmBreve: expiringSoon,
				},
				default: null,
			},
			message: "Saldo de cashback carregado com sucesso.",
		};
	}

	const conditions = [eq(cashbackProgramBalances.organizacaoId, organizationId)];
	if (input.search) {
		conditions.push(createSimplifiedSearchCondition(clients.nome, input.search));
	}

	const direction = input.orderByDirection === "desc" ? desc : asc;
	const orderByColumn =
		input.orderByField === "saldoValorDisponivel"
			? cashbackProgramBalances.saldoValorDisponivel
			: input.orderByField === "saldoValorAcumuladoTotal"
				? cashbackProgramBalances.saldoValorAcumuladoTotal
				: input.orderByField === "saldoValorResgatadoTotal"
					? cashbackProgramBalances.saldoValorResgatadoTotal
					: clients.nome;
	const offset = (input.page - 1) * input.limit;

	const [countResult, balances] = await Promise.all([
		db
			.select({ count: count() })
			.from(cashbackProgramBalances)
			.innerJoin(clients, eq(cashbackProgramBalances.clienteId, clients.id))
			.where(and(...conditions)),
		db
			.select({
				id: cashbackProgramBalances.id,
				clienteId: cashbackProgramBalances.clienteId,
				programaId: cashbackProgramBalances.programaId,
				saldoValorDisponivel: cashbackProgramBalances.saldoValorDisponivel,
				saldoValorAcumuladoTotal: cashbackProgramBalances.saldoValorAcumuladoTotal,
				saldoValorResgatadoTotal: cashbackProgramBalances.saldoValorResgatadoTotal,
				cliente: { id: clients.id, nome: clients.nome },
			})
			.from(cashbackProgramBalances)
			.innerJoin(clients, eq(cashbackProgramBalances.clienteId, clients.id))
			.where(and(...conditions))
			.orderBy(direction(orderByColumn))
			.limit(input.limit)
			.offset(offset),
	]);

	const balancesMatched = countResult[0]?.count ?? 0;
	return {
		data: {
			byClientId: null,
			default: {
				balances,
				balancesMatched,
				totalPages: Math.ceil(balancesMatched / input.limit),
			},
		},
		message: "Saldos de cashback carregados com sucesso.",
	};
}

export type TGetCashbackBalancesOutput = Awaited<ReturnType<typeof getCashbackBalances>>;
export type TGetCashbackBalancesOutputDefault = NonNullable<TGetCashbackBalancesOutput["data"]["default"]>;
export type TGetCashbackBalanceOutputByClientId = NonNullable<TGetCashbackBalancesOutput["data"]["byClientId"]>;

async function getCashbackBalancesRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const { searchParams } = new URL(request.url);
	const input = GetCashbackBalancesInputSchema.parse({
		clientId: searchParams.get("clientId"),
		page: searchParams.get("page"),
		limit: searchParams.get("limit"),
		search: searchParams.get("search"),
		orderByField: searchParams.get("orderByField"),
		orderByDirection: searchParams.get("orderByDirection"),
	});
	// Saldo/extrato de um cliente é leitura operacional (PDV, ficha do cliente); a listagem da base é o módulo.
	if (!input.clientId && !canViewCashback(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar o programa de cashback.");
	const result = await getCashbackBalances({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getCashbackBalancesRoute });
