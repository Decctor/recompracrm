import type { DBTransaction } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions, cashbackPrograms } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { calculateAccumulatedCashbackValue } from "./accumulation";
import { hasCashbackPaymentAccrualRules } from "./payment-accrual";
import { computeInternalSaleAccrualBase } from "./sale-accrual-payments";

/**
 * Ressincroniza os ACÚMULOs de cashback de uma venda após edição de valor.
 *
 * Ajusta EM PLACE somente acúmulos ATIVOS e intocados (`valorRestante === valor`) — a criação de
 * um novo lançamento colidiria com a guarda de idempotência de `accumulateCashbackForClient`
 * (uma venda acumula no máximo uma vez por cliente, em qualquer status). Acúmulos já parcialmente
 * consumidos/expirados ficam como estão e a venda é marcada como desatualizada no log de edição —
 * a válvula de escape para corrigi-los é o cancelamento da venda.
 */

const EPSILON = 1e-6;

const normalizeValue = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

export async function resyncSaleCashbackAccumulation({
	tx,
	organizationId,
	saleId,
	newSaleValue,
	reason,
}: {
	tx: DBTransaction;
	organizationId: string;
	saleId: string;
	newSaleValue: number;
	reason: string;
}): Promise<{ ajustados: number; desatualizados: number }> {
	const accumulations = await tx.query.cashbackProgramTransactions.findMany({
		where: and(
			eq(cashbackProgramTransactions.organizacaoId, organizationId),
			eq(cashbackProgramTransactions.vendaId, saleId),
			eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
		),
	});

	let ajustados = 0;
	let desatualizados = 0;

	for (const transaction of accumulations) {
		const untouched = transaction.status === "ATIVO" && Math.abs(transaction.valorRestante - transaction.valor) < EPSILON;
		if (!untouched) {
			desatualizados += 1;
			continue;
		}

		const program = await tx.query.cashbackPrograms.findFirst({
			where: and(eq(cashbackPrograms.id, transaction.programaId), eq(cashbackPrograms.organizacaoId, organizationId)),
		});
		if (!program || !program.ativo) {
			desatualizados += 1;
			continue;
		}

		// Com regras por forma de pagamento, a base é recalculada sobre os pagamentos já editados.
		const accrualBase = hasCashbackPaymentAccrualRules(program)
			? await computeInternalSaleAccrualBase({ executor: tx, organizationId, saleId, saleTotal: newSaleValue, rules: program.acumuloRegrasPagamento })
			: null;
		const newValue = normalizeValue(
			calculateAccumulatedCashbackValue({
				accumulationType: program.acumuloTipo,
				accumulationValue: program.acumuloValor,
				minimumSaleValue: program.acumuloRegraValorMinimo,
				saleValue: newSaleValue,
				accrualBase,
			}),
		);
		const delta = normalizeValue(newValue - transaction.valor);
		if (Math.abs(delta) < EPSILON) continue;

		const balance = await tx.query.cashbackProgramBalances.findFirst({
			where: and(
				eq(cashbackProgramBalances.organizacaoId, organizationId),
				eq(cashbackProgramBalances.clienteId, transaction.clienteId),
				eq(cashbackProgramBalances.programaId, transaction.programaId),
			),
		});
		// Sem saldo, ou redução que deixaria o saldo negativo (cliente já gastou o valor): não força —
		// registra desatualização e segue.
		if (!balance || balance.saldoValorDisponivel + delta < -EPSILON) {
			desatualizados += 1;
			continue;
		}

		const now = new Date();
		await tx
			.update(cashbackProgramBalances)
			.set({
				saldoValorDisponivel: Math.max(0, normalizeValue(balance.saldoValorDisponivel + delta)),
				saldoValorAcumuladoTotal: Math.max(0, normalizeValue(balance.saldoValorAcumuladoTotal + delta)),
				dataAtualizacao: now,
			})
			.where(eq(cashbackProgramBalances.id, balance.id));

		const previousMetadata =
			transaction.metadados && typeof transaction.metadados === "object" && !Array.isArray(transaction.metadados)
				? (transaction.metadados as Record<string, unknown>)
				: {};
		const previousAdjustments = Array.isArray(previousMetadata.ajustesEdicao) ? previousMetadata.ajustesEdicao : [];

		await tx
			.update(cashbackProgramTransactions)
			.set({
				valor: newValue,
				valorRestante: newValue,
				vendaValor: newSaleValue,
				saldoValorPosterior: normalizeValue(transaction.saldoValorAnterior + newValue),
				status: newValue <= EPSILON ? "EXPIRADO" : "ATIVO",
				metadados: {
					...previousMetadata,
					ajustesEdicao: [...previousAdjustments, { data: now.toISOString(), valorAnterior: transaction.valor, valorNovo: newValue, motivo: reason }],
				},
				dataAtualizacao: now,
			})
			.where(eq(cashbackProgramTransactions.id, transaction.id));

		ajustados += 1;
	}

	return { ajustados, desatualizados };
}
