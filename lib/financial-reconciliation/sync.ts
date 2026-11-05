import { writeDefaultAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";
import { effectFinancialTransactionCore } from "@/lib/finances/effect-financial-transaction";
import { normalizeFinancialTransactionValue } from "@/lib/finances/financial-transaction-value";
import { db } from "@/services/drizzle";
import {
	accountingEntries,
	accountsCharts,
	financialReconciliationMatches,
	financialStatementTransactions,
	financialTransactions,
} from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import { RECONCILIATION_VALUE_TOLERANCE } from "./constants";
import { learnReconciliationRule } from "./rules";

/**
 * Ações de sincronização da conciliação (docs/bank-reconciliation-design.md §6).
 * Todas escopadas por organizacaoId; a confirmação é sempre um ato humano (autorId).
 */

/**
 * Recalcula o status da linha: CONCILIADA quando a soma das transações dos matches CONFIRMADOS
 * cobre o valor da linha (tolerância padrão) — cobre o caso composição (1 linha ↔ N transações).
 */
async function refreshStatementLineStatus({ organizacaoId, linhaId }: { organizacaoId: string; linhaId: string }) {
	const linha = await db.query.financialStatementTransactions.findFirst({
		where: and(eq(financialStatementTransactions.id, linhaId), eq(financialStatementTransactions.organizacaoId, organizacaoId)),
		columns: { id: true, valor: true, status: true },
	});
	if (!linha || linha.status === "IGNORADA") return;

	const confirmed = await db
		.select({ valor: financialTransactions.valor })
		.from(financialReconciliationMatches)
		.innerJoin(financialTransactions, eq(financialReconciliationMatches.transacaoFinanceiraId, financialTransactions.id))
		.where(
			and(
				eq(financialReconciliationMatches.organizacaoId, organizacaoId),
				eq(financialReconciliationMatches.extratoTransacaoId, linhaId),
				eq(financialReconciliationMatches.status, "CONFIRMADO"),
			),
		);

	const covered = confirmed.reduce((total, row) => total + row.valor, 0);
	const status = covered >= linha.valor - RECONCILIATION_VALUE_TOLERANCE ? "CONCILIADA" : "PENDENTE";
	if (status !== linha.status) {
		await db.update(financialStatementTransactions).set({ status }).where(eq(financialStatementTransactions.id, linhaId));
	}
}

/**
 * Confirma um match sugerido. Transação pendente é efetivada com a data da linha do extrato
 * (acao=EFETIVADO, mantendo gatilhos de cashback/fiscal de vendas); efetivada só vincula
 * (acao=VINCULADO).
 */
export async function confirmReconciliationMatch({ organizacaoId, autorId, matchId }: { organizacaoId: string; autorId: string; matchId: string }) {
	const match = await db.query.financialReconciliationMatches.findFirst({
		where: and(eq(financialReconciliationMatches.id, matchId), eq(financialReconciliationMatches.organizacaoId, organizacaoId)),
		with: {
			extratoTransacao: true,
			transacaoFinanceira: { columns: { id: true, dataEfetivacao: true, contaFinanceiraId: true, metodo: true } },
		},
	});
	if (!match) throw new createHttpError.NotFound("Sugestão de conciliação não encontrada.");
	if (match.status === "CONFIRMADO") throw new createHttpError.BadRequest("Esta sugestão já foi confirmada.");
	if (match.extratoTransacao.status === "IGNORADA")
		throw new createHttpError.BadRequest("A linha do extrato está ignorada — restaure antes de conciliar.");

	let acao: "VINCULADO" | "EFETIVADO" = "VINCULADO";
	if (!match.transacaoFinanceira.dataEfetivacao) {
		await effectFinancialTransactionCore({
			transactionId: match.transacaoFinanceira.id,
			orgId: organizacaoId,
			authorId: autorId,
			dataEfetivacao: match.extratoTransacao.dataTransacao,
			contaFinanceiraId: match.transacaoFinanceira.contaFinanceiraId ?? match.extratoTransacao.contaFinanceiraId,
			metodo: match.transacaoFinanceira.metodo === "A_DEFINIR" && match.extratoTransacao.metodo ? match.extratoTransacao.metodo : null,
			origem: "CONCILIACAO",
		});
		acao = "EFETIVADO";
	}

	await db
		.update(financialReconciliationMatches)
		.set({ status: "CONFIRMADO", acao, autorId })
		.where(and(eq(financialReconciliationMatches.id, matchId), eq(financialReconciliationMatches.organizacaoId, organizacaoId)));

	await refreshStatementLineStatus({ organizacaoId, linhaId: match.extratoTransacaoId });
	return { matchId, acao };
}

/** Rejeita uma sugestão — o par não volta a ser sugerido pelo motor. */
export async function rejectReconciliationMatch({ organizacaoId, autorId, matchId }: { organizacaoId: string; autorId: string; matchId: string }) {
	const [updated] = await db
		.update(financialReconciliationMatches)
		.set({ status: "REJEITADO", autorId })
		.where(
			and(
				eq(financialReconciliationMatches.id, matchId),
				eq(financialReconciliationMatches.organizacaoId, organizacaoId),
				eq(financialReconciliationMatches.status, "SUGERIDO"),
			),
		)
		.returning({ id: financialReconciliationMatches.id, extratoTransacaoId: financialReconciliationMatches.extratoTransacaoId });
	if (!updated) throw new createHttpError.NotFound("Sugestão de conciliação não encontrada ou já resolvida.");
	return { matchId: updated.id };
}

/** Cria um match manual (busca manual na UI) e o confirma em seguida. */
export async function createManualReconciliationMatch({
	organizacaoId,
	autorId,
	extratoTransacaoId,
	transacaoFinanceiraId,
}: {
	organizacaoId: string;
	autorId: string;
	extratoTransacaoId: string;
	transacaoFinanceiraId: string;
}) {
	const [linha, transacao] = await Promise.all([
		db.query.financialStatementTransactions.findFirst({
			where: and(eq(financialStatementTransactions.id, extratoTransacaoId), eq(financialStatementTransactions.organizacaoId, organizacaoId)),
			columns: { id: true },
		}),
		db.query.financialTransactions.findFirst({
			where: and(eq(financialTransactions.id, transacaoFinanceiraId), eq(financialTransactions.organizacaoId, organizacaoId)),
			columns: { id: true },
		}),
	]);
	if (!linha) throw new createHttpError.NotFound("Linha do extrato não encontrada.");
	if (!transacao) throw new createHttpError.NotFound("Transação financeira não encontrada.");

	const [match] = await db
		.insert(financialReconciliationMatches)
		.values({ organizacaoId, extratoTransacaoId, transacaoFinanceiraId, tipo: "MANUAL", confianca: null, status: "SUGERIDO", autorId })
		.onConflictDoUpdate({
			target: [financialReconciliationMatches.extratoTransacaoId, financialReconciliationMatches.transacaoFinanceiraId],
			set: { status: "SUGERIDO", tipo: "MANUAL", autorId },
		})
		.returning({ id: financialReconciliationMatches.id });

	return confirmReconciliationMatch({ organizacaoId, autorId, matchId: match.id });
}

/**
 * Cria um lançamento contábil (origem CONCILIACAO) + transação já efetivada a partir de uma
 * linha sem correspondência, concilia a linha e aprende a regra descrição → contas contábeis.
 */
export async function createEntryFromStatementLine({
	organizacaoId,
	autorId,
	linhaId,
	titulo,
	anotacoes,
	contaContabilDebitoId,
	contaContabilCreditoId,
}: {
	organizacaoId: string;
	autorId: string;
	linhaId: string;
	titulo?: string | null;
	anotacoes?: string | null;
	contaContabilDebitoId: string;
	contaContabilCreditoId: string;
}) {
	const linha = await db.query.financialStatementTransactions.findFirst({
		where: and(eq(financialStatementTransactions.id, linhaId), eq(financialStatementTransactions.organizacaoId, organizacaoId)),
	});
	if (!linha) throw new createHttpError.NotFound("Linha do extrato não encontrada.");
	if (linha.status !== "PENDENTE") throw new createHttpError.BadRequest("Somente linhas pendentes podem gerar um novo lançamento.");

	const charts = await db.query.accountsCharts.findMany({
		where: and(eq(accountsCharts.organizacaoId, organizacaoId), inArray(accountsCharts.id, [contaContabilDebitoId, contaContabilCreditoId])),
		columns: { id: true },
	});
	const chartIds = new Set(charts.map((chart) => chart.id));
	if (!chartIds.has(contaContabilDebitoId) || !chartIds.has(contaContabilCreditoId)) {
		throw new createHttpError.NotFound("Conta contábil não encontrada para esta organização.");
	}

	const entryTitle = titulo?.trim() || linha.descricao;

	const result = await db.transaction(async (tx) => {
		const [entry] = await tx
			.insert(accountingEntries)
			.values({
				organizacaoId,
				origemTipo: "CONCILIACAO",
				titulo: entryTitle,
				anotacoes: anotacoes ?? null,
				idContaDebito: contaContabilDebitoId,
				idContaCredito: contaContabilCreditoId,
				valor: linha.valor,
				dataCompetencia: linha.dataTransacao,
				autorId,
			})
			.returning({ id: accountingEntries.id });

		await writeDefaultAccountingEntryLines({
			trx: tx,
			organizationId: organizacaoId,
			accountingEntryId: entry.id,
			entryValue: linha.valor,
			debitAccountId: contaContabilDebitoId,
			creditAccountId: contaContabilCreditoId,
		});

		const [transaction] = await tx
			.insert(financialTransactions)
			.values({
				organizacaoId,
				lancamentoContabilId: entry.id,
				contaFinanceiraId: linha.contaFinanceiraId,
				titulo: entryTitle,
				tipo: linha.tipo,
				...normalizeFinancialTransactionValue({ valor: linha.valor }),
				metodo: linha.metodo ?? "OUTRO",
				dataPrevisao: linha.dataTransacao,
				dataEfetivacao: linha.dataTransacao,
				efetivacaoAutorId: autorId,
				efetivacaoOrigem: "CONCILIACAO",
				autorId,
			})
			.returning({ id: financialTransactions.id });

		await tx.insert(financialReconciliationMatches).values({
			organizacaoId,
			extratoTransacaoId: linha.id,
			transacaoFinanceiraId: transaction.id,
			tipo: "MANUAL",
			confianca: null,
			status: "CONFIRMADO",
			acao: "LANCAMENTO_CRIADO",
			autorId,
		});

		await tx.update(financialStatementTransactions).set({ status: "CONCILIADA" }).where(eq(financialStatementTransactions.id, linha.id));

		await learnReconciliationRule({
			trx: tx,
			organizacaoId,
			descricao: linha.descricao,
			tipo: linha.tipo,
			contaContabilDebitoId,
			contaContabilCreditoId,
			metodo: linha.metodo,
		});

		return { lancamentoId: entry.id, transacaoId: transaction.id };
	});

	return result;
}

/** Ignora (ou restaura) uma linha do extrato — tarifas irrelevantes, estornos, ruído. */
export async function setStatementLineIgnored({ organizacaoId, linhaId, ignorada }: { organizacaoId: string; linhaId: string; ignorada: boolean }) {
	const linha = await db.query.financialStatementTransactions.findFirst({
		where: and(eq(financialStatementTransactions.id, linhaId), eq(financialStatementTransactions.organizacaoId, organizacaoId)),
		columns: { id: true, status: true },
	});
	if (!linha) throw new createHttpError.NotFound("Linha do extrato não encontrada.");
	if (linha.status === "CONCILIADA") throw new createHttpError.BadRequest("Linhas conciliadas não podem ser ignoradas.");

	if (ignorada) {
		await db.update(financialStatementTransactions).set({ status: "IGNORADA" }).where(eq(financialStatementTransactions.id, linhaId));
		return { linhaId, status: "IGNORADA" as const };
	}
	await db.update(financialStatementTransactions).set({ status: "PENDENTE" }).where(eq(financialStatementTransactions.id, linhaId));
	await refreshStatementLineStatus({ organizacaoId, linhaId });
	return { linhaId, status: "PENDENTE" as const };
}
