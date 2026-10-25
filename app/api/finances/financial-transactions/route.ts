import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { TAuthUserSession } from "@/lib/authentication/types";
import { canEditFinances, canViewFinances } from "@/lib/permissions/finances";
import { db } from "@/services/drizzle";
import { accountingEntries, files, financialTransactions } from "@/services/drizzle/schema";
import { and, count, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";
import { FinancialTransactionSchema } from "@/schemas/financial";
import {
	AccountingEntryOriginTypeEnum,
	FinancialTransactionTypeEnum,
	PaymentMethodEnum,
	TAccountingEntryOriginTypeEnum,
	TFinancialTransactionTypeEnum,
	TPaymentMethodEnum,
} from "@/schemas/enums";

const VALID_STATUSES = ["pendente", "efetivada", "em-atraso"] as const;
export type TFinancialTransactionStatus = (typeof VALID_STATUSES)[number];

const GetFinancialTransactionsInputSchema = z.object({
	id: z
		.string({
			invalid_type_error: "Tipo inválido para ID da transação.",
		})
		.optional()
		.nullable(),
	page: z.coerce.number().min(1).default(1),
	search: z.string().optional().nullable(),
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
	types: z.string().optional().nullable(),
	paymentMethods: z.string().optional().nullable(),
	statuses: z.string().optional().nullable(),
	// Origem do lançamento pai (VENDA, COMPRA, TRIBUTO_COMPRA...): é o que separa "guias a pagar" do resto.
	origins: z.string().optional().nullable(),
});
export type TGetFinancialTransactionsInput = z.infer<typeof GetFinancialTransactionsInputSchema>;

async function getFinancialTransactions({ input, session }: { input: TGetFinancialTransactionsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { id, page, search, periodAfter, periodBefore, types, paymentMethods, statuses, origins } = input;

	if (id) {
		const transaction = await db.query.financialTransactions.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, id), eq(fields.organizacaoId, userOrgId)),
			with: {
				contaFinanceira: { columns: { id: true, nome: true, tipo: true } },
				autor: { columns: { id: true, nome: true, avatarUrl: true } },
				lancamentoContabil: {
					columns: { id: true, titulo: true, valor: true, valorPrevisto: true, anotacoes: true, origemTipo: true, compraId: true, vendaId: true },
					with: { cliente: { columns: { id: true, nome: true } }, fornecedor: { columns: { id: true, nome: true } } },
				},
				documentoCobrancaArquivo: { columns: { id: true, nome: true, mimeType: true, tamanhoBytes: true } },
				comprovanteArquivo: { columns: { id: true, nome: true, mimeType: true, tamanhoBytes: true } },
			},
		});
		if (!transaction) throw new createHttpError.NotFound("Transação financeira não encontrada.");

		return {
			data: { byId: transaction, default: null },
		};
	}
	const typesArr = types ? (types.split(",").filter((v) => FinancialTransactionTypeEnum.safeParse(v).success) as TFinancialTransactionTypeEnum[]) : [];
	const paymentMethodsArr = paymentMethods
		? (paymentMethods.split(",").filter((v) => PaymentMethodEnum.safeParse(v).success) as TPaymentMethodEnum[])
		: [];
	const statusesArr = statuses
		? statuses.split(",").filter((v): v is TFinancialTransactionStatus => VALID_STATUSES.includes(v as TFinancialTransactionStatus))
		: [];
	const originsArr = origins
		? (origins.split(",").filter((v) => AccountingEntryOriginTypeEnum.safeParse(v).success) as TAccountingEntryOriginTypeEnum[])
		: [];

	const now = new Date();
	const conditions = [eq(financialTransactions.organizacaoId, userOrgId)];
	if (search && search.trim().length > 0) conditions.push(ilike(financialTransactions.titulo, `%${search.trim()}%`));
	if (periodAfter) conditions.push(gte(financialTransactions.dataPrevisao, periodAfter));
	if (periodBefore) conditions.push(lte(financialTransactions.dataPrevisao, periodBefore));
	if (typesArr.length > 0) conditions.push(inArray(financialTransactions.tipo, typesArr));
	if (paymentMethodsArr.length > 0) conditions.push(inArray(financialTransactions.metodo, paymentMethodsArr));
	if (originsArr.length > 0) {
		conditions.push(
			inArray(
				financialTransactions.lancamentoContabilId,
				db
					.select({ id: accountingEntries.id })
					.from(accountingEntries)
					.where(and(eq(accountingEntries.organizacaoId, userOrgId), inArray(accountingEntries.origemTipo, originsArr))),
			),
		);
	}

	if (statusesArr.length > 0) {
		const statusConditions: SQL<unknown>[] = [];
		if (statusesArr.includes("pendente")) {
			const c = and(isNull(financialTransactions.dataEfetivacao), gte(financialTransactions.dataPrevisao, now));
			if (c) statusConditions.push(c);
		}
		if (statusesArr.includes("efetivada")) {
			statusConditions.push(isNotNull(financialTransactions.dataEfetivacao));
		}
		if (statusesArr.includes("em-atraso")) {
			const c = and(isNull(financialTransactions.dataEfetivacao), lte(financialTransactions.dataPrevisao, now));
			if (c) statusConditions.push(c);
		}
		if (statusConditions.length > 0) {
			const orCondition = or(...statusConditions);
			if (orCondition) conditions.push(orCondition);
		}
	}

	const PAGE_SIZE = 25;
	const skip = PAGE_SIZE * (page - 1);

	const [countResult, transactionsResult] = await Promise.all([
		db
			.select({ count: count() })
			.from(financialTransactions)
			.where(and(...conditions)),
		db.query.financialTransactions.findMany({
			where: and(...conditions),
			with: {
				contaFinanceira: { columns: { id: true, nome: true, tipo: true } },
				autor: { columns: { id: true, nome: true, avatarUrl: true } },
				lancamentoContabil: { columns: { id: true, origemTipo: true, compraId: true, vendaId: true } },
			},
			orderBy: (fields, { desc }) => desc(fields.dataPrevisao),
			limit: PAGE_SIZE,
			offset: skip,
		}),
	]);

	const transactionsMatched = countResult[0]?.count ?? 0;
	const totalPages = Math.ceil(transactionsMatched / PAGE_SIZE);

	return {
		data: {
			default: {
				transactions: transactionsResult,
				transactionsMatched,
				totalPages,
			},
		},
	};
}
export type TGetFinancialTransactionsOutput = Awaited<ReturnType<typeof getFinancialTransactions>>;
export type TGetFinancialTransactionsOutputById = NonNullable<TGetFinancialTransactionsOutput["data"]["byId"]>;
export type TGetFinancialTransactionsOutputDefault = Exclude<TGetFinancialTransactionsOutput["data"]["default"], null>;

async function getFinancialTransactionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!canViewFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para acessar o módulo financeiro.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetFinancialTransactionsInputSchema.parse({
		id: searchParams.get("id") ?? undefined,
		page: searchParams.get("page") ?? 1,
		search: searchParams.get("search") ?? undefined,
		periodAfter: searchParams.get("periodAfter") ?? undefined,
		periodBefore: searchParams.get("periodBefore") ?? undefined,
		types: searchParams.get("types") ?? undefined,
		paymentMethods: searchParams.get("paymentMethods") ?? undefined,
		statuses: searchParams.get("statuses") ?? undefined,
	});
	const result = await getFinancialTransactions({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getFinancialTransactionsRoute });

const UpdateFinancialTransactionInputSchema = z.object({
	transactionId: z.string({ required_error: "ID da transação não informado." }),
	transaction: FinancialTransactionSchema.pick({
		contaFinanceiraId: true,
		metodo: true,
		dataEfetivacao: true,
		// Anexos (ADR-0002, decisão 5): o boleto/guia chega antes do pagamento; o comprovante, depois.
		// `undefined` preserva o atual; `null` desanexa.
		documentoCobrancaArquivoId: true,
		comprovanteArquivoId: true,
	}).partial({ documentoCobrancaArquivoId: true, comprovanteArquivoId: true }),
});
export type TUpdateFinancialTransactionInput = z.infer<typeof UpdateFinancialTransactionInputSchema>;

/** Confere que cada anexo informado é um arquivo da organização; `undefined` não toca a coluna. */
async function resolveTransactionAttachments({
	input,
	orgId,
}: {
	input: { documentoCobrancaArquivoId?: string | null; comprovanteArquivoId?: string | null };
	orgId: string;
}) {
	const attachments: { documentoCobrancaArquivoId?: string | null; comprovanteArquivoId?: string | null } = {};
	for (const key of ["documentoCobrancaArquivoId", "comprovanteArquivoId"] as const) {
		const value = input[key];
		if (value === undefined) continue;
		if (value) {
			const file = await db.query.files.findFirst({ where: and(eq(files.id, value), eq(files.organizacaoId, orgId)), columns: { id: true } });
			if (!file) throw new createHttpError.NotFound("Arquivo do anexo não encontrado nesta organização.");
		}
		attachments[key] = value;
	}
	return attachments;
}

async function updateFinancialTransaction({ input, orgId }: { input: TUpdateFinancialTransactionInput; orgId: string }) {
	const transaction = await db.query.financialTransactions.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.transactionId), eq(fields.organizacaoId, orgId)),
	});

	if (!transaction) throw new createHttpError.NotFound("Transação financeira não encontrada.");

	const attachments = await resolveTransactionAttachments({ input: input.transaction, orgId });
	const changesSettlement =
		input.transaction.contaFinanceiraId != null || input.transaction.metodo != null || input.transaction.dataEfetivacao != null;
	if (!changesSettlement) {
		// Só anexos: permitido antes da efetivação (a guia precisa ser guardada para ser paga).
		const [updated] = await db
			.update(financialTransactions)
			.set(attachments)
			.where(and(eq(financialTransactions.id, input.transactionId), eq(financialTransactions.organizacaoId, orgId)))
			.returning({ id: financialTransactions.id });
		if (!updated) throw new createHttpError.InternalServerError("Erro ao atualizar os anexos da transação financeira.");
		return { data: { id: updated.id }, message: "Anexos da transação atualizados com sucesso." };
	}
	if (!transaction.dataEfetivacao) {
		throw new createHttpError.BadRequest("Transação ainda não efetivada. Efetive antes de ajustar os dados.");
	}

	if (input.transaction.contaFinanceiraId) {
		const account = await db.query.financialAccounts.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.transaction.contaFinanceiraId!), eq(fields.organizacaoId, orgId)),
			columns: { id: true },
		});

		if (!account) throw new createHttpError.NotFound("Conta financeira não encontrada para esta organização.");
	}

	const dataEfetivacao = input.transaction.dataEfetivacao ? new Date(input.transaction.dataEfetivacao) : transaction.dataEfetivacao;
	if (!dataEfetivacao) throw new createHttpError.BadRequest("Data de efetivação não informada.");

	const [updated] = await db
		.update(financialTransactions)
		.set({
			dataEfetivacao,
			contaFinanceiraId: input.transaction.contaFinanceiraId ?? transaction.contaFinanceiraId,
			metodo: input.transaction.metodo ?? transaction.metodo,
			...attachments,
		})
		.where(and(eq(financialTransactions.id, input.transactionId), eq(financialTransactions.organizacaoId, orgId)))
		.returning({ id: financialTransactions.id });

	if (!updated) throw new createHttpError.InternalServerError("Não foi possível atualizar a transação.");

	return {
		data: {
			transactionId: updated.id,
		},
		message: "Transação atualizada com sucesso.",
	};
}
export type TUpdateFinancialTransactionOutput = Awaited<ReturnType<typeof updateFinancialTransaction>>;

async function updateFinancialTransactionRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canEditFinances(session.membership.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para editar lançamentos financeiros.");

	const body = await request.json();
	const input = UpdateFinancialTransactionInputSchema.parse(body);
	const result = await updateFinancialTransaction({ input, orgId: session.membership.organizacao.id });
	return NextResponse.json(result);
}

export const PUT = appApiHandler({ PUT: updateFinancialTransactionRoute });
