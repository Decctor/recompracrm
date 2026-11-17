import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { canViewCashback } from "@/lib/permissions/cashback";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { createSimplifiedSearchCondition } from "@/lib/search";
import { db } from "@/services/drizzle";
import { cashbackProgramPrizes, cashbackProgramTransactions, clients, products, sellers } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetCashbackProgramTransactionsInputSchema = z.object({
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
	clientId: z.string({ invalid_type_error: "Tipo não válido para ID do cliente." }).optional().nullable(),
	operatorSellerIds: z
		.string({ invalid_type_error: "Tipo não válido para IDs dos operadores." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",") : [])),
	types: z
		.string({ invalid_type_error: "Tipo não válido para tipos de transação." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",") : []))
		.pipe(z.array(z.enum(["ACÚMULO", "RESGATE", "EXPIRAÇÃO"]))),
	periodAfter: z
		.string({ invalid_type_error: "Tipo não válido para início do período." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
	periodBefore: z
		.string({ invalid_type_error: "Tipo não válido para fim do período." })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null)),
});
export type TGetCashbackProgramTransactionsInput = z.infer<typeof GetCashbackProgramTransactionsInputSchema>;

type TTransaction = {
	id: string;
	tipo: "ACÚMULO" | "RESGATE" | "EXPIRAÇÃO" | "CANCELAMENTO";
	status: "ATIVO" | "CONSUMIDO" | "EXPIRADO";
	valor: number;
	saldoValorPosterior: number;
	dataInsercao: Date;
	expiracaoData: Date | null;
	operadorVendedor: { id: string; nome: string } | null;
	resgateRecompensa: { id: string; titulo: string; imagemCapaUrl: string | null } | null;
	cliente: { id: string; nome: string };
	venda: {
		id: string;
		valorTotal: number;
		canal: string | null;
		entregaModalidade: string | null;
		vendedor: { id: string; nome: string } | null;
		parceiro: { id: string; nome: string } | null;
	} | null;
};

type TTransactionsResult = {
	transactions: TTransaction[];
	transactionsMatched: number;
	totalPages: number;
};

async function getCashbackProgramTransactions({ input, session }: { input: TGetCashbackProgramTransactionsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const conditions = [eq(cashbackProgramTransactions.organizacaoId, organizationId)];
	if (input.periodAfter) conditions.push(gte(cashbackProgramTransactions.dataInsercao, input.periodAfter));
	if (input.periodBefore) conditions.push(lte(cashbackProgramTransactions.dataInsercao, dayjs(input.periodBefore).endOf("day").toDate()));
	if (input.types.length > 0) conditions.push(inArray(cashbackProgramTransactions.tipo, input.types));
	if (input.clientId) conditions.push(eq(cashbackProgramTransactions.clienteId, input.clientId));
	if (input.operatorSellerIds.length > 0) conditions.push(inArray(cashbackProgramTransactions.operadorVendedorId, input.operatorSellerIds));

	if (input.search) {
		const matchingTransactions = db
			.select({ id: cashbackProgramTransactions.id })
			.from(cashbackProgramTransactions)
			.innerJoin(clients, eq(cashbackProgramTransactions.clienteId, clients.id))
			.leftJoin(sellers, eq(cashbackProgramTransactions.operadorVendedorId, sellers.id))
			.leftJoin(cashbackProgramPrizes, eq(cashbackProgramTransactions.resgateRecompensaId, cashbackProgramPrizes.id))
			.leftJoin(products, eq(cashbackProgramPrizes.produtoId, products.id))
			.where(
				and(
					eq(cashbackProgramTransactions.organizacaoId, organizationId),
					or(
						createSimplifiedSearchCondition(clients.nome, input.search),
						createSimplifiedSearchCondition(sellers.nome, input.search),
						createSimplifiedSearchCondition(cashbackProgramPrizes.titulo, input.search),
						createSimplifiedSearchCondition(products.nome, input.search),
					),
				),
			);
		conditions.push(inArray(cashbackProgramTransactions.id, matchingTransactions));
	}

	const offset = (input.page - 1) * input.limit;
	const [totalCountResult, transactions] = await Promise.all([
		db
			.select({ count: count() })
			.from(cashbackProgramTransactions)
			.where(and(...conditions)),
		db.query.cashbackProgramTransactions.findMany({
			where: and(...conditions),
			orderBy: [desc(cashbackProgramTransactions.dataInsercao)],
			limit: input.limit,
			offset,
			with: {
				operadorVendedor: { columns: { id: true, nome: true } },
				resgateRecompensa: { columns: { id: true, titulo: true, imagemCapaUrl: true } },
				cliente: { columns: { id: true, nome: true } },
				venda: {
					columns: { id: true, valorTotal: true, canal: true, entregaModalidade: true },
					with: {
						vendedor: { columns: { id: true, nome: true } },
						parceiro: { columns: { id: true, nome: true } },
					},
				},
			},
		}),
	]);

	const total = totalCountResult[0]?.count ?? 0;
	const payload: TTransactionsResult = {
		transactions: transactions.map((transaction) => ({
			id: transaction.id,
			tipo: transaction.tipo,
			status: transaction.status,
			valor: transaction.valor,
			saldoValorPosterior: transaction.saldoValorPosterior,
			dataInsercao: transaction.dataInsercao,
			expiracaoData: transaction.expiracaoData,
			operadorVendedor: transaction.operadorVendedor,
			resgateRecompensa: transaction.resgateRecompensa,
			cliente: transaction.cliente,
			venda: transaction.venda
				? {
						...transaction.venda,
						valorTotal: Number(transaction.venda.valorTotal),
					}
				: null,
		})),
		transactionsMatched: total,
		totalPages: Math.ceil(total / input.limit),
	};

	return {
		data: {
			default: input.clientId ? null : payload,
			byClientId: input.clientId ? payload : null,
		},
		message: "Transações de cashback carregadas com sucesso.",
	};
}

export type TGetCashbackProgramTransactionsOutput = Awaited<ReturnType<typeof getCashbackProgramTransactions>>;
export type TGetCashbackProgramTransactionsOutputDefault = NonNullable<TGetCashbackProgramTransactionsOutput["data"]["default"]>;
export type TGetCashbackProgramTransactionsOutputByClientId = NonNullable<TGetCashbackProgramTransactionsOutput["data"]["byClientId"]>;

async function getCashbackProgramTransactionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const { searchParams } = new URL(request.url);
	const input = GetCashbackProgramTransactionsInputSchema.parse({
		page: searchParams.get("page"),
		limit: searchParams.get("limit"),
		search: searchParams.get("search"),
		clientId: searchParams.get("clientId"),
		operatorSellerIds: searchParams.get("operatorSellerIds"),
		types: searchParams.get("types"),
		periodAfter: searchParams.get("periodAfter"),
		periodBefore: searchParams.get("periodBefore"),
	});
	// Saldo/extrato de um cliente é leitura operacional (PDV, ficha do cliente); a listagem da base é o módulo.
	if (!input.clientId && !canViewCashback(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para visualizar o programa de cashback.");
	const result = await getCashbackProgramTransactions({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const GET = appApiHandler({ GET: getCashbackProgramTransactionsRoute });
