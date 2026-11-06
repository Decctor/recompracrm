import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { setStatementLineIgnored, suggestRuleForStatementLine } from "@/lib/financial-reconciliation";
import { canReconcileFinances, canViewFinances } from "@/lib/permissions/finances";
import { FinancialStatementTransactionStatusEnum, type TFinancialStatementTransactionStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { financialStatementTransactions } from "@/services/drizzle/schema";
import { and, count, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";
import { DEFAULT_PAGE_SIZE, pageSizeInputSchema } from "@/lib/pagination";

const GetStatementTransactionsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo inválido para o ID da linha do extrato." }).optional().nullable(),
	contaFinanceiraId: z.string({ invalid_type_error: "Tipo inválido para o ID da conta financeira." }).optional().nullable(),
	importacaoId: z.string({ invalid_type_error: "Tipo inválido para o ID da importação." }).optional().nullable(),
	page: z.coerce.number().min(1).default(1),
	pageSize: pageSizeInputSchema(),
	search: z.string().optional().nullable(),
	statuses: z.string().optional().nullable(),
	periodAfter: z
		.string()
		.datetime({ message: "Tipo inválido para período." })
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	periodBefore: z
		.string()
		.datetime({ message: "Tipo inválido para período." })
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
});
export type TGetStatementTransactionsInput = z.infer<typeof GetStatementTransactionsInputSchema>;

const MATCH_RELATION_CONFIG = {
	with: {
		transacaoFinanceira: {
			columns: {
				id: true,
				titulo: true,
				tipo: true,
				valor: true,
				metodo: true,
				dataPrevisao: true,
				dataEfetivacao: true,
				contaFinanceiraId: true,
			},
		},
	},
} as const;

async function getStatementTransactions({ input, session }: { input: TGetStatementTransactionsInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (input.id) {
		const linha = await db.query.financialStatementTransactions.findFirst({
			where: and(eq(financialStatementTransactions.id, input.id), eq(financialStatementTransactions.organizacaoId, orgId)),
			with: {
				importacao: { columns: { id: true, arquivoNome: true, origem: true, dataInsercao: true } },
				contaFinanceira: { columns: { id: true, nome: true, tipo: true } },
				matches: MATCH_RELATION_CONFIG,
			},
		});
		if (!linha) throw new createHttpError.NotFound("Linha do extrato não encontrada.");

		// Sugestão de regra aprendida (contas contábeis) para o fluxo "criar lançamento".
		const regraSugerida =
			linha.status === "PENDENTE" ? await suggestRuleForStatementLine({ organizacaoId: orgId, descricao: linha.descricao, tipo: linha.tipo }) : null;

		return { data: { byId: { ...linha, regraSugerida }, default: null }, message: "Linha do extrato encontrada." };
	}

	const statusesArr = input.statuses
		? (input.statuses
				.split(",")
				.filter((value) => FinancialStatementTransactionStatusEnum.safeParse(value).success) as TFinancialStatementTransactionStatusEnum[])
		: [];

	const conditions = [eq(financialStatementTransactions.organizacaoId, orgId)];
	if (input.contaFinanceiraId) conditions.push(eq(financialStatementTransactions.contaFinanceiraId, input.contaFinanceiraId));
	if (input.importacaoId) conditions.push(eq(financialStatementTransactions.importacaoId, input.importacaoId));
	if (input.search && input.search.trim().length > 0) conditions.push(ilike(financialStatementTransactions.descricao, `%${input.search.trim()}%`));
	if (input.periodAfter) conditions.push(gte(financialStatementTransactions.dataTransacao, input.periodAfter));
	if (input.periodBefore) conditions.push(lte(financialStatementTransactions.dataTransacao, input.periodBefore));
	if (statusesArr.length > 0) conditions.push(inArray(financialStatementTransactions.status, statusesArr));

	const PAGE_SIZE = input.pageSize ?? DEFAULT_PAGE_SIZE;
	const [countResult, transactions, statusCounts] = await Promise.all([
		db
			.select({ count: count() })
			.from(financialStatementTransactions)
			.where(and(...conditions)),
		db.query.financialStatementTransactions.findMany({
			where: and(...conditions),
			with: {
				matches: MATCH_RELATION_CONFIG,
			},
			orderBy: (fields, { desc }) => [desc(fields.dataTransacao), desc(fields.dataInsercao)],
			limit: PAGE_SIZE,
			offset: PAGE_SIZE * (input.page - 1),
		}),
		// Resumo por status da conta (independente de paginação/busca) para os cards da UI.
		input.contaFinanceiraId
			? db
					.select({ status: financialStatementTransactions.status, count: count() })
					.from(financialStatementTransactions)
					.where(
						and(eq(financialStatementTransactions.organizacaoId, orgId), eq(financialStatementTransactions.contaFinanceiraId, input.contaFinanceiraId)),
					)
					.groupBy(financialStatementTransactions.status)
			: Promise.resolve([]),
	]);

	const transactionsMatched = countResult[0]?.count ?? 0;
	return {
		data: {
			byId: null,
			default: {
				transactions,
				transactionsMatched,
				totalPages: Math.ceil(transactionsMatched / PAGE_SIZE),
				statusCounts: {
					pendentes: statusCounts.find((row) => row.status === "PENDENTE")?.count ?? 0,
					conciliadas: statusCounts.find((row) => row.status === "CONCILIADA")?.count ?? 0,
					ignoradas: statusCounts.find((row) => row.status === "IGNORADA")?.count ?? 0,
				},
			},
		},
		message: "Linhas do extrato listadas com sucesso.",
	};
}
export type TGetStatementTransactionsOutput = Awaited<ReturnType<typeof getStatementTransactions>>;
export type TGetStatementTransactionsOutputById = NonNullable<TGetStatementTransactionsOutput["data"]["byId"]>;
export type TGetStatementTransactionsOutputDefault = NonNullable<TGetStatementTransactionsOutput["data"]["default"]>;

async function getStatementTransactionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canViewFinances(session.membership.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para acessar o módulo financeiro.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetStatementTransactionsInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		contaFinanceiraId: searchParams.get("contaFinanceiraId") ?? undefined,
		importacaoId: searchParams.get("importacaoId") ?? undefined,
		page: searchParams.get("page") ?? 1,
		pageSize: searchParams.get("pageSize"),
		search: searchParams.get("search") ?? undefined,
		statuses: searchParams.get("statuses") ?? undefined,
		periodAfter: searchParams.get("periodAfter") ?? undefined,
		periodBefore: searchParams.get("periodBefore") ?? undefined,
	});
	const result = await getStatementTransactions({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getStatementTransactionsRoute });

const UpdateStatementTransactionInputSchema = z.object({
	linhaId: z.string({ required_error: "ID da linha do extrato não informado." }),
	ignorada: z.boolean({ required_error: "Ação de ignorar/restaurar não informada." }),
});
export type TUpdateStatementTransactionInput = z.infer<typeof UpdateStatementTransactionInputSchema>;

async function updateStatementTransaction({ input, orgId }: { input: TUpdateStatementTransactionInput; orgId: string }) {
	const result = await setStatementLineIgnored({ organizacaoId: orgId, linhaId: input.linhaId, ignorada: input.ignorada });
	return {
		data: result,
		message: input.ignorada ? "Linha do extrato ignorada." : "Linha do extrato restaurada.",
	};
}
export type TUpdateStatementTransactionOutput = Awaited<ReturnType<typeof updateStatementTransaction>>;

async function updateStatementTransactionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canReconcileFinances(session.membership.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para realizar conciliação bancária.");

	const body = await request.json();
	const input = UpdateStatementTransactionInputSchema.parse(body);
	const result = await updateStatementTransaction({ input, orgId: session.membership.organizacao.id });
	return NextResponse.json(result);
}

export const PUT = appApiHandler({ PUT: updateStatementTransactionRoute });
