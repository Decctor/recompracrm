import { resolvePaymentFinancialAccounts } from "@/lib/payments";
import { consumeSaleDiscountApproval } from "@/lib/sales/sale-discount-authorization";
import {
	type TProcessSaleConfirmationInput,
	processSaleConfirmationInTransaction,
	processSaleConfirmationPostCommitDetailed,
} from "@/lib/sales/sale-processing";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import type { DBTransaction } from "@/services/drizzle";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { sales, tabOrders, tabs } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { TAB_CLOSE_BLOCKING_ORDER_STATUSES } from "./close-blocking";
import { resolveTabBalance, tabPaymentsMatchRemaining } from "./partial-payments";
import { recomputeTabDraftSaleTotals, sumTabActivePayments } from "./utils";

type TCloseTabPaymentInput = {
	metodo: TPaymentMethodEnum;
	valor: number;
	totalParcelas?: number | null;
	efetivacaoTipo: "IMEDIATA" | "PENDENTE";
	dataPrevisao?: string | null;
	observacoes?: string | null;
	contaFinanceiraId?: string | null;
	// Perna de cartão cobrada numa maquininha: a confirmação cria a tentativa atribuída a ela.
	dispositivoId?: string | null;
};

export type TCloseTabInput = {
	tabId: string;
	pagamentos: TCloseTabPaymentInput[];
	sessaoVendaId?: string | null;
	contaDebitoId?: string | null;
	contaCreditoId?: string | null;
	// Ajustes de cabeçalho do fechamento, mesma semântica do PDV: o desconto incide sobre o
	// líquido dos itens e o acréscimo (taxa de serviço, couvert) entra por último.
	descontoGeral?: number | null;
	acrescimoGeral?: number | null;
	// Aprovação VENDA_DESCONTO já validada pelo chamador (authorizeSaleDiscount); consumida aqui.
	descontoAprovacaoId?: string | null;
	// Entregar no fechamento os pedidos ainda em andamento, em vez de recusar. Explicito: sem a
	// flag a API continua recusando, e nada e marcado como entregue por acidente.
	entregarPedidosEmAndamento?: boolean | null;
	// Switch "Imprimir cupom ao fechar". null = segue a impressão automática da organização.
	printReceipt?: boolean | null;
};

/**
 * Fecha a conta = checkout da venda rascunho, uma unica vez, com pagamentos reais:
 * 1. lock da tab (FOR UPDATE) — serializa contra fechamento/cancelamento/pedido concorrentes;
 * 2. bloqueia se houver pedidos em andamento na cozinha — ou, com `entregarPedidosEmAndamento`,
 *    marca todos como ENTREGUE na mesma transacao;
 * 3. aplica desconto/acréscimo do fechamento aos totais da venda rascunho; os recebimentos
 *    parciais ja ativos (tab_payments) abatem do total, e os pagamentos informados cobrem so o
 *    restante — restante zero fecha sem pagamento nenhum;
 * 4. confirma a venda rascunho via processSaleConfirmationInTransaction nascendo ENTREGUE —
 *    contabil (reaproveitando o lancamento VENDA nascido no primeiro parcial, se houver),
 *    financeiro efetivado no turno de caixa, cashback e (pos-commit) fiscal disparam
 *    exatamente uma vez; a baixa embutida usa o delta por item (pedidos ja entregues = no-op);
 * 5. tab -> FECHADA com valorTotal congelado (update condicional como segunda guarda).
 */
export async function closeTab({ organization, userId, input }: { organization: TOrganizationEntity; userId: string | null; input: TCloseTabInput }) {
	const prepared = await prepareTabClose({ organization, input });
	const { result, confirmationInput } = await db.transaction((tx) => closeTabInTransaction({ tx, organization, userId, input, prepared }));
	return { ...result, ...(await finishTabClose(confirmationInput)) };
}
export type TCloseTabResult = Awaited<ReturnType<typeof closeTab>>;

/**
 * Validações e resoluções fora da transação: contas contábeis da organização, ajustes e as
 * contas financeiras dos pagamentos. Separado para quem fecha dentro de outra transação (a
 * maquininha, na transação idempotente do dispositivo).
 */
export async function prepareTabClose({ organization, input }: { organization: TOrganizationEntity; input: TCloseTabInput }) {
	const organizationSaleDefaults = organization.configuracao.defaults.contabilidade.lancamentosPadrao.vendas;
	const accountingEntryDebitAccountId = input.contaDebitoId ?? organizationSaleDefaults.debitoContaId;
	const accountingEntryCreditAccountId = input.contaCreditoId ?? organizationSaleDefaults.creditoContaId;
	if (!accountingEntryDebitAccountId || !accountingEntryCreditAccountId) {
		throw new createHttpError.InternalServerError("A organizacao nao possui contas padrao de vendas configuradas.");
	}

	// Isolamento multi-tenant: contas informadas no request precisam pertencer a organizacao
	// (a FK de accountingEntries e global por id).
	const accountIds = [...new Set([accountingEntryDebitAccountId, accountingEntryCreditAccountId])];
	const accounts = await db.query.accountsCharts.findMany({
		where: (fields, { and, eq, inArray }) => and(inArray(fields.id, accountIds), eq(fields.organizacaoId, organization.id)),
		columns: { id: true },
	});
	if (accounts.length !== accountIds.length) {
		throw new createHttpError.BadRequest("Conta contabil invalida para esta organizacao.");
	}

	const descontoGeral = input.descontoGeral ?? 0;
	const acrescimoGeral = input.acrescimoGeral ?? 0;
	if (!Number.isFinite(descontoGeral) || descontoGeral < 0) throw new createHttpError.BadRequest("Valor de desconto invalido.");
	if (!Number.isFinite(acrescimoGeral) || acrescimoGeral < 0) throw new createHttpError.BadRequest("Valor de acrescimo invalido.");

	// Pagamentos: valores positivos e finitos. A igualdade com o total da conta e
	// validada dentro da transacao, contra o total autoritativo da venda rascunho.
	for (const pagamento of input.pagamentos) {
		if (!Number.isFinite(pagamento.valor) || pagamento.valor <= 0) {
			throw new createHttpError.BadRequest("Valor de pagamento invalido.");
		}
	}

	const salePayments = await resolvePaymentFinancialAccounts({ organization, payments: input.pagamentos });
	return { accountingEntryDebitAccountId, accountingEntryCreditAccountId, descontoGeral, acrescimoGeral, salePayments };
}
export type TPreparedTabClose = Awaited<ReturnType<typeof prepareTabClose>>;

/**
 * O fechamento em si, dentro da transação do chamador. `deviceId` marca a conta fechada pela
 * maquininha (`metadados.fechadaPorDispositivoId`) e `terminalAttempt` vai para a tentativa da
 * perna de cartão, como na venda nascida no terminal.
 */
export async function closeTabInTransaction({
	tx,
	organization,
	userId,
	input,
	prepared,
	deviceId = null,
	terminalAttempt = null,
}: {
	tx: DBTransaction;
	organization: TOrganizationEntity;
	userId: string | null;
	input: TCloseTabInput;
	prepared: TPreparedTabClose;
	deviceId?: string | null;
	terminalAttempt?: TProcessSaleConfirmationInput["terminalAttempt"];
}) {
	const { accountingEntryDebitAccountId, accountingEntryCreditAccountId, descontoGeral, acrescimoGeral, salePayments } = prepared;
	const [tab] = await tx
		.select()
		.from(tabs)
		.where(and(eq(tabs.id, input.tabId), eq(tabs.organizacaoId, organization.id)))
		.for("update");

	if (!tab) throw new createHttpError.NotFound("Conta nao encontrada.");
	if (tab.status !== "ABERTA") throw new createHttpError.BadRequest("Conta nao esta aberta.");

	const activeOrders = await tx
		.select({ id: tabOrders.id, numero: tabOrders.numero })
		.from(tabOrders)
		.where(and(eq(tabOrders.tabId, tab.id), inArray(tabOrders.status, [...TAB_CLOSE_BLOCKING_ORDER_STATUSES])));
	if (activeOrders.length > 0) {
		if (!input.entregarPedidosEmAndamento) {
			throw new createHttpError.BadRequest("Existem pedidos em andamento. Entregue ou cancele cada pedido antes de fechar a conta.");
		}
		// Sob o lock da tab: inclui pedido lançado depois que a tela de fechamento abriu. Sem baixa
		// aqui — a confirmação abaixo nasce ENTREGUE e baixa o delta por item da venda inteira.
		await tx
			.update(tabOrders)
			.set({ status: "ENTREGUE" })
			.where(and(eq(tabOrders.tabId, tab.id), inArray(tabOrders.status, [...TAB_CLOSE_BLOCKING_ORDER_STATUSES])));
	}

	const [draftSale] = await tx
		.select({ id: sales.id, valorTotal: sales.valorTotal })
		.from(sales)
		.where(and(eq(sales.tabId, tab.id), eq(sales.statusVenda, "ORCAMENTO")))
		.for("update");
	if (!draftSale) {
		throw new createHttpError.BadRequest("Conta sem consumo lancado. Cancele a conta em vez de fechar.");
	}

	// Total autoritativo = líquido dos itens (recalculado sob o lock) - desconto + acréscimo, gravado
	// nos mesmos campos do PDV: descontosTotal guarda a parcela de cabeçalho quando houver, e a
	// emissão fiscal deriva vDesc/vOutro desses totais (resolveFiscalHeaderDiscount/OtherCharges).
	const itemTotals = await recomputeTabDraftSaleTotals(tx, { saleId: draftSale.id });
	if (descontoGeral > itemTotals.valorTotal + 0.01) {
		throw new createHttpError.BadRequest("O desconto nao pode superar o consumo da conta.");
	}
	// Parciais ja recebidos (sob o mesmo lock): abatem do total; o fechamento cobre o restante.
	const jaPago = await sumTabActivePayments(tx, { tabId: tab.id });
	const balance = resolveTabBalance({ consumo: itemTotals.valorTotal, descontoGeral, acrescimoGeral, jaPago });
	const valorTotal = balance.valorTotal;
	if (valorTotal <= 0) throw new createHttpError.BadRequest("O total da conta precisa ser maior que zero para fechar.");
	if (balance.bloqueio) throw new createHttpError.BadRequest(balance.bloqueio);
	const descontosTotal = descontoGeral > 0 ? descontoGeral : itemTotals.descontosTotal;
	await tx
		.update(sales)
		.set({
			valorTotal,
			descontosTotal: descontosTotal > 0 ? descontosTotal : null,
			acrescimosTotal: acrescimoGeral > 0 ? acrescimoGeral : null,
		})
		.where(eq(sales.id, draftSale.id));

	// Soma dos pagamentos precisa cobrir exatamente o RESTANTE autoritativo da conta (total menos
	// parciais ativos; tolerancia de centavos). O client tambem valida, mas a guarda e aqui.
	const paymentsTotal = salePayments.reduce((sum, payment) => sum + payment.valor, 0);
	if (balance.restante > 0 && salePayments.length === 0) {
		throw new createHttpError.BadRequest("Informe os pagamentos do fechamento.");
	}
	if (!tabPaymentsMatchRemaining({ paymentsTotal, restante: balance.restante })) {
		throw new createHttpError.BadRequest("A soma dos pagamentos nao confere com o restante da conta. Atualize e tente novamente.");
	}

	// Lancamento VENDA nascido no primeiro parcial: a confirmacao o reaproveita em vez de criar outro.
	const existingEntry =
		jaPago > 0
			? await tx.query.accountingEntries.findFirst({
					where: (fields, { and, eq }) => and(eq(fields.vendaId, draftSale.id), eq(fields.organizacaoId, organization.id), eq(fields.origemTipo, "VENDA")),
					columns: { id: true },
				})
			: null;

	// Invariante 3 do plano: a transicao ABERTA -> FECHADA (compare-and-set) acontece
	// ANTES de qualquer efeito financeiro. O snapshot de valorTotal e preenchido depois.
	const closedRows = await tx
		.update(tabs)
		.set({
			status: "FECHADA",
			fechadaPorUsuarioId: userId,
			dataFechamento: new Date(),
			...(deviceId ? { metadados: { ...(tab.metadados as Record<string, unknown> | null), fechadaPorDispositivoId: deviceId } } : {}),
		})
		.where(and(eq(tabs.id, tab.id), eq(tabs.status, "ABERTA")))
		.returning({ id: tabs.id });
	if (closedRows.length === 0) {
		throw new createHttpError.Conflict("A conta foi alterada por outra operacao. Atualize e tente novamente.");
	}

	const confirmationInput: TProcessSaleConfirmationInput = {
		organization,
		saleId: draftSale.id,
		salePayments,
		saleAuthorId: userId,
		saleClientId: tab.clienteId,
		accountingEntryDebitAccountId,
		accountingEntryCreditAccountId,
		// A conta e fechada com tudo entregue; a baixa embutida da confirmacao usa o delta
		// por item, entao pedidos ja entregues durante o atendimento nao baixam de novo.
		initialAttendanceStatus: "ENTREGUE",
		sessaoVendaId: input.sessaoVendaId ?? null,
		existingAccountingEntryId: existingEntry?.id ?? null,
		prepaidAmount: jaPago,
		receiptPrintOverride: input.printReceipt ?? null,
		terminalAttempt,
	};

	// One-shot: a aprovação de desconto é consumida na mesma transação do fechamento.
	if (input.descontoAprovacaoId) {
		await consumeSaleDiscountApproval({ tx, aprovacaoId: input.descontoAprovacaoId, vendaId: draftSale.id });
	}

	const confirmation = await processSaleConfirmationInTransaction({ tx, input: confirmationInput });

	// Snapshot congelado do total, preenchido sob o mesmo estado reservado pelo CAS acima.
	const [confirmedSale] = await tx.select({ valorTotal: sales.valorTotal }).from(sales).where(eq(sales.id, draftSale.id));
	await tx
		.update(tabs)
		.set({ valorTotal: confirmedSale?.valorTotal ?? valorTotal })
		.where(eq(tabs.id, tab.id));

	return {
		result: { tabId: tab.id, saleId: draftSale.id, confirmation, valorTotal: confirmedSale?.valorTotal ?? valorTotal, valorPago: jaPago },
		confirmationInput,
	};
}

/**
 * Efeitos externos fora da transação: cupom (switch do operador ou regra da organização) e
 * emissão fiscal automática conforme configuração.
 */
export async function finishTabClose(confirmationInput: TProcessSaleConfirmationInput) {
	const postCommit = await processSaleConfirmationPostCommitDetailed(confirmationInput);
	return { receiptPrint: postCommit?.receiptPrint ?? null, fiscal: postCommit?.fiscal ?? null };
}
