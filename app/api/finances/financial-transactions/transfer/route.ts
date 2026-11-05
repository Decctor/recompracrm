import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { canCreateFinances } from "@/lib/permissions/finances";
import { db } from "@/services/drizzle";
import { writeDefaultAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";
import { normalizeFinancialTransactionValue } from "@/lib/finances/financial-transaction-value";
import { accountingEntries, accountsCharts, financialAccounts, financialTransactions } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CreateFinancialTransferInputSchema = z.object({
	transfer: z.object({
		titulo: z
			.string({
				required_error: "Título da transferência não informado.",
				invalid_type_error: "Tipo inválido para o título da transferência.",
			})
			.trim()
			.min(1, { message: "Título da transferência não informado." }),
		anotacoes: z.string({ invalid_type_error: "Tipo inválido para as anotações da transferência." }).optional().nullable(),
		contaFinanceiraOrigemId: z.string({
			required_error: "Conta financeira de origem não informada.",
			invalid_type_error: "Tipo inválido para a conta financeira de origem.",
		}),
		contaFinanceiraDestinoId: z.string({
			required_error: "Conta financeira de destino não informada.",
			invalid_type_error: "Tipo inválido para a conta financeira de destino.",
		}),
		valor: z
			.number({
				required_error: "Valor da transferência não informado.",
				invalid_type_error: "Tipo inválido para o valor da transferência.",
			})
			.positive({ message: "O valor da transferência precisa ser maior que zero." }),
		dataEfetivacao: z
			.string({
				required_error: "Data da transferência não informada.",
				invalid_type_error: "Tipo inválido para a data da transferência.",
			})
			.datetime({ message: "Tipo inválido para a data da transferência." })
			.transform((value) => new Date(value)),
	}),
});
export type TCreateFinancialTransferInput = z.infer<typeof CreateFinancialTransferInputSchema>;

async function resolveTransferAccountingAccountIds({ orgId }: { orgId: string }): Promise<{ debitAccountId: string; creditAccountId: string }> {
	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
		columns: { configuracao: true },
	});
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const transferDefaults = organization.configuracao.defaults.contabilidade.lancamentosPadrao.transferencias;
	let debitAccountId = transferDefaults?.debitoContaId ?? null;
	let creditAccountId = transferDefaults?.creditoContaId ?? null;

	// Existing organizations may predate transfer defaults. Keep the compact
	// onboarding model by resolving the standard Caixa e Bancos account.
	if (!debitAccountId || !creditAccountId) {
		const caixaBancos = await db.query.accountsCharts.findFirst({
			where: and(eq(accountsCharts.organizacaoId, orgId), eq(accountsCharts.codigo, "1.1")),
			columns: { id: true },
		});
		debitAccountId ??= caixaBancos?.id ?? null;
		creditAccountId ??= caixaBancos?.id ?? null;
	}

	if (!debitAccountId || !creditAccountId) {
		throw new createHttpError.BadRequest("A organização não possui contas contábeis padrão para transferências.");
	}

	const accountIds = debitAccountId === creditAccountId ? [debitAccountId] : [debitAccountId, creditAccountId];
	const accountingAccounts = await Promise.all(
		accountIds.map((accountId) =>
			db.query.accountsCharts.findFirst({
				where: and(eq(accountsCharts.id, accountId), eq(accountsCharts.organizacaoId, orgId)),
				columns: { id: true },
			}),
		),
	);
	if (accountingAccounts.some((account) => !account)) {
		throw new createHttpError.BadRequest("As contas contábeis padrão para transferências não são válidas.");
	}

	return { debitAccountId, creditAccountId };
}

async function createFinancialTransfer({ input, session }: { input: TCreateFinancialTransferInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const { transfer } = input;
	if (transfer.contaFinanceiraOrigemId === transfer.contaFinanceiraDestinoId) {
		throw new createHttpError.BadRequest("As contas financeiras de origem e destino precisam ser diferentes.");
	}

	const [sourceAccount, destinationAccount, accountingAccountIds] = await Promise.all([
		db.query.financialAccounts.findFirst({
			where: and(
				eq(financialAccounts.id, transfer.contaFinanceiraOrigemId),
				eq(financialAccounts.organizacaoId, orgId),
				eq(financialAccounts.ativo, true),
			),
			columns: { id: true },
		}),
		db.query.financialAccounts.findFirst({
			where: and(
				eq(financialAccounts.id, transfer.contaFinanceiraDestinoId),
				eq(financialAccounts.organizacaoId, orgId),
				eq(financialAccounts.ativo, true),
			),
			columns: { id: true },
		}),
		resolveTransferAccountingAccountIds({ orgId }),
	]);

	if (!sourceAccount) throw new createHttpError.NotFound("Conta financeira de origem não encontrada ou inativa.");
	if (!destinationAccount) throw new createHttpError.NotFound("Conta financeira de destino não encontrada ou inativa.");

	const result = await db.transaction(async (tx) => {
		const [entry] = await tx
			.insert(accountingEntries)
			.values({
				organizacaoId: orgId,
				origemTipo: "TRANSFERENCIA",
				titulo: transfer.titulo,
				anotacoes: transfer.anotacoes ?? null,
				idContaDebito: accountingAccountIds.debitAccountId,
				idContaCredito: accountingAccountIds.creditAccountId,
				valor: transfer.valor,
				valorPrevisto: transfer.valor,
				dataCompetencia: transfer.dataEfetivacao,
				autorId: session.user.id,
			})
			.returning({ id: accountingEntries.id });
		if (!entry) throw new createHttpError.InternalServerError("Erro ao criar lançamento contábil da transferência.");
		await writeDefaultAccountingEntryLines({
			trx: tx,
			organizationId: orgId,
			accountingEntryId: entry.id,
			entryValue: transfer.valor,
			expectedValue: transfer.valor,
			debitAccountId: accountingAccountIds.debitAccountId,
			creditAccountId: accountingAccountIds.creditAccountId,
		});

		const transactions = await tx
			.insert(financialTransactions)
			.values([
				{
					organizacaoId: orgId,
					lancamentoContabilId: entry.id,
					contaFinanceiraId: sourceAccount.id,
					titulo: `${transfer.titulo} - saída`,
					tipo: "SAIDA",
					...normalizeFinancialTransactionValue({ valor: transfer.valor }),
					metodo: "TRANSFERENCIA",
					dataPrevisao: transfer.dataEfetivacao,
					dataEfetivacao: transfer.dataEfetivacao,
					efetivacaoAutorId: session.user.id,
					efetivacaoOrigem: "IMEDIATA",
					autorId: session.user.id,
				},
				{
					organizacaoId: orgId,
					lancamentoContabilId: entry.id,
					contaFinanceiraId: destinationAccount.id,
					titulo: `${transfer.titulo} - entrada`,
					tipo: "ENTRADA",
					...normalizeFinancialTransactionValue({ valor: transfer.valor }),
					metodo: "TRANSFERENCIA",
					dataPrevisao: transfer.dataEfetivacao,
					dataEfetivacao: transfer.dataEfetivacao,
					efetivacaoAutorId: session.user.id,
					efetivacaoOrigem: "IMEDIATA",
					autorId: session.user.id,
				},
			])
			.returning({ id: financialTransactions.id });

		return {
			entryId: entry.id,
			transactionIds: transactions.map((transaction) => transaction.id),
		};
	});

	return {
		data: result,
		message: "Transferência financeira criada com sucesso.",
	};
}
export type TCreateFinancialTransferOutput = Awaited<ReturnType<typeof createFinancialTransfer>>;

async function createFinancialTransferRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!canCreateFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para criar lançamentos financeiros.");
	const input = CreateFinancialTransferInputSchema.parse(await request.json());
	const result = await createFinancialTransfer({ input, session });
	return NextResponse.json(result, { status: 201 });
}

export const POST = appApiHandler({ POST: createFinancialTransferRoute });
