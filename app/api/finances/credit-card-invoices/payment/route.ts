import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { canCreateFinances } from "@/lib/permissions/finances";
import { deriveCreditCardInvoice, getCreditCardInvoiceDateKey, type TCreditCardInvoiceTransaction } from "@/lib/finances/credit-card-invoice";
import { isCashLikeFinancialAccountType } from "@/lib/finances/financial-account-configuration";
import { writeDefaultAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";
import { normalizeFinancialTransactionValue } from "@/lib/finances/financial-transaction-value";
import { db } from "@/services/drizzle";
import { accountingEntries, accountsCharts, financialAccounts, financialTransactions } from "@/services/drizzle/schema";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import createHttpError from "http-errors";
import dayjs from "dayjs";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CreateCreditCardPaymentInputSchema = z.object({
	payment: z.object({
		titulo: z
			.string({ required_error: "Título do pagamento não informado.", invalid_type_error: "Tipo inválido para o título do pagamento." })
			.trim()
			.min(1),
		anotacoes: z.string({ invalid_type_error: "Tipo inválido para as anotações do pagamento." }).optional().nullable(),
		contaCartaoId: z.string({ required_error: "Conta do cartão não informada.", invalid_type_error: "Tipo inválido para a conta do cartão." }),
		contaFinanceiraOrigemId: z.string({ invalid_type_error: "Tipo inválido para a conta de origem." }).optional().nullable(),
		valor: z.number({ required_error: "Valor do pagamento não informado.", invalid_type_error: "Tipo inválido para o valor do pagamento." }).positive(),
		dataVencimento: z
			.string({
				required_error: "Data de vencimento da fatura não informada.",
				invalid_type_error: "Tipo inválido para a data de vencimento da fatura.",
			})
			.datetime({ message: "Tipo inválido para a data de vencimento da fatura." })
			.transform((value) => new Date(value)),
		dataEfetivacao: z
			.string({ required_error: "Data do pagamento não informada.", invalid_type_error: "Tipo inválido para a data do pagamento." })
			.datetime({ message: "Tipo inválido para a data do pagamento." })
			.transform((value) => new Date(value)),
		idempotencyKey: z.string({ invalid_type_error: "Tipo inválido para a chave de idempotência." }).trim().min(8).max(120).optional().nullable(),
	}),
});
export type TCreateCreditCardPaymentInput = z.infer<typeof CreateCreditCardPaymentInputSchema>;

async function getExistingPayment({ orgId, idempotencyKey }: { orgId: string; idempotencyKey: string }) {
	return db.query.accountingEntries.findFirst({
		where: and(
			eq(accountingEntries.organizacaoId, orgId),
			eq(accountingEntries.chaveIdempotencia, idempotencyKey),
			eq(accountingEntries.origemTipo, "PAGAMENTO_CARTAO"),
		),
		columns: { id: true },
		with: { transacoesFinanceiras: { columns: { id: true } } },
	});
}

async function getCardInvoiceTransactions({ orgId, cardAccountId, dueDate }: { orgId: string; cardAccountId: string; dueDate: Date }) {
	const start = dayjs(dueDate).startOf("day").toDate();
	const end = dayjs(dueDate).add(1, "day").startOf("day").toDate();
	return db
		.select({
			id: financialTransactions.id,
			contaFinanceiraId: financialTransactions.contaFinanceiraId,
			titulo: financialTransactions.titulo,
			tipo: financialTransactions.tipo,
			valor: financialTransactions.valor,
			valorBase: financialTransactions.valorBase,
			valorJuros: financialTransactions.valorJuros,
			valorMulta: financialTransactions.valorMulta,
			valorTaxas: financialTransactions.valorTaxas,
			valorDesconto: financialTransactions.valorDesconto,
			metodo: financialTransactions.metodo,
			dataPrevisao: financialTransactions.dataPrevisao,
			dataEfetivacao: financialTransactions.dataEfetivacao,
			parcela: financialTransactions.parcela,
			totalParcelas: financialTransactions.totalParcelas,
			provedorStatus: financialTransactions.provedorStatus,
			lancamentoContabilId: financialTransactions.lancamentoContabilId,
			origemTipo: accountingEntries.origemTipo,
		})
		.from(financialTransactions)
		.innerJoin(accountingEntries, eq(accountingEntries.id, financialTransactions.lancamentoContabilId))
		.where(
			and(
				eq(financialTransactions.organizacaoId, orgId),
				eq(financialTransactions.contaFinanceiraId, cardAccountId),
				gte(financialTransactions.dataPrevisao, start),
				lte(financialTransactions.dataPrevisao, end),
			),
		);
}

async function createCreditCardPayment({ input, session }: { input: TCreateCreditCardPaymentInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	const payment = input.payment;

	if (payment.idempotencyKey) {
		const existing = await getExistingPayment({ orgId, idempotencyKey: payment.idempotencyKey });
		if (existing)
			return {
				data: {
					entryId: existing.id,
					transactionIds: existing.transacoesFinanceiras.map((transaction) => transaction.id),
					idempotencyKey: payment.idempotencyKey,
				},
				message: "Pagamento de cartão já registrado.",
			};
	}

	const cardAccount = await db.query.financialAccounts.findFirst({
		where: and(eq(financialAccounts.id, payment.contaCartaoId), eq(financialAccounts.organizacaoId, orgId), eq(financialAccounts.ativo, true)),
		columns: { id: true, nome: true, tipo: true, configuracao: true, contaContabilId: true },
	});
	if (!cardAccount || cardAccount.tipo !== "CARTAO_CREDITO" || cardAccount.configuracao.categoria !== "CARTAO_CREDITO")
		throw new createHttpError.BadRequest("A conta de destino precisa ser um cartão de crédito ativo.");

	const sourceAccountId = payment.contaFinanceiraOrigemId ?? cardAccount.configuracao.contaPagamentoPadraoId;
	if (!sourceAccountId) throw new createHttpError.BadRequest("Informe a conta financeira que realizará o pagamento da fatura.");
	const sourceAccount = await db.query.financialAccounts.findFirst({
		where: and(eq(financialAccounts.id, sourceAccountId), eq(financialAccounts.organizacaoId, orgId), eq(financialAccounts.ativo, true)),
		columns: { id: true, nome: true, tipo: true, contaContabilId: true },
	});
	if (!sourceAccount || !isCashLikeFinancialAccountType(sourceAccount.tipo))
		throw new createHttpError.BadRequest("A conta de origem precisa ser caixa, banco ou carteira digital ativa.");
	if (!cardAccount.contaContabilId || !sourceAccount.contaContabilId)
		throw new createHttpError.BadRequest("As contas do cartão e de origem precisam estar vinculadas ao plano de contas.");
	if (cardAccount.contaContabilId === sourceAccount.contaContabilId)
		throw new createHttpError.BadRequest("As contas contábeis do cartão e da origem precisam ser diferentes.");
	const accountingCharts = await db.query.accountsCharts.findMany({
		where: and(eq(accountsCharts.organizacaoId, orgId), inArray(accountsCharts.id, [cardAccount.contaContabilId, sourceAccount.contaContabilId])),
		columns: { id: true, natureza: true },
	});
	const chartById = new Map(accountingCharts.map((chart) => [chart.id, chart]));
	if (chartById.get(cardAccount.contaContabilId)?.natureza !== "PASSIVO")
		throw new createHttpError.BadRequest("A conta contábil do cartão precisa ter natureza PASSIVO.");
	if (chartById.get(sourceAccount.contaContabilId)?.natureza !== "ATIVO")
		throw new createHttpError.BadRequest("A conta contábil da origem precisa ter natureza ATIVO.");

	const invoiceRows = await getCardInvoiceTransactions({ orgId, cardAccountId: cardAccount.id, dueDate: payment.dataVencimento });
	const invoice = deriveCreditCardInvoice({
		contaFinanceiraId: cardAccount.id,
		dataVencimento: payment.dataVencimento,
		transactions: invoiceRows as TCreditCardInvoiceTransaction[],
	});
	if (payment.valor - invoice.saldoAberto > 0.02)
		throw new createHttpError.BadRequest(`O pagamento não pode exceder o saldo em aberto da fatura (${invoice.saldoAberto.toFixed(2)}).`);
	if (invoice.saldoAberto <= 0.02) throw new createHttpError.BadRequest("Esta fatura não possui saldo em aberto.");

	const idempotencyKey = payment.idempotencyKey ?? null;
	const transactionValue = normalizeFinancialTransactionValue({ valor: payment.valor });
	const result = await db.transaction(async (tx) => {
		const [entry] = await tx
			.insert(accountingEntries)
			.values({
				organizacaoId: orgId,
				origemTipo: "PAGAMENTO_CARTAO",
				titulo: payment.titulo,
				anotacoes: payment.anotacoes ?? null,
				idContaDebito: cardAccount.contaContabilId!,
				idContaCredito: sourceAccount.contaContabilId!,
				valor: payment.valor,
				valorPrevisto: payment.valor,
				dataCompetencia: payment.dataEfetivacao,
				chaveIdempotencia: idempotencyKey,
				autorId: session.user.id,
			})
			.onConflictDoNothing({ target: [accountingEntries.organizacaoId, accountingEntries.chaveIdempotencia] })
			.returning({ id: accountingEntries.id });
		if (!entry) {
			if (!idempotencyKey) throw new createHttpError.Conflict("Não foi possível registrar o pagamento.");
			const existing = await tx.query.accountingEntries.findFirst({
				where: and(
					eq(accountingEntries.organizacaoId, orgId),
					eq(accountingEntries.chaveIdempotencia, idempotencyKey),
					eq(accountingEntries.origemTipo, "PAGAMENTO_CARTAO"),
				),
				columns: { id: true },
				with: { transacoesFinanceiras: { columns: { id: true } } },
			});
			if (!existing) throw new createHttpError.Conflict("O pagamento já foi processado por outra requisição.");
			return { entryId: existing.id, transactionIds: existing.transacoesFinanceiras.map((transaction) => transaction.id), alreadyExists: true };
		}

		await writeDefaultAccountingEntryLines({
			trx: tx,
			organizationId: orgId,
			accountingEntryId: entry.id,
			entryValue: payment.valor,
			expectedValue: payment.valor,
			debitAccountId: cardAccount.contaContabilId!,
			creditAccountId: sourceAccount.contaContabilId!,
		});

		const transactions = await tx
			.insert(financialTransactions)
			.values([
				{
					organizacaoId: orgId,
					lancamentoContabilId: entry.id,
					contaFinanceiraId: sourceAccount.id,
					titulo: `${payment.titulo} - saída`,
					tipo: "SAIDA",
					...transactionValue,
					metodo: "TRANSFERENCIA",
					dataPrevisao: payment.dataEfetivacao,
					dataEfetivacao: payment.dataEfetivacao,
					efetivacaoAutorId: session.user.id,
					efetivacaoOrigem: "IMEDIATA",
					autorId: session.user.id,
				},
				{
					organizacaoId: orgId,
					lancamentoContabilId: entry.id,
					contaFinanceiraId: cardAccount.id,
					titulo: `${payment.titulo} - fatura ${getCreditCardInvoiceDateKey(payment.dataVencimento)}`,
					tipo: "ENTRADA",
					...transactionValue,
					metodo: "TRANSFERENCIA",
					dataPrevisao: payment.dataVencimento,
					dataEfetivacao: payment.dataEfetivacao,
					efetivacaoAutorId: session.user.id,
					efetivacaoOrigem: "IMEDIATA",
					autorId: session.user.id,
				},
			])
			.returning({ id: financialTransactions.id });
		return { entryId: entry.id, transactionIds: transactions.map((transaction) => transaction.id), alreadyExists: false };
	});

	return {
		data: { ...result, idempotencyKey },
		message: result.alreadyExists ? "Pagamento de cartão já registrado." : "Pagamento de cartão registrado com sucesso.",
	};
}
export type TCreateCreditCardPaymentOutput = Awaited<ReturnType<typeof createCreditCardPayment>>;

async function createCreditCardPaymentRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!canCreateFinances(session.membership?.permissoes))
		throw new createHttpError.Forbidden("Você não possui permissão para criar lançamentos financeiros.");
	const input = CreateCreditCardPaymentInputSchema.parse(await request.json());
	return NextResponse.json(await createCreditCardPayment({ input, session }), { status: 201 });
}

export const POST = appApiHandler({ POST: createCreditCardPaymentRoute });
