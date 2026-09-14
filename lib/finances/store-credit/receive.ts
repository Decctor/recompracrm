import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { normalizeFinancialTransactionValue } from "@/lib/finances/financial-transaction-value";
import { resolveActiveSalesSession } from "@/lib/sales-sessions/resolve-active-sales-session";
import { processSaleAutomaticFiscalEmissionIfEligible, processSaleCashbackAccumulationIfEligible } from "@/lib/sales/sale-processing";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { accountingEntries, financialAccounts, financialTransactions, sales } from "@/services/drizzle/schema";
import { getStoreCreditAllocationError, type TStoreCreditAllocation } from "./allocate";
import {
	STORE_CREDIT_METHOD,
	STORE_CREDIT_RECEIPT_ORIGIN,
	STORE_CREDIT_REMAINDER_ORIGIN,
	STORE_CREDIT_TOLERANCE,
	STORE_CREDIT_UNLINKED_CLIENT_ID,
} from "./constants";

export type TReceiveStoreCreditReceipt = {
	valor: number;
	dataRecebimento: Date;
	metodo: TPaymentMethodEnum;
	contaFinanceiraId: string | null;
	sessaoVendaId: string | null;
	observacoes: string | null;
	/** Previsão do saldo remanescente de uma baixa parcial. Ausente mantém a previsão original. */
	novaDataPrevisao: Date | null;
};

export type TReceiveStoreCreditParams = {
	orgId: string;
	authorId: string;
	clientId: string;
	receipt: TReceiveStoreCreditReceipt;
	allocations: TStoreCreditAllocation[];
};

/** O fiado vira dinheiro de verdade na baixa — receber "em fiado" ou "a definir" não quita nada. */
const UNSUPPORTED_RECEIPT_METHODS: TPaymentMethodEnum[] = [STORE_CREDIT_METHOD, "A_DEFINIR"];

function toCents(value: number) {
	return Math.round((value + Number.EPSILON) * 100);
}

/**
 * Baixa de fiado, total ou parcial, de um ou vários títulos do mesmo cliente.
 *
 * A baixa parcial é um **split da movimentação**: a linha original é reduzida ao valor recebido e
 * efetivada, e uma nova linha pendente nasce com o saldo, no mesmo lançamento contábil. A soma das
 * duas continua sendo o valor do lançamento, que é exatamente o invariante que
 * `getAccountingEntryBalanceError` cobra — por isso o módulo não precisa de tabela nem de coluna
 * nova, e DRE, fluxo de caixa, aging, conciliação e o esperado de gaveta seguem lendo as mesmas
 * linhas de sempre.
 *
 * A quitação total é o caso degenerado: nenhum remanescente nasce.
 */
export async function receiveStoreCredit({ orgId, authorId, clientId, receipt, allocations }: TReceiveStoreCreditParams) {
	if (UNSUPPORTED_RECEIPT_METHODS.includes(receipt.metodo)) {
		throw new createHttpError.BadRequest("Escolha a forma como o dinheiro entrou: um fiado não se recebe em fiado.");
	}
	if (allocations.length === 0) throw new createHttpError.BadRequest("Selecione ao menos uma venda para abater.");

	// A sessão carimba a movimentação e, com isso, o esperado de gaveta. Sem a validação aqui, um id
	// de sessão fechada entraria no banco e o fechamento de caixa acusaria uma sobra sem lastro.
	const session = receipt.sessaoVendaId ? await resolveActiveSalesSession({ orgId, sessaoVendaId: receipt.sessaoVendaId }) : null;
	if (receipt.sessaoVendaId && !session) {
		throw new createHttpError.BadRequest("A sessão de caixa informada não está mais aberta. Confira o caixa e registre novamente.");
	}

	// Havendo sessão, o dinheiro entra na conta da própria sessão: é lá que ele está fisicamente.
	const targetAccountId = session ? (session.contaFinanceiraId ?? receipt.contaFinanceiraId) : receipt.contaFinanceiraId;
	if (targetAccountId) {
		const account = await db.query.financialAccounts.findFirst({
			where: and(eq(financialAccounts.id, targetAccountId), eq(financialAccounts.organizacaoId, orgId)),
			columns: { id: true },
		});
		if (!account) throw new createHttpError.NotFound("Conta financeira não encontrada para esta organização.");
	}

	const allocationIds = allocations.map((allocation) => allocation.transacaoId);

	const { affectedSaleIds, totalRecebido, titulosQuitados, titulosParciais } = await db.transaction(async (tx) => {
		// Trava só a tabela de movimentações: `for update` não se aplica ao lado nulo de um outer
		// join, e o vínculo com a venda é lido logo abaixo, já sob a proteção desta trava.
		const lockedTransactions = await tx
			.select()
			.from(financialTransactions)
			.where(and(inArray(financialTransactions.id, allocationIds), eq(financialTransactions.organizacaoId, orgId)))
			.for("update");

		if (lockedTransactions.length !== allocationIds.length) {
			throw new createHttpError.NotFound("Uma das vendas informadas não foi encontrada nesta organização.");
		}

		const ownershipRows = await tx
			.select({
				transacaoId: financialTransactions.id,
				vendaId: accountingEntries.vendaId,
				clienteId: sales.clienteId,
				statusVenda: sales.statusVenda,
			})
			.from(financialTransactions)
			.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
			.leftJoin(sales, eq(accountingEntries.vendaId, sales.id))
			.where(and(inArray(financialTransactions.id, allocationIds), eq(financialTransactions.organizacaoId, orgId)));

		const ownershipByTransactionId = new Map(ownershipRows.map((row) => [row.transacaoId, row]));

		for (const transaction of lockedTransactions) {
			if (transaction.dataEfetivacao) {
				throw new createHttpError.Conflict("Uma das vendas selecionadas já foi recebida. Atualize a lista e tente novamente.");
			}
			if (transaction.metodo !== STORE_CREDIT_METHOD || transaction.tipo !== "ENTRADA") {
				throw new createHttpError.BadRequest("Somente movimentações de fiado em aberto podem ser recebidas por aqui.");
			}
			const ownership = ownershipByTransactionId.get(transaction.id);
			if (!ownership) throw new createHttpError.NotFound("Não foi possível resolver a venda de uma das movimentações.");
			if (ownership.statusVenda === "CANCELADA") throw new createHttpError.BadRequest("Uma das vendas selecionadas foi cancelada.");

			const ownerId = ownership.clienteId ?? STORE_CREDIT_UNLINKED_CLIENT_ID;
			if (ownerId !== clientId) throw new createHttpError.BadRequest("Uma das vendas selecionadas não pertence a este cliente.");
		}

		const allocationError = getStoreCreditAllocationError({
			titles: lockedTransactions.map((transaction) => ({
				transacaoId: transaction.id,
				saldo: transaction.valor,
				dataPrevisao: transaction.dataPrevisao,
			})),
			valorRecebido: receipt.valor,
			allocations,
		});
		if (allocationError) throw new createHttpError.BadRequest(allocationError);

		const transactionById = new Map(lockedTransactions.map((transaction) => [transaction.id, transaction]));
		const affectedSaleIds = new Set<string>();
		let totalRecebido = 0;
		let titulosQuitados = 0;
		let titulosParciais = 0;

		for (const allocation of allocations) {
			const transaction = transactionById.get(allocation.transacaoId);
			if (!transaction) continue;

			const saldoCents = toCents(transaction.valor);
			const recebidoCents = Math.min(saldoCents, toCents(allocation.valor));
			const remainderCents = saldoCents - recebidoCents;
			const recebido = recebidoCents / 100;

			await tx
				.update(financialTransactions)
				.set({
					...normalizeFinancialTransactionValue({ valor: recebido }),
					// O método vira o real: é assim que o dinheiro aparece na conferência de gaveta.
					// A origem preserva que ele entrou quitando um fiado — sem isso o relatório de
					// vendas por método passaria a contar esta venda na linha do método novo.
					modificadoresMetadata: {
						origem: STORE_CREDIT_RECEIPT_ORIGIN,
						regra: null,
						observacoes: receipt.observacoes,
						parametros: {
							clienteId: clientId,
							metodoOriginal: transaction.metodo,
							valorOriginal: transaction.valor,
							parcial: remainderCents > 0,
						},
					},
					metodo: receipt.metodo,
					dataEfetivacao: receipt.dataRecebimento,
					contaFinanceiraId: targetAccountId ?? transaction.contaFinanceiraId,
					sessaoVendaId: session?.id ?? transaction.sessaoVendaId,
					provedorStatus: "APROVADO",
					autorId: authorId,
				})
				.where(and(eq(financialTransactions.id, transaction.id), eq(financialTransactions.organizacaoId, orgId)));

			if (remainderCents > 0) {
				await tx.insert(financialTransactions).values({
					organizacaoId: orgId,
					lancamentoContabilId: transaction.lancamentoContabilId,
					contaFinanceiraId: transaction.contaFinanceiraId,
					titulo: transaction.titulo,
					tipo: "ENTRADA",
					...normalizeFinancialTransactionValue({ valor: remainderCents / 100 }),
					modificadoresMetadata: {
						origem: STORE_CREDIT_REMAINDER_ORIGIN,
						regra: null,
						observacoes: receipt.observacoes,
						parametros: { transacaoOrigemId: transaction.id, clienteId: clientId },
					},
					metodo: STORE_CREDIT_METHOD,
					dataPrevisao: receipt.novaDataPrevisao ?? transaction.dataPrevisao,
					dataEfetivacao: null,
					parcela: transaction.parcela,
					totalParcelas: transaction.totalParcelas,
					provedorStatus: "PENDENTE",
					autorId: authorId,
				});
				titulosParciais += 1;
			} else {
				titulosQuitados += 1;
			}

			totalRecebido += recebido;
			const saleId = ownershipByTransactionId.get(transaction.id)?.vendaId;
			if (saleId && remainderCents <= 0) affectedSaleIds.add(saleId);
		}

		return { affectedSaleIds: [...affectedSaleIds], totalRecebido, titulosQuitados, titulosParciais };
	});

	// Gatilhos pós-efetivação, fora da transação e com a mesma semântica de
	// `effectFinancialTransactionCore`: ambos são idempotentes e só agem quando a venda ficou
	// integralmente paga, então rodá-los por venda afetada não duplica cashback nem nota.
	if (affectedSaleIds.length > 0) {
		const organization = await db.query.organizations.findFirst({ where: (fields, { eq }) => eq(fields.id, orgId) });
		if (organization) {
			for (const saleId of affectedSaleIds) {
				try {
					await processSaleCashbackAccumulationIfEligible({ organizationId: orgId, saleId, authorId });
					await processSaleAutomaticFiscalEmissionIfEligible({ organization, saleId, authorId });
				} catch (error) {
					// O dinheiro já entrou e está commitado. Falhar a resposta aqui faria o operador
					// registrar a baixa de novo, e aí sim o caixa ficaria errado.
					console.error(`[STORE_CREDIT] Gatilhos pós-baixa falharam para a venda ${saleId}:`, error);
				}
			}
		}
	}

	return {
		totalRecebido: Math.abs(totalRecebido - receipt.valor) <= STORE_CREDIT_TOLERANCE ? receipt.valor : totalRecebido,
		titulosQuitados,
		titulosParciais,
		vendasQuitadas: affectedSaleIds.length,
	};
}

export type TReceiveStoreCreditResult = Awaited<ReturnType<typeof receiveStoreCredit>>;
