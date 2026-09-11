import type { TCanonicalSale, TCanonicalSalePayment } from "@/lib/data-connectors/types";
import { writeDefaultAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";
import { ensureFirstPartyFinancialAccount, type TFirstPartyAccountKey } from "@/lib/finances/first-party-accounts";
import { resolveAccountingDefaultAccountIds } from "@/lib/finances/resolve-accounting-default-accounts";
import { normalizeFinancialTransactionValue } from "@/lib/finances/financial-transaction-value";
import { getOrganizationPaymentMethodsConfig } from "@/lib/payments/defaults";
import { buildSaleEntryTitle } from "@/lib/sales/entry-titles";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { DBTransaction } from "@/services/drizzle";
import { accountingEntries, financialTransactions } from "@/services/drizzle/schema";
import { and, eq, isNull, ne, or } from "drizzle-orm";

/**
 * Financeiro de vendas de canais gerenciados (fase 4 do plano iFood/fulfillment).
 *
 * Modelo de conta clearing: a venda entra pelo valor BRUTO; pagamentos online do canal entram
 * EFETIVADOS na conta first-party do canal (ex.: "iFood") — o consumidor já pagou, o dinheiro
 * existe e está em posse do canal; a pendência loja↔canal não é da venda. Taxas retidas saem
 * efetivadas da mesma conta, então o saldo da conta clearing vale o LÍQUIDO em posse do canal.
 * O repasse é um evento posterior e agregado: uma transferência conta do canal → conta bancária,
 * registrada no módulo financeiro (manual nesta fase; a conciliação automática é a fase 4b).
 * Pagamentos na entrega viram ENTRADA pendente na conta padrão do método e são efetivados na
 * entrega — a única pendência real de uma venda gerenciada.
 */

function round2(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Status de provedor das transações de canal gerenciado (texto livre na coluna provedor_status). */
const PROVIDER_STATUS = {
	/** Pago na entrega: pendente até a venda ser entregue. */
	PENDING: "PENDENTE",
	APPROVED: "APROVADO",
	CANCELED: "CANCELADO",
	/** Efetivada e depois revertida por cancelamento — a contra-partida de estorno carrega o mesmo status. */
	REVERSED: "ESTORNADO",
} as const;

function buildTransactionTitle(payment: TCanonicalSalePayment, saleLabel: string) {
	const suffix = payment.descricao?.trim() ? ` (${payment.descricao.trim()})` : "";
	return `Pagamento via ${payment.metodo}${suffix} - ${saleLabel}`;
}

/**
 * Cria o lançamento contábil + transações financeiras de uma venda gerenciada que tornou-se
 * válida neste sync. Idempotente por venda: pula se já existir lançamento contábil.
 * Deve rodar num savepoint — falha aqui não pode abortar a importação da organização.
 */
export async function processManagedSaleFinancials(
	tx: DBTransaction,
	{
		organizationId,
		saleId,
		sale,
		channelAccountKey,
		organizationConfiguration,
	}: {
		organizationId: string;
		saleId: string;
		sale: TCanonicalSale;
		channelAccountKey: TFirstPartyAccountKey;
		organizationConfiguration: TOrganizationConfiguration | null;
	},
): Promise<{ processed: boolean; reason?: string }> {
	// displayId nulo cai no desambiguador de data-hora do helper — nunca no UUID do pedido.
	const saleLabel = buildSaleEntryTitle({
		channelLabel: sale.model,
		saleNumber: sale.displayId ?? null,
		clientName: sale.client?.name,
		totalValue: sale.totalValue,
		occurredAt: sale.occurredAt,
	});
	const existingEntry = await tx.query.accountingEntries.findFirst({
		where: and(
			eq(accountingEntries.organizacaoId, organizationId),
			eq(accountingEntries.vendaId, saleId),
			// O lançamento das taxas do canal tem chave própria e não prova que a VENDA já foi lançada.
			or(isNull(accountingEntries.chaveIdempotencia), ne(accountingEntries.chaveIdempotencia, buildChannelFeesIdempotencyKey(saleId))),
		),
		columns: { id: true },
	});

	// As taxas rodam ANTES da trava de idempotência da venda: elas têm lançamento e chave próprios,
	// então uma organização que ligou o financeiro antes desta rotina existir recupera a despesa numa
	// reexecução, em vez de ficar para sempre com a venda lançada e a taxa nunca.
	await processManagedSaleChannelFees(tx, { organizationId, saleId, sale, channelAccountKey, saleLabel });

	if (existingEntry) return { processed: false, reason: "ja-processada" };

	const saleDefaults = organizationConfiguration?.defaults?.contabilidade?.lancamentosPadrao?.vendas;
	const debitAccountId = saleDefaults?.debitoContaId;
	const creditAccountId = saleDefaults?.creditoContaId;
	if (!debitAccountId || !creditAccountId) {
		console.warn(
			`[MANAGED_SALE_FINANCIALS] Organização ${organizationId} sem contas contábeis padrão de vendas — venda ${saleId} importada sem financeiro.`,
		);
		return { processed: false, reason: "sem-contas-padrao" };
	}

	// Fallback: canal sem detalhamento de pagamento → trata o total como pago online (padrão do
	// iFood). Vendas sem valor não geram financeiro.
	const channelPaymentDetail = sale.payments && sale.payments.length > 0 ? sale.payments : null;
	const payments: TCanonicalSalePayment[] =
		channelPaymentDetail ??
		(sale.totalValue > 0 ? [{ metodo: "OUTRO", valor: sale.totalValue, pagoOnline: true, descricao: "Canal (sem detalhamento)" }] : []);
	if (payments.length === 0) return { processed: false, reason: "sem-pagamentos" };

	const paymentsTotal = payments.reduce((sum, payment) => sum + payment.valor, 0);
	// O cliente paga o pedido inteiro, mas o canal retém as taxas e o frete que ele mesmo executa —
	// só a operação da loja vira `totalValue`. Essa retenção é a diferença ESPERADA entre os dois;
	// comparar sem ela faria a venda normal com taxa disparar o alerta.
	const channelRetainedTotal = round2((sale.integrationMetadata?.taxasCanal ?? []).reduce((sum, fee) => sum + fee.valor, 0));
	const expectedPaymentsTotal = round2(sale.totalValue + channelRetainedTotal);
	if (channelPaymentDetail && Math.abs(paymentsTotal - expectedPaymentsTotal) > 0.01) {
		console.warn(
			`[MANAGED_SALE_FINANCIALS] Divergência entre pagamentos (${paymentsTotal.toFixed(2)}) e total da venda + retenções do canal (${expectedPaymentsTotal.toFixed(2)}) — venda ${saleId}. Registrando pelos pagamentos.`,
		);
	}

	const channelAccount = await ensureFirstPartyFinancialAccount(tx, { organizationId, key: channelAccountKey });
	const methodDefaults = getOrganizationPaymentMethodsConfig(organizationConfiguration);

	const [entry] = await tx
		.insert(accountingEntries)
		.values({
			organizacaoId: organizationId,
			vendaId: saleId,
			origemTipo: "VENDA",
			titulo: saleLabel,
			idContaDebito: debitAccountId,
			idContaCredito: creditAccountId,
			valor: paymentsTotal,
			dataCompetencia: sale.occurredAt,
			autorId: null,
		})
		.returning({ id: accountingEntries.id });

	await writeDefaultAccountingEntryLines({
		trx: tx,
		organizationId,
		accountingEntryId: entry.id,
		entryValue: paymentsTotal,
		debitAccountId,
		creditAccountId,
	});

	for (const payment of payments) {
		const isOnline = payment.pagoOnline;
		await tx.insert(financialTransactions).values({
			organizacaoId: organizationId,
			lancamentoContabilId: entry.id,
			// Online: conta clearing do canal, já efetivada — o consumidor pagou o canal no ato da venda.
			// Na entrega: conta financeira padrão do método (cai no caixa quando entregue).
			contaFinanceiraId: isOnline ? channelAccount.id : (methodDefaults[payment.metodo]?.contaFinanceiraPadraoId ?? null),
			titulo: buildTransactionTitle(payment, saleLabel),
			tipo: "ENTRADA",
			...normalizeFinancialTransactionValue({ valor: payment.valor }),
			metodo: payment.metodo,
			dataPrevisao: sale.occurredAt,
			dataEfetivacao: isOnline ? sale.occurredAt : null,
			provedorReferencia: sale.sourceSaleId,
			provedorStatus: isOnline ? PROVIDER_STATUS.APPROVED : PROVIDER_STATUS.PENDING,
			autorId: null,
		});
	}

	return { processed: true };
}

/** Chave de idempotência do lançamento de taxas — separada da venda, que tem chave nula. */
function buildChannelFeesIdempotencyKey(saleId: string) {
	return `taxas-canal:${saleId}`;
}

/**
 * Taxas retidas pelo canal (ex.: comissao e taxa de servico do iFood, alem do frete quando quem
 * entrega e o canal): lancamento proprio de despesa por venda, com uma SAIDA na conta de repasse.
 *
 * O canal ja repassa liquido, entao a taxa sai EFETIVADA da conta clearing (a retencao acontece
 * no ato, nao existe conta a pagar) — e o saldo da conta clearing passa a valer o liquido em
 * posse do canal. Lancamento separado do de venda porque o par debito/credito e outro; ambos
 * apontam para a mesma venda. Idempotente pela chave `taxas-canal:<vendaId>`.
 */
async function processManagedSaleChannelFees(
	tx: DBTransaction,
	{
		organizationId,
		saleId,
		sale,
		channelAccountKey,
		saleLabel,
	}: { organizationId: string; saleId: string; sale: TCanonicalSale; channelAccountKey: TFirstPartyAccountKey; saleLabel: string },
): Promise<{ processed: boolean; reason?: string }> {
	const fees = (sale.integrationMetadata?.taxasCanal ?? []).filter((fee) => fee.valor > 0);
	if (fees.length === 0) return { processed: false, reason: "sem-taxas" };

	const feesTotal = round2(fees.reduce((sum, fee) => sum + fee.valor, 0));
	if (feesTotal <= 0) return { processed: false, reason: "sem-taxas" };

	const idempotencyKey = buildChannelFeesIdempotencyKey(saleId);
	const existing = await tx.query.accountingEntries.findFirst({
		where: and(eq(accountingEntries.organizacaoId, organizationId), eq(accountingEntries.chaveIdempotencia, idempotencyKey)),
		columns: { id: true },
	});
	if (existing) return { processed: false, reason: "ja-processada" };

	const channelAccountId = (await ensureFirstPartyFinancialAccount(tx, { organizationId, key: channelAccountKey })).id;

	// autoProvisionFromSeed: organizacoes onboardadas antes de "despesas_comerciais" existir no
	// plano nao podem perder a taxa por falta de conta.
	const { debitAccountId, creditAccountId } = await resolveAccountingDefaultAccountIds({
		trx: tx,
		orgId: organizationId,
		kind: "taxasCanal",
		autoProvisionFromSeed: true,
	});

	const [entry] = await tx
		.insert(accountingEntries)
		.values({
			organizacaoId: organizationId,
			vendaId: saleId,
			origemTipo: "VENDA",
			titulo: `Taxas do canal - ${saleLabel}`,
			anotacoes: fees.map((fee) => `${fee.tipo}: ${fee.valor.toFixed(2)}`).join(", "),
			idContaDebito: debitAccountId,
			idContaCredito: creditAccountId,
			valor: feesTotal,
			dataCompetencia: sale.occurredAt,
			chaveIdempotencia: idempotencyKey,
			autorId: null,
		})
		.returning({ id: accountingEntries.id });

	await writeDefaultAccountingEntryLines({
		trx: tx,
		organizationId,
		accountingEntryId: entry.id,
		entryValue: feesTotal,
		debitAccountId,
		creditAccountId,
	});

	for (const fee of fees) {
		await tx.insert(financialTransactions).values({
			organizacaoId: organizationId,
			lancamentoContabilId: entry.id,
			contaFinanceiraId: channelAccountId,
			titulo: `Taxa ${fee.tipo} - ${saleLabel}`,
			tipo: "SAIDA",
			...normalizeFinancialTransactionValue({ valor: fee.valor }),
			metodo: "OUTRO",
			dataPrevisao: sale.occurredAt,
			dataEfetivacao: sale.occurredAt,
			provedorReferencia: sale.sourceSaleId,
			provedorStatus: PROVIDER_STATUS.APPROVED,
			autorId: null,
		});
	}

	return { processed: true };
}

async function loadManagedSaleTransactions(tx: DBTransaction, { organizationId, saleId }: { organizationId: string; saleId: string }) {
	const entries = await tx.query.accountingEntries.findMany({
		where: and(eq(accountingEntries.organizacaoId, organizationId), eq(accountingEntries.vendaId, saleId)),
		columns: { id: true },
		with: {
			transacoesFinanceiras: {
				columns: { id: true, tipo: true, dataEfetivacao: true, provedorStatus: true },
			},
		},
	});
	return entries.flatMap((entry) => entry.transacoesFinanceiras);
}

/**
 * Efetiva os pagamentos "na entrega" (PENDENTE) quando a venda gerenciada é entregue.
 * Idempotente: transações já efetivadas/canceladas não são tocadas.
 */
export async function settleManagedSaleOfflinePayments(tx: DBTransaction, { organizationId, saleId }: { organizationId: string; saleId: string }) {
	const transactions = await loadManagedSaleTransactions(tx, { organizationId, saleId });
	const pendingOffline = transactions.filter(
		(transaction) => transaction.tipo === "ENTRADA" && !transaction.dataEfetivacao && transaction.provedorStatus === PROVIDER_STATUS.PENDING,
	);

	for (const transaction of pendingOffline) {
		await tx
			.update(financialTransactions)
			.set({ dataEfetivacao: new Date(), provedorStatus: PROVIDER_STATUS.APPROVED })
			.where(eq(financialTransactions.id, transaction.id));
	}
}

/** Chave de idempotência do lançamento de estorno de um lançamento de venda gerenciada. */
function buildChannelReversalIdempotencyKey(entryId: string) {
	return `estorno-canal:${entryId}`;
}

/**
 * Cancela o financeiro de uma venda gerenciada que virou cancelada. Transações ainda pendentes
 * (pagamento na entrega não entregue) apenas viram CANCELADO. Transações efetivadas (modelo
 * clearing: online no import; ou na entrega, já liquidada) são ESTORNADAS com lançamento de
 * estorno próprio e contra-partidas efetivadas na mesma conta — o saldo volta ao estado
 * pré-venda. Idempotente pelos status já revertidos e pela chave `estorno-canal:<lancamentoId>`.
 */
export async function cancelManagedSaleFinancials(tx: DBTransaction, { organizationId, saleId }: { organizationId: string; saleId: string }) {
	const entries = await tx.query.accountingEntries.findMany({
		where: and(eq(accountingEntries.organizacaoId, organizationId), eq(accountingEntries.vendaId, saleId)),
		columns: { id: true, titulo: true, origemTipo: true, idContaDebito: true, idContaCredito: true },
		with: {
			transacoesFinanceiras: {
				columns: {
					id: true,
					titulo: true,
					tipo: true,
					valor: true,
					metodo: true,
					contaFinanceiraId: true,
					dataEfetivacao: true,
					provedorStatus: true,
					provedorReferencia: true,
				},
			},
		},
	});

	for (const entry of entries) {
		// Contra-partidas de um estorno anterior não se re-estornam.
		if (entry.origemTipo === "ESTORNO") continue;

		const toReverse: (typeof entry.transacoesFinanceiras)[number][] = [];
		for (const transaction of entry.transacoesFinanceiras) {
			if (transaction.provedorStatus === PROVIDER_STATUS.CANCELED || transaction.provedorStatus === PROVIDER_STATUS.REVERSED) continue;
			if (!transaction.dataEfetivacao) {
				await tx.update(financialTransactions).set({ provedorStatus: PROVIDER_STATUS.CANCELED }).where(eq(financialTransactions.id, transaction.id));
				continue;
			}
			toReverse.push(transaction);
		}
		if (toReverse.length === 0) continue;

		const idempotencyKey = buildChannelReversalIdempotencyKey(entry.id);
		const existingReversal = await tx.query.accountingEntries.findFirst({
			where: and(eq(accountingEntries.organizacaoId, organizationId), eq(accountingEntries.chaveIdempotencia, idempotencyKey)),
			columns: { id: true },
		});
		if (!existingReversal) {
			const reversalValue = round2(toReverse.reduce((sum, transaction) => sum + transaction.valor, 0));
			const [reversalEntry] = await tx
				.insert(accountingEntries)
				.values({
					organizacaoId: organizationId,
					vendaId: saleId,
					origemTipo: "ESTORNO",
					titulo: `ESTORNO ${entry.titulo}`,
					idContaDebito: entry.idContaCredito,
					idContaCredito: entry.idContaDebito,
					valor: reversalValue,
					dataCompetencia: new Date(),
					chaveIdempotencia: idempotencyKey,
					autorId: null,
				})
				.returning({ id: accountingEntries.id });

			await writeDefaultAccountingEntryLines({
				trx: tx,
				organizationId,
				accountingEntryId: reversalEntry.id,
				entryValue: reversalValue,
				debitAccountId: entry.idContaCredito,
				creditAccountId: entry.idContaDebito,
			});

			for (const transaction of toReverse) {
				await tx.insert(financialTransactions).values({
					organizacaoId: organizationId,
					lancamentoContabilId: reversalEntry.id,
					contaFinanceiraId: transaction.contaFinanceiraId,
					titulo: `Estorno - ${transaction.titulo}`,
					tipo: transaction.tipo === "ENTRADA" ? "SAIDA" : "ENTRADA",
					...normalizeFinancialTransactionValue({ valor: transaction.valor }),
					metodo: transaction.metodo,
					dataPrevisao: new Date(),
					dataEfetivacao: new Date(),
					provedorReferencia: transaction.provedorReferencia,
					provedorStatus: PROVIDER_STATUS.REVERSED,
					autorId: null,
				});
			}
		}

		for (const transaction of toReverse) {
			await tx.update(financialTransactions).set({ provedorStatus: PROVIDER_STATUS.REVERSED }).where(eq(financialTransactions.id, transaction.id));
		}
	}
}
