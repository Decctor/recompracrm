import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { PeriodQueryParamSchema } from "@/schemas/query-params-utils";
import { db } from "@/services/drizzle";
import { cashbackProgramTransactions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const CashbackProgramTransactionsInputSchema = z.object({
	period: PeriodQueryParamSchema.optional(),
	page: z.number().int().positive().default(1),
	limit: z.number().int().positive().default(10),
	clientId: z
		.string({
			required_error: "ID do cliente não informado.",
			invalid_type_error: "Tipo não válido para ID do cliente.",
		})
		.optional()
		.nullable(),
	type: z.enum(["ACÚMULO", "RESGATE", "EXPIRAÇÃO"]).optional(),
});
export type TCashbackProgramTransactionsInput = z.infer<typeof CashbackProgramTransactionsInputSchema>;

type TTransaction = {
	id: string;
	tipo: "ACÚMULO" | "RESGATE" | "EXPIRAÇÃO" | "CANCELAMENTO";
	status: "ATIVO" | "CONSUMIDO" | "EXPIRADO";
	valor: number;
	saldoValorPosterior: number;
	dataInsercao: Date;
	expiracaoData: Date | null;
	cliente: {
		id: string;
		nome: string;
	};
	venda: {
		id: string;
		valorTotal: number;
		canal: string | null;
		entregaModalidade: string | null;
		vendedor: {
			id: string;
			nome: string;
		} | null;
		parceiro: {
			id: string;
			nome: string;
		} | null;
	} | null;
};

type TTransactionsResult = {
	transactions: TTransaction[];
	transactionsMatched: number;
	totalPages: number;
};

type GetResponse = {
	data: {
		default: TTransactionsResult | null;
		byClientId: TTransactionsResult | null;
	};
};

async function getCashbackProgramTransactions({
	input,
	session,
}: {
	input: TCashbackProgramTransactionsInput;
	session: TAuthUserSession;
}): Promise<GetResponse> {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const conditions = [eq(cashbackProgramTransactions.organizacaoId, userOrgId)];

	// Apply period filter if provided
	if (input.period) {
		const ajustedAfter = dayjs(input.period.after).toDate();
		const ajustedBefore = dayjs(input.period.before).endOf("day").toDate();
		conditions.push(gte(cashbackProgramTransactions.dataInsercao, ajustedAfter));
		conditions.push(lte(cashbackProgramTransactions.dataInsercao, ajustedBefore));
	}

	if (input.type) {
		conditions.push(eq(cashbackProgramTransactions.tipo, input.type));
	}

	if (input.clientId) {
		conditions.push(eq(cashbackProgramTransactions.clienteId, input.clientId));
	}

	// Get total count
	const totalCountResult = await db
		.select({ count: count() })
		.from(cashbackProgramTransactions)
		.where(and(...conditions));

	const total = totalCountResult[0]?.count || 0;
	const totalPages = Math.ceil(total / input.limit);

	// Get paginated transactions
	const offset = (input.page - 1) * input.limit;
	const transactions = await db.query.cashbackProgramTransactions.findMany({
		where: and(...conditions),
		orderBy: [desc(cashbackProgramTransactions.dataInsercao)],
		limit: input.limit,
		offset: offset,
		with: {
			cliente: {
				columns: {
					id: true,
					nome: true,
				},
			},
			venda: {
				columns: {
					id: true,
					valorTotal:true,
					canal:true, 
					entregaModalidade:true,
				},
				with: {
					vendedor: {
						columns: {
							id:true,
							nome:true,
						}
					},
					parceiro: {
						columns: {
							id:true,
							nome:true,
						}
					}
				}
			},
		},
	});

	const payload: TTransactionsResult = {
		transactions: transactions.map((t) => ({
			id: t.id,
			tipo: t.tipo,
			status: t.status,
			valor: t.valor,
			saldoValorPosterior: t.saldoValorPosterior,
			dataInsercao: t.dataInsercao,
			expiracaoData: t.expiracaoData,
			cliente: {
				id: t.cliente.id,
				nome: t.cliente.nome,
			},
			venda: t.venda
				? {
						id: t.venda.id,
						valorTotal: Number(t.venda.valorTotal),
						canal: t.venda.canal,
						entregaModalidade: t.venda.entregaModalidade,
						vendedor: t.venda.vendedor
							? {
									id: t.venda.vendedor.id,
									nome: t.venda.vendedor.nome,
							  }
							: null,
						parceiro: t.venda.parceiro
							? {
									id: t.venda.parceiro.id,
									nome: t.venda.parceiro.nome,
							  }
							: null,
				  }
				: null,
		})),
		transactionsMatched: total,
		totalPages,
	};

	if (input.clientId) {
		return {
			data: {
				default: null,
				byClientId: payload,
			},
		};
	}

	return {
		data: {
			default: payload,
			byClientId: null,
		},
	};
}

export type TCashbackProgramTransactionsOutput = Awaited<ReturnType<typeof getCashbackProgramTransactions>>;
export type TCashbackProgramTransactionsOutputDefault = NonNullable<TCashbackProgramTransactionsOutput["data"]["default"]>;
export type TCashbackProgramTransactionsOutputByClientId = NonNullable<TCashbackProgramTransactionsOutput["data"]["byClientId"]>;

const getCashbackProgramTransactionsRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const payload = await request.json();
	const input = CashbackProgramTransactionsInputSchema.parse(payload);
	const result = await getCashbackProgramTransactions({ input, session });
	return NextResponse.json(result, { status: 200 });
};

export const POST = appApiHandler({
	POST: getCashbackProgramTransactionsRoute,
});
