import type { DBTransaction } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions, cashbackPrograms } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
	SALE_CLIENT_REASSIGNMENT_CASHBACK_REASON,
	accumulateCashbackForClient,
	calculateAccumulatedCashbackValue,
	notReversedByClientReassignment,
} from "./accumulation";
import { reverseSaleCashback } from "./reverse-sale-cashback";

/**
 * Cashback de uma venda reatribuída de um cliente para outro.
 *
 * Saída: reverte os ACÚMULOs do cliente anterior (só os dele — o do parceiro fica) pelo caminho
 * único de reversão, que devolve o que ainda resta e registra CANCELAMENTO. O que o cliente
 * anterior já gastou não é cobrado de volta: fica no log da edição como "não estornado", a mesma
 * regra do cancelamento.
 *
 * Entrada: acumula para o novo cliente com a data da venda, para a validade não se estender por
 * causa da troca. A elegibilidade (venda que já acumulava ou está totalmente paga) é do chamador;
 * o que fica aqui é a mesma guarda de idempotência do acúmulo, que ignora linhas revertidas por
 * reatribuição (vai-e-volta A → B → A acumula de novo para A).
 *
 * Plano: docs/dev-planning/sale-client-reassignment-plan.md.
 */

export { SALE_CLIENT_REASSIGNMENT_CASHBACK_REASON };

export type TSaleCashbackTransferPreview = {
	// Quanto do acúmulo do cliente atual ainda pode ser estornado (valor restante dos ACÚMULOs vivos).
	estornavel: number;
	// Quanto o cliente atual já consumiu e por isso não será cobrado de volta.
	naoEstornavel: number;
	// Quanto o novo cliente acumularia (0 quando a venda não acumula: programa inativo, valor abaixo
	// do mínimo, ou o novo cliente já tem acúmulo vivo nesta venda).
	acumuloPrevisto: number;
};

const normalizeValue = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

function buyerAccumulationsWhere({ organizationId, saleId, clientId }: { organizationId: string; saleId: string; clientId: string }) {
	return and(
		eq(cashbackProgramTransactions.organizacaoId, organizationId),
		eq(cashbackProgramTransactions.vendaId, saleId),
		eq(cashbackProgramTransactions.clienteId, clientId),
		eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
		inArray(cashbackProgramTransactions.status, ["ATIVO", "CONSUMIDO"]),
	);
}

/** A venda já acumulou para este cliente (vivo ou consumido)? Decide se o novo cliente acumula agora. */
export async function saleHasBuyerAccumulation({
	tx,
	organizationId,
	saleId,
	clientId,
}: {
	tx: Pick<DBTransaction, "query">;
	organizationId: string;
	saleId: string;
	clientId: string;
}) {
	const existing = await tx.query.cashbackProgramTransactions.findFirst({
		where: buyerAccumulationsWhere({ organizationId, saleId, clientId }),
		columns: { id: true },
	});
	return !!existing;
}

export async function previewSaleCashbackTransfer({
	tx,
	organizationId,
	saleId,
	saleValue,
	currentClientId,
	nextClientId,
	nextClientAccumulationEligible,
}: {
	tx: Pick<DBTransaction, "query">;
	organizationId: string;
	saleId: string;
	saleValue: number;
	currentClientId: string | null;
	nextClientId: string | null;
	nextClientAccumulationEligible: boolean;
}): Promise<TSaleCashbackTransferPreview> {
	const accumulations = currentClientId
		? await tx.query.cashbackProgramTransactions.findMany({
				where: buyerAccumulationsWhere({ organizationId, saleId, clientId: currentClientId }),
				columns: { valor: true, valorRestante: true, programaId: true },
			})
		: [];

	let estornavel = 0;
	let naoEstornavel = 0;
	for (const accumulation of accumulations) {
		const balance = await tx.query.cashbackProgramBalances.findFirst({
			where: and(
				eq(cashbackProgramBalances.organizacaoId, organizationId),
				eq(cashbackProgramBalances.clienteId, currentClientId as string),
				eq(cashbackProgramBalances.programaId, accumulation.programaId),
			),
			columns: { saldoValorDisponivel: true },
		});
		// Mesmo teto da reversão: nunca leva o saldo do cliente atual abaixo de zero.
		const reversible = Math.max(0, Math.min(accumulation.valorRestante, balance?.saldoValorDisponivel ?? 0));
		estornavel += reversible;
		naoEstornavel += Math.max(0, accumulation.valor - reversible);
	}

	let acumuloPrevisto = 0;
	if (nextClientId && nextClientAccumulationEligible) {
		// Mesma guarda do acúmulo: o novo cliente já tem linha nesta venda que não foi revertida por
		// reatribuição (ex.: expirou naturalmente) → não acumula de novo.
		const guardingRow = await tx.query.cashbackProgramTransactions.findFirst({
			where: and(
				eq(cashbackProgramTransactions.organizacaoId, organizationId),
				eq(cashbackProgramTransactions.vendaId, saleId),
				eq(cashbackProgramTransactions.clienteId, nextClientId),
				eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
				notReversedByClientReassignment(),
			),
			columns: { id: true },
		});
		const program = guardingRow
			? null
			: await tx.query.cashbackPrograms.findFirst({
					where: and(eq(cashbackPrograms.organizacaoId, organizationId), eq(cashbackPrograms.ativo, true)),
					columns: { acumuloTipo: true, acumuloValor: true, acumuloRegraValorMinimo: true },
				});
		if (program) {
			acumuloPrevisto = calculateAccumulatedCashbackValue({
				accumulationType: program.acumuloTipo,
				accumulationValue: program.acumuloValor,
				minimumSaleValue: program.acumuloRegraValorMinimo,
				saleValue,
			});
		}
	}

	return { estornavel: normalizeValue(estornavel), naoEstornavel: normalizeValue(naoEstornavel), acumuloPrevisto: normalizeValue(acumuloPrevisto) };
}

export async function transferSaleCashbackAccumulation({
	tx,
	organizationId,
	saleId,
	saleValue,
	saleDate,
	currentClientId,
	nextClientId,
	nextClientAccumulationEligible,
	operatorId,
	operatorSellerId,
}: {
	tx: DBTransaction;
	organizationId: string;
	saleId: string;
	saleValue: number;
	saleDate: Date | null;
	currentClientId: string | null;
	nextClientId: string | null;
	nextClientAccumulationEligible: boolean;
	operatorId?: string | null;
	operatorSellerId?: string | null;
}) {
	const reversal = currentClientId
		? await reverseSaleCashback({
				tx,
				saleId,
				clientId: currentClientId,
				organizationId,
				reason: SALE_CLIENT_REASSIGNMENT_CASHBACK_REASON,
				scope: "buyer-accumulations",
			})
		: null;
	const estornado = normalizeValue(reversal?.totalReversedAmount ?? 0);
	const naoEstornado = normalizeValue(Math.max(0, (reversal?.totalOriginalAccumulatedAmount ?? 0) - estornado));

	let acumulado = 0;
	if (nextClientId && nextClientAccumulationEligible) {
		const program = await tx.query.cashbackPrograms.findFirst({
			where: and(eq(cashbackPrograms.organizacaoId, organizationId), eq(cashbackPrograms.ativo, true)),
		});
		if (program) {
			const accumulation = await accumulateCashbackForClient({
				tx,
				orgId: organizationId,
				clientId: nextClientId,
				saleId,
				saleValue,
				operatorId: operatorId ?? null,
				operatorSellerId: operatorSellerId ?? null,
				program,
				createdAt: saleDate ?? undefined,
				metadata: { origem: "REATRIBUICAO_CLIENTE", clienteAnteriorId: currentClientId },
			});
			acumulado = normalizeValue(accumulation.accumulatedValue);
		}
	}

	return {
		estornado,
		naoEstornado,
		acumulado,
		interacoesCanceladas: reversal?.canceledInteractionsCount ?? 0,
	};
}
