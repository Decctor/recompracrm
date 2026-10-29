import { writeDefaultAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";
import { type TResolvedPaymentSplit, getPaymentProvider, resolvePaymentFinancialAccounts } from "@/lib/payments";
import { createAccountingEntry } from "@/lib/sales/sale-processing/create-accounting-entry";
import { validateSalesSessionSeller } from "@/lib/sales-sessions";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { type DBTransaction, db } from "@/services/drizzle";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { accountingEntries, financialTransactions, sales, salesSessions, tabPayments, tabs } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { TAB_PARTIAL_PAYMENT_TRANSACTION_ORIGIN, getTabPartialPaymentBlockReason, resolveTabPartialPaymentCap } from "./partial-payments";
import { describeTabForTitle, recomputeTabDraftSaleTotals, sumTabActivePayments } from "./utils";

export type TReceiveTabPaymentInput = {
	tabId: string;
	payment: {
		metodo: TPaymentMethodEnum;
		valor: number;
		contaFinanceiraId?: string | null;
		observacoes?: string | null;
	};
	// Nome livre so para exibicao ("Joao"). Nao vincula cliente.
	payerName?: string | null;
	// Caixa que recebe. Ja validado pela rota (aberto, vendedor); relido sob lock aqui.
	sessaoVendaId?: string | null;
};

const roundCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Recebimento parcial de uma conta aberta. Por valor, nao por itens: abate do total que o
 * fechamento vai cobrar, e os itens continuam todos na venda rascunho.
 *
 * Modelo contabil (docs/dev-planning/tab-partial-payments-plan.md): o lancamento VENDA da venda
 * rascunho nasce no primeiro parcial, com valor = recebido; cada parcial seguinte soma ao valor
 * em place. No fechamento a confirmacao reaproveita o lancamento (valor = total da venda). Assim o
 * dinheiro entra no caixa na hora e o invariante "um lancamento VENDA por venda" se mantem.
 *
 * 1. contas financeiras resolvidas fora da transacao (igual ao fechamento);
 * 2. lock da tab (ABERTA), da venda rascunho e, se houver, da sessao de caixa (ABERTA);
 * 3. teto = consumo atual − parciais ativos;
 * 4. lancamento VENDA criado ou somado; transacao efetivada no caixa; registro em tab_payments.
 */
export async function receiveTabPayment({
	organization,
	userId,
	input,
}: {
	organization: TOrganizationEntity;
	userId: string | null;
	input: TReceiveTabPaymentInput;
}) {
	const salePayment = await prepareTabPayment({ organization, input });
	return db.transaction((tx) => receiveTabPaymentInTransaction({ tx, organization, userId, input, salePayment }));
}
export type TReceiveTabPaymentResult = Awaited<ReturnType<typeof receiveTabPayment>>;

/** Validações e conta financeira do recebimento, fora da transação (igual ao fechamento). */
export async function prepareTabPayment({ organization, input }: { organization: TOrganizationEntity; input: TReceiveTabPaymentInput }) {
	if (input.payment.metodo === "CASHBACK") {
		throw new createHttpError.BadRequest("Cashback nao pode ser usado num recebimento parcial. Use-o no fechamento da conta.");
	}
	if (!Number.isFinite(input.payment.valor) || input.payment.valor <= 0) {
		throw new createHttpError.BadRequest("Valor de pagamento invalido.");
	}

	const organizationSaleDefaults = organization.configuracao.defaults.contabilidade.lancamentosPadrao.vendas;
	const accountingEntryDebitAccountId = organizationSaleDefaults.debitoContaId;
	const accountingEntryCreditAccountId = organizationSaleDefaults.creditoContaId;
	if (!accountingEntryDebitAccountId || !accountingEntryCreditAccountId) {
		throw new createHttpError.InternalServerError("A organizacao nao possui contas padrao de vendas configuradas.");
	}

	// Sempre imediato e sem parcelas: parcelado vira agenda PENDENTE e fiado nao e "pagou a parte dele".
	const [salePayment] = (await resolvePaymentFinancialAccounts({
		organization,
		payments: [
			{
				metodo: input.payment.metodo,
				valor: roundCents(input.payment.valor),
				efetivacaoTipo: "IMEDIATA",
				totalParcelas: null,
				observacoes: input.payerName?.trim() || null,
				contaFinanceiraId: input.payment.contaFinanceiraId ?? null,
			},
		],
	})) as [TResolvedPaymentSplit];
	return salePayment;
}

/** O recebimento dentro da transação do chamador (a maquininha usa a transação idempotente do dispositivo). */
export async function receiveTabPaymentInTransaction({
	tx,
	organization,
	userId,
	input,
	salePayment,
}: {
	tx: DBTransaction;
	organization: TOrganizationEntity;
	userId: string | null;
	input: TReceiveTabPaymentInput;
	salePayment: TResolvedPaymentSplit;
}) {
	const organizationSaleDefaults = organization.configuracao.defaults.contabilidade.lancamentosPadrao.vendas;
	const accountingEntryDebitAccountId = organizationSaleDefaults.debitoContaId;
	const accountingEntryCreditAccountId = organizationSaleDefaults.creditoContaId;
	if (!accountingEntryDebitAccountId || !accountingEntryCreditAccountId) {
		throw new createHttpError.InternalServerError("A organizacao nao possui contas padrao de vendas configuradas.");
	}
	const [tab] = await tx
		.select({ id: tabs.id, status: tabs.status, codigo: tabs.codigo, servicePointId: tabs.servicePointId })
		.from(tabs)
		.where(and(eq(tabs.id, input.tabId), eq(tabs.organizacaoId, organization.id)))
		.for("update");
	if (!tab) throw new createHttpError.NotFound("Conta nao encontrada.");
	if (tab.status !== "ABERTA") throw new createHttpError.BadRequest("Conta nao esta aberta.");

	const [draftSale] = await tx
		.select({ id: sales.id, vendedorId: sales.vendedorId })
		.from(sales)
		.where(and(eq(sales.tabId, tab.id), eq(sales.statusVenda, "ORCAMENTO")))
		.for("update");
	if (!draftSale) throw new createHttpError.BadRequest("Conta sem consumo lancado.");

	// A rota ja validou a sessao, mas a resolucao de la e so mensagem amigavel: sem o lock aqui,
	// um caixa fechado entre a rota e o insert receberia uma transacao que o snapshot nunca ve.
	if (input.sessaoVendaId) {
		const [lockedSession] = await tx
			.select({
				id: salesSessions.id,
				status: salesSessions.status,
				politica: salesSessions.politica,
				vendedorPadraoId: salesSessions.vendedorPadraoId,
			})
			.from(salesSessions)
			.where(and(eq(salesSessions.id, input.sessaoVendaId), eq(salesSessions.organizacaoId, organization.id)))
			.for("update");
		if (!lockedSession || lockedSession.status !== "ABERTA") {
			throw new createHttpError.Conflict("A sessao de venda foi fechada. Selecione outro caixa e tente novamente.");
		}
		validateSalesSessionSeller({ session: lockedSession, vendedorId: draftSale.vendedorId });
	}

	const itemTotals = await recomputeTabDraftSaleTotals(tx, { saleId: draftSale.id });
	const jaPago = await sumTabActivePayments(tx, { tabId: tab.id });
	const blockReason = getTabPartialPaymentBlockReason({ consumo: itemTotals.valorTotal, jaPago, valor: salePayment.valor });
	if (blockReason) throw new createHttpError.BadRequest(blockReason);

	const servicePoint = tab.servicePointId
		? await tx.query.servicePoints.findFirst({ where: (fields, { eq }) => eq(fields.id, tab.servicePointId as string), columns: { rotulo: true } })
		: null;
	const tabTitle = describeTabForTitle({ codigo: tab.codigo, servicePoint });

	// Lancamento VENDA da venda rascunho: nasce aqui no primeiro parcial, soma nos seguintes.
	const existingEntry = await tx.query.accountingEntries.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.vendaId, draftSale.id), eq(fields.organizacaoId, organization.id), eq(fields.origemTipo, "VENDA")),
		columns: { id: true, valor: true, idContaDebito: true, idContaCredito: true },
	});
	let entryId: string;
	if (existingEntry) {
		const nextValue = roundCents(existingEntry.valor + salePayment.valor);
		await tx.update(accountingEntries).set({ valor: nextValue }).where(eq(accountingEntries.id, existingEntry.id));
		await writeDefaultAccountingEntryLines({
			trx: tx,
			organizationId: organization.id,
			accountingEntryId: existingEntry.id,
			entryValue: nextValue,
			debitAccountId: existingEntry.idContaDebito,
			creditAccountId: existingEntry.idContaCredito,
		});
		entryId = existingEntry.id;
	} else {
		// Titulo denuncia a conta em aberto no modulo financeiro; a confirmacao renomeia no fechamento.
		const created = await createAccountingEntry(tx, {
			organizacaoId: organization.id,
			vendaId: draftSale.id,
			valor: salePayment.valor,
			titulo: `CONTA EM ABERTO · ${tabTitle.toUpperCase()}`,
			idContaDebito: accountingEntryDebitAccountId,
			idContaCredito: accountingEntryCreditAccountId,
			autorId: userId,
		});
		if (!created?.id) throw new createHttpError.InternalServerError("Erro ao criar o lancamento contabil da conta.");
		entryId = created.id;
	}

	// O provider monta "Pagamento via {metodo} ({obs}) - {saleLabel}"; o pagador vai em obs.
	const [paymentResult] = await getPaymentProvider(organization).processPayments(
		{
			vendaId: draftSale.id,
			lancamentoContabilId: entryId,
			organizacaoId: organization.id,
			pagamentos: [salePayment],
			autorId: userId,
			sessaoVendaId: input.sessaoVendaId ?? null,
			saleLabel: `Parcial · ${tabTitle}`,
		},
		tx,
	);
	if (!paymentResult) throw new createHttpError.InternalServerError("Erro ao registrar o recebimento.");
	// O provider nao recebe metadados: carimba a origem depois, pelo id devolvido.
	await tx
		.update(financialTransactions)
		.set({ modificadoresMetadata: { origem: TAB_PARTIAL_PAYMENT_TRANSACTION_ORIGIN } })
		.where(eq(financialTransactions.id, paymentResult.transacaoId));

	const [tabPayment] = await tx
		.insert(tabPayments)
		.values({
			organizacaoId: organization.id,
			tabId: tab.id,
			vendaId: draftSale.id,
			lancamentoContabilId: entryId,
			transacaoFinanceiraId: paymentResult.transacaoId,
			sessaoVendaId: input.sessaoVendaId ?? null,
			metodo: salePayment.metodo,
			valor: salePayment.valor,
			pagadorNome: input.payerName?.trim() || null,
			status: "ATIVO",
			recebidoPorUsuarioId: userId,
		})
		.returning();
	if (!tabPayment) throw new createHttpError.InternalServerError("Erro ao registrar o recebimento parcial.");

	const valorPago = roundCents(jaPago + salePayment.valor);
	return {
		tabPayment,
		valorPago,
		valorRestante: resolveTabPartialPaymentCap({ consumo: itemTotals.valorTotal, jaPago: valorPago }),
	};
}
