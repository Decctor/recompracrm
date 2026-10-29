import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import {
	calculateFinancialAccountBalance,
	getLegacyBankFields,
	getDefaultFinancialAccountReceipts,
	isCashLikeFinancialAccountType,
} from "@/lib/finances/financial-account-configuration";
import { canCreateFinances, canEditFinances, canViewFinances } from "@/lib/permissions/finances";
import { FinancialAccountSchema } from "@/schemas/financial";
import { db, type DBTransaction } from "@/services/drizzle";
import { accountsCharts, financialAccounts, financialTransactions } from "@/services/drizzle/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetFinancialAccountsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo não válido para o ID da conta financeira." }).optional().nullable(),
	stats: z
		.string({ invalid_type_error: "Tipo não válido para estatísticas." })
		.optional()
		.default("false")
		.transform((val) => val === "true"),
	activeOnly: z
		.string({ invalid_type_error: "Tipo não válido para o filtro de contas ativas." })
		.optional()
		.default("true")
		.transform((val) => val === "true"),
	statsPeriodBefore: z
		.string({ invalid_type_error: "Tipo não válido para a data final das estatísticas." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
	statsPeriodAfter: z
		.string({ invalid_type_error: "Tipo não válido para a data inicial das estatísticas." })
		.optional()
		.nullable()
		.transform((val) => (val ? new Date(val) : null)),
});
export type TGetFinancialAccountsInput = z.infer<typeof GetFinancialAccountsInputSchema>;

const FinancialAccountMutationSchema = FinancialAccountSchema.omit({
	organizacaoId: true,
	dataInsercao: true,
	chaveSistema: true,
	codigoBanco: true,
	nomeBanco: true,
	agencia: true,
	numeroConta: true,
	digitoConta: true,
	tipoConta: true,
});

const CreateFinancialAccountInputSchema = z.object({
	financialAccount: FinancialAccountMutationSchema,
});
export type TCreateFinancialAccountInput = z.infer<typeof CreateFinancialAccountInputSchema>;

const UpdateFinancialAccountInputSchema = z.object({
	financialAccountId: z.string({
		required_error: "ID da conta financeira não informado.",
		invalid_type_error: "Tipo não válido para o ID da conta financeira.",
	}),
	financialAccount: FinancialAccountMutationSchema,
});
export type TUpdateFinancialAccountInput = z.infer<typeof UpdateFinancialAccountInputSchema>;

type AccountStats = {
	saldoAtual: number;
	totalEntradas: number;
	totalSaidas: number;
};

function getAccountBalance(accountType: string, saldoInicial: number, transactions: Array<{ tipo: "ENTRADA" | "SAIDA"; valor: number }>) {
	const tipo = accountType as Parameters<typeof isCashLikeFinancialAccountType>[0];
	return calculateFinancialAccountBalance({
		tipo,
		saldoInicial,
		totalEntradas: transactions.filter((transaction) => transaction.tipo === "ENTRADA").reduce((sum, transaction) => sum + transaction.valor, 0),
		totalSaidas: transactions.filter((transaction) => transaction.tipo === "SAIDA").reduce((sum, transaction) => sum + transaction.valor, 0),
	});
}

async function getFinancialAccountById({ accountId, orgId }: { accountId: string; orgId: string }) {
	return db.query.financialAccounts.findFirst({
		where: and(eq(financialAccounts.id, accountId), eq(financialAccounts.organizacaoId, orgId)),
		with: {
			contaContabil: { columns: { id: true, nome: true, codigo: true } },
		},
	});
}

async function assertFinancialAccountRelations({
	tx,
	orgId,
	financialAccount,
}: {
	tx: DBTransaction;
	orgId: string;
	financialAccount: TCreateFinancialAccountInput["financialAccount"];
}) {
	if (financialAccount.tipo !== financialAccount.configuracao.categoria) {
		throw new createHttpError.BadRequest("O tipo da conta financeira deve corresponder à categoria da configuração.");
	}

	if (financialAccount.contaContabilId) {
		const accountChart = await tx.query.accountsCharts.findFirst({
			where: and(eq(accountsCharts.id, financialAccount.contaContabilId), eq(accountsCharts.organizacaoId, orgId)),
			columns: { id: true },
		});
		if (!accountChart) throw new createHttpError.NotFound("Conta contábil não encontrada.");
	}

	if (financialAccount.configuracao.categoria !== "CARTAO_CREDITO" || !financialAccount.configuracao.contaPagamentoPadraoId) return;

	const paymentAccount = await tx.query.financialAccounts.findFirst({
		where: and(
			eq(financialAccounts.id, financialAccount.configuracao.contaPagamentoPadraoId),
			eq(financialAccounts.organizacaoId, orgId),
			eq(financialAccounts.ativo, true),
			inArray(financialAccounts.tipo, ["CAIXA", "BANCO", "CARTEIRA_DIGITAL"]),
		),
		columns: { id: true },
	});
	if (!paymentAccount) throw new createHttpError.BadRequest("A conta de pagamento padrão precisa ser uma conta ativa de caixa.");
}

function getFinancialAccountValues(financialAccount: TCreateFinancialAccountInput["financialAccount"], previousReceipts?: TCreateFinancialAccountInput["financialAccount"]["configuracao"]["recebimentos"]) {
	return {
		nome: financialAccount.nome,
		descricao: financialAccount.descricao ?? null,
		tipo: financialAccount.tipo,
		moeda: financialAccount.moeda,
		ativo: financialAccount.ativo,
		contaContabilId: financialAccount.contaContabilId ?? null,
		saldoInicial: financialAccount.saldoInicial,
		dataSaldoInicial: financialAccount.dataSaldoInicial,
		configuracao: { ...financialAccount.configuracao, recebimentos: financialAccount.configuracao.recebimentos ?? previousReceipts ?? getDefaultFinancialAccountReceipts() },
		...getLegacyBankFields(financialAccount.configuracao),
	};
}

async function getFinancialAccounts({ input, session }: { input: TGetFinancialAccountsInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	if (input.id) {
		const account = await getFinancialAccountById({ accountId: input.id, orgId });
		if (!account) throw new createHttpError.NotFound("Conta financeira não encontrada.");
		return { data: { byId: account, default: null }, message: "Conta financeira encontrada com sucesso." };
	}

	const conditions = [eq(financialAccounts.organizacaoId, orgId)];
	if (input.activeOnly) conditions.push(eq(financialAccounts.ativo, true));

	const accountsResult = await db.query.financialAccounts.findMany({
		where: and(...conditions),
		with: {
			contaContabil: { columns: { id: true, nome: true, codigo: true } },
		},
		orderBy: (fields, { asc }) => asc(fields.nome),
	});

	let statsMap: Record<string, AccountStats> = {};
	if (input.stats && accountsResult.length > 0) {
		const accountIds = accountsResult.map((account) => account.id);
		const allTransactions = await db
			.select({
				contaFinanceiraId: financialTransactions.contaFinanceiraId,
				tipo: financialTransactions.tipo,
				valor: financialTransactions.valor,
				dataEfetivacao: financialTransactions.dataEfetivacao,
			})
			.from(financialTransactions)
			.where(
				and(
					eq(financialTransactions.organizacaoId, orgId),
					isNotNull(financialTransactions.dataEfetivacao),
					inArray(financialTransactions.contaFinanceiraId, accountIds),
				),
			);
		const transactionsByAccount = new Map<string, typeof allTransactions>();
		for (const transaction of allTransactions) {
			if (!transaction.contaFinanceiraId) continue;
			const accountTransactions = transactionsByAccount.get(transaction.contaFinanceiraId);
			if (accountTransactions) accountTransactions.push(transaction);
			else transactionsByAccount.set(transaction.contaFinanceiraId, [transaction]);
		}

		for (const account of accountsResult) {
			const accountTxs = transactionsByAccount.get(account.id) ?? [];
			const balanceTxs = [];
			const initialBalanceDate = new Date(account.dataSaldoInicial);
			let totalEntradas = 0;
			let totalSaidas = 0;
			for (const transaction of accountTxs) {
				const date = new Date(transaction.dataEfetivacao!);
				if (date >= initialBalanceDate) balanceTxs.push(transaction);
				if ((!input.statsPeriodAfter || date >= input.statsPeriodAfter) && (!input.statsPeriodBefore || date <= input.statsPeriodBefore)) {
					if (transaction.tipo === "ENTRADA") totalEntradas += transaction.valor;
					else totalSaidas += transaction.valor;
				}
			}
			const saldoAtual = getAccountBalance(account.tipo, account.saldoInicial, balanceTxs);
			statsMap[account.id] = {
				saldoAtual,
				totalEntradas,
				totalSaidas,
			};
		}
	}

	return {
		data: {
			byId: null,
			default: {
				accounts: accountsResult.map((account) => ({ ...account, estatisticas: statsMap[account.id] ?? null })),
			},
		},
		message: "Contas financeiras encontradas com sucesso.",
	};
}
export type TGetFinancialAccountsOutput = Awaited<ReturnType<typeof getFinancialAccounts>>;
export type TGetFinancialAccountsOutputDefault = Exclude<TGetFinancialAccountsOutput["data"]["default"], null>;
export type TGetFinancialAccountsOutputById = Exclude<TGetFinancialAccountsOutput["data"]["byId"], null>;

async function createFinancialAccount({ input, session }: { input: TCreateFinancialAccountInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (!canCreateFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para criar contas financeiras.");

	const [created] = await db.transaction(async (tx) => {
		await assertFinancialAccountRelations({ tx, orgId, financialAccount: input.financialAccount });
		return tx
			.insert(financialAccounts)
			.values({ organizacaoId: orgId, ...getFinancialAccountValues(input.financialAccount) })
			.returning({ id: financialAccounts.id });
	});
	if (!created) throw new createHttpError.InternalServerError("Não foi possível criar a conta financeira.");
	return { data: { id: created.id }, message: "Conta financeira criada com sucesso." };
}
export type TCreateFinancialAccountOutput = Awaited<ReturnType<typeof createFinancialAccount>>;

async function updateFinancialAccount({ input, session }: { input: TUpdateFinancialAccountInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (!canEditFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para editar contas financeiras.");

	const existing = await db.query.financialAccounts.findFirst({
		where: and(eq(financialAccounts.id, input.financialAccountId), eq(financialAccounts.organizacaoId, orgId)),
		columns: { id: true, chaveSistema: true, tipo: true, ativo: true, configuracao: true },
	});
	if (!existing) throw new createHttpError.NotFound("Conta financeira não encontrada.");
	if (existing.chaveSistema && (existing.tipo !== input.financialAccount.tipo || !input.financialAccount.ativo)) {
		throw new createHttpError.BadRequest("Contas financeiras gerenciadas pelo sistema não podem ter seu tipo ou status alterados.");
	}

	if (existing.chaveSistema && input.financialAccount.configuracao.recebimentos && JSON.stringify(input.financialAccount.configuracao.recebimentos) !== JSON.stringify(existing.configuracao.recebimentos)) {
		throw new createHttpError.BadRequest("Os recebimentos de contas gerenciadas pelo sistema não podem ser alterados.");
	}

	await db.transaction(async (tx) => {
		await assertFinancialAccountRelations({ tx, orgId, financialAccount: input.financialAccount });
		await tx
			.update(financialAccounts)
			.set(getFinancialAccountValues(input.financialAccount, existing.configuracao.recebimentos ?? getDefaultFinancialAccountReceipts("TRANSACOES_PARCELADAS")))
			.where(and(eq(financialAccounts.id, input.financialAccountId), eq(financialAccounts.organizacaoId, orgId)));
	});

	return { data: { id: input.financialAccountId }, message: "Conta financeira atualizada com sucesso." };
}
export type TUpdateFinancialAccountOutput = Awaited<ReturnType<typeof updateFinancialAccount>>;

async function getFinancialAccountsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	if (!canViewFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para acessar o módulo financeiro.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetFinancialAccountsInputSchema.parse({
		id: searchParams.get("id"),
		activeOnly: searchParams.get("activeOnly") ?? "true",
		stats: searchParams.get("stats") ?? "false",
		statsPeriodAfter: searchParams.get("statsPeriodAfter"),
		statsPeriodBefore: searchParams.get("statsPeriodBefore"),
	});
	return NextResponse.json(await getFinancialAccounts({ input, session }));
}

async function createFinancialAccountRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = CreateFinancialAccountInputSchema.parse(await request.json());
	return NextResponse.json(await createFinancialAccount({ input, session }), { status: 201 });
}

async function updateFinancialAccountRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = UpdateFinancialAccountInputSchema.parse(await request.json());
	return NextResponse.json(await updateFinancialAccount({ input, session }));
}

export const GET = appApiHandler({ GET: getFinancialAccountsRoute });
export const POST = appApiHandler({ POST: createFinancialAccountRoute });
export const PUT = appApiHandler({ PUT: updateFinancialAccountRoute });
