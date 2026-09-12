import type { TPaymentMethodEnum } from "@/schemas/enums";
import { SALE_CHANGE_TRANSACTION_ORIGIN } from "@/lib/sales/sale-change";
import { db } from "@/services/drizzle";
import { accountingEntries, financialAccounts, financialTransactions, sales } from "@/services/drizzle/schema";
import { and, count, countDistinct, eq, inArray, notExists, sql, sum } from "drizzle-orm";
import { computeShare } from "./classify";
import { reconcilePaymentTotals } from "./payment-reconciliation";
import { buildSalesUniverseConditions, buildSalesUniverseIdsSubquery, type TSalesResultsFilters } from "./universe";

/**
 * Recebimentos por método, em regime de competência: a transação é atribuída à data da venda que
 * a originou (`sales.dataVenda`), via `accountingEntries.vendaId` → `financialTransactions`.
 * Uma venda parcelada aparece inteira no método, dividida entre efetivado e pendente. As linhas
 * preservam a composição bruta por método; o total líquido desconta troco e taxas de canal e usa
 * o valor da venda como teto para absorver troco legado ainda sem SAÍDA persistida.
 *
 * A contagem de vendas por linha usa o mesmo predicado do filtro de método no histórico (qualquer
 * movimentação não cancelada, ENTRADA ou SAÍDA): a venda paga em PIX cujo troco saiu em espécie
 * conta na linha DINHEIRO, que é onde o fluxo dela aparece — e é onde o clique leva.
 *
 * O que entrou nas contas no período é pergunta do financeiro (fluxo de caixa por
 * `dataEfetivacao`), não deste relatório.
 */
function round2(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getSalesResultsByPaymentMethod({ filters }: { filters: TSalesResultsFilters }) {
	const universeIds = buildSalesUniverseIdsSubquery(filters, "CONFIRMADA");

	const [rows, outflowRows, movementCountRows, reconciliationRows, [coverageRow], [universeRow]] = await Promise.all([
		db
			.select({
				metodo: financialTransactions.metodo,
				contaFinanceiraId: financialTransactions.contaFinanceiraId,
				contaFinanceiraNome: financialAccounts.nome,
				contaFinanceiraTipo: financialAccounts.tipo,
				contaFinanceiraChaveSistema: financialAccounts.chaveSistema,
				valor: sum(financialTransactions.valor),
				valorEfetivado: sql<string>`coalesce(sum(case when ${financialTransactions.dataEfetivacao} is not null then ${financialTransactions.valor} else 0 end), 0)`,
				valorPendente: sql<string>`coalesce(sum(case when ${financialTransactions.dataEfetivacao} is null then ${financialTransactions.valor} else 0 end), 0)`,
				valorTaxas: sum(financialTransactions.valorTaxas),
			})
			.from(financialTransactions)
			.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
			.leftJoin(financialAccounts, eq(financialTransactions.contaFinanceiraId, financialAccounts.id))
			.where(
				and(
					eq(financialTransactions.organizacaoId, filters.organizacaoId),
					eq(financialTransactions.tipo, "ENTRADA"),
					eq(accountingEntries.origemTipo, "VENDA"),
					inArray(accountingEntries.vendaId, universeIds),
				),
			)
			.groupBy(
				financialTransactions.metodo,
				financialTransactions.contaFinanceiraId,
				financialAccounts.nome,
				financialAccounts.tipo,
				financialAccounts.chaveSistema,
			),
		// O que saiu por método: troco devolvido ao cliente (SAÍDA com origem TROCO, sempre em
		// dinheiro) e taxas retidas pelo canal. É o que explica "entrou X, mas ficou Y" em cada linha.
		db
			.select({
				metodo: financialTransactions.metodo,
				troco: sql<string>`coalesce(sum(case when ${financialTransactions.modificadoresMetadata}->>'origem' = ${SALE_CHANGE_TRANSACTION_ORIGIN} then ${financialTransactions.valor} else 0 end), 0)`,
				taxasCanal: sql<string>`coalesce(sum(case when ${accountingEntries.chaveIdempotencia} like 'taxas-canal:%' then ${financialTransactions.valor} else 0 end), 0)`,
			})
			.from(financialTransactions)
			.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
			.where(
				and(
					eq(financialTransactions.organizacaoId, filters.organizacaoId),
					eq(financialTransactions.tipo, "SAIDA"),
					eq(accountingEntries.origemTipo, "VENDA"),
					inArray(accountingEntries.vendaId, universeIds),
					sql`coalesce(${financialTransactions.provedorStatus}, '') not in ('CANCELADO', 'ESTORNADO')`,
				),
			)
			.groupBy(financialTransactions.metodo),
		// Vendas com movimentação no método — mesmo predicado de `getPaymentMethodCondition` no
		// histórico, para a contagem da linha e o resultado do clique serem o mesmo conjunto.
		db
			.select({
				metodo: financialTransactions.metodo,
				qtdeVendas: countDistinct(accountingEntries.vendaId),
			})
			.from(financialTransactions)
			.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
			.where(
				and(
					eq(financialTransactions.organizacaoId, filters.organizacaoId),
					eq(accountingEntries.origemTipo, "VENDA"),
					inArray(accountingEntries.vendaId, universeIds),
					sql`coalesce(${financialTransactions.provedorStatus}, '') not in ('CANCELADO', 'ESTORNADO')`,
				),
			)
			.groupBy(financialTransactions.metodo),
		db
			.select({
				valorVenda: sales.valorTotal,
				valorEntradas: sql<string>`coalesce(sum(case when ${financialTransactions.tipo} = 'ENTRADA' then ${financialTransactions.valor} else 0 end), 0)`,
				valorDinheiro: sql<string>`coalesce(sum(case when ${financialTransactions.tipo} = 'ENTRADA' and ${financialTransactions.metodo} = 'DINHEIRO' then ${financialTransactions.valor} else 0 end), 0)`,
				trocoRegistrado: sql<string>`coalesce(sum(case when ${financialTransactions.tipo} = 'SAIDA' and ${financialTransactions.modificadoresMetadata}->>'origem' = ${SALE_CHANGE_TRANSACTION_ORIGIN} and coalesce(${financialTransactions.provedorStatus}, '') not in ('CANCELADO', 'ESTORNADO') then ${financialTransactions.valor} else 0 end), 0)`,
				taxasCanal: sql<string>`coalesce(sum(case when ${financialTransactions.tipo} = 'SAIDA' and ${accountingEntries.chaveIdempotencia} like 'taxas-canal:%' and coalesce(${financialTransactions.provedorStatus}, '') not in ('CANCELADO', 'ESTORNADO') then ${financialTransactions.valor} else 0 end), 0)`,
			})
			.from(sales)
			.innerJoin(accountingEntries, eq(accountingEntries.vendaId, sales.id))
			.innerJoin(financialTransactions, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
			.where(
				and(
					...buildSalesUniverseConditions(filters, "CONFIRMADA"),
					eq(accountingEntries.organizacaoId, filters.organizacaoId),
					eq(accountingEntries.origemTipo, "VENDA"),
					eq(financialTransactions.organizacaoId, filters.organizacaoId),
				),
			)
			.groupBy(sales.id, sales.valorTotal),
		// Vendas do universo SEM nenhuma transação de pagamento (processadas externamente, ou
		// anteriores ao ERP): explicam por que Σ recebimentos difere do faturamento.
		db
			.select({ qtde: count(sales.id), valor: sum(sales.valorTotal) })
			.from(sales)
			.where(
				and(
					...buildSalesUniverseConditions(filters, "CONFIRMADA"),
					notExists(
						db
							.select({ id: financialTransactions.id })
							.from(financialTransactions)
							.innerJoin(accountingEntries, eq(financialTransactions.lancamentoContabilId, accountingEntries.id))
							.where(and(eq(accountingEntries.vendaId, sales.id), eq(accountingEntries.origemTipo, "VENDA"), eq(financialTransactions.tipo, "ENTRADA"))),
					),
				),
			),
		db
			.select({ qtde: count(sales.id) })
			.from(sales)
			.where(and(...buildSalesUniverseConditions(filters, "CONFIRMADA"))),
	]);

	const reconciliation = reconcilePaymentTotals(
		reconciliationRows.map((row) => ({
			valorVenda: row.valorVenda,
			valorEntradas: Number(row.valorEntradas),
			valorDinheiro: Number(row.valorDinheiro),
			trocoRegistrado: Number(row.trocoRegistrado),
			taxasCanal: Number(row.taxasCanal),
		})),
	);
	const totalRecebido = reconciliation.totalRecebido;
	// Troco devolvido além do dinheiro recebido na própria venda (pagou PIX, levou troco em espécie):
	// sai da linha DINHEIRO sem entrada correspondente, e a linha explicita essa parcela.
	const trocoDeOutrosMetodos = round2(
		reconciliationRows.reduce((acc, row) => acc + Math.max(0, Number(row.trocoRegistrado) - Number(row.valorDinheiro)), 0),
	);

	// Uma linha por método que teve entrada OU saída: taxas de canal podem sair por um método sem
	// entrada própria, e a linha precisa existir para o fluxo fechar.
	const outflowByMethod = new Map(
		outflowRows.map((row) => [row.metodo as TPaymentMethodEnum, { troco: Number(row.troco), taxasCanal: Number(row.taxasCanal) }]),
	);
	const countByMethod = new Map(movementCountRows.map((row) => [row.metodo as TPaymentMethodEnum, row.qtdeVendas]));
	const methods = new Set<TPaymentMethodEnum>([
		...rows.map((row) => row.metodo as TPaymentMethodEnum),
		...outflowByMethod.keys(),
		...countByMethod.keys(),
	]);
	const linhas = Array.from(methods)
		.map((metodo) => {
			const methodRows = rows.filter((candidate) => candidate.metodo === metodo);
			const outflow = outflowByMethod.get(metodo) ?? {
				troco: 0,
				taxasCanal: 0,
			};
			// Troco legado (sem SAÍDA persistida) só existe em dinheiro; entra na linha para o líquido bater com o total.
			const troco = round2(outflow.troco + (metodo === "DINHEIRO" ? reconciliation.ajustes.trocoInferido : 0));
			const valor = methodRows.reduce((total, row) => total + Number(row.valor ?? 0), 0);
			const valorEfetivado = methodRows.reduce((total, row) => total + Number(row.valorEfetivado ?? 0), 0);
			const valorPendente = methodRows.reduce((total, row) => total + Number(row.valorPendente ?? 0), 0);
			const valorTaxas = methodRows.reduce((total, row) => total + Number(row.valorTaxas ?? 0), 0);
			const contas = methodRows
				.map((row) => ({
					contaFinanceiraId: row.contaFinanceiraId,
					contaFinanceiraNome: row.contaFinanceiraNome ?? "Sem conta financeira",
					contaFinanceiraTipo: row.contaFinanceiraTipo,
					contaFinanceiraChaveSistema: row.contaFinanceiraChaveSistema,
					valor: Number(row.valor ?? 0),
					valorEfetivado: Number(row.valorEfetivado ?? 0),
					valorPendente: Number(row.valorPendente ?? 0),
					participacaoPercentual: computeShare(Number(row.valor ?? 0), valor),
				}))
				.sort((a, b) => b.valor - a.valor);
			const saidas = {
				troco,
				trocoDeOutrosMetodos: metodo === "DINHEIRO" ? trocoDeOutrosMetodos : 0,
				taxasCanal: outflow.taxasCanal,
				total: round2(troco + outflow.taxasCanal),
			};
			return {
				metodo,
				valor,
				qtdeVendas: countByMethod.get(metodo) ?? 0,
				valorEfetivado,
				valorPendente,
				valorTaxas,
				contas,
				saidas,
				valorLiquido: round2(valor - saidas.total),
				participacaoPercentual: computeShare(valor, reconciliation.totalBruto),
			};
		})
		.sort((a, b) => b.valor - a.valor);

	const vendasSemPagamento = coverageRow.qtde;
	return {
		linhas,
		totalRecebido,
		totalBruto: reconciliation.totalBruto,
		ajustes: reconciliation.ajustes,
		cobertura: {
			vendasComPagamento: universeRow.qtde - vendasSemPagamento,
			vendasSemPagamento,
			valorSemPagamento: Number(coverageRow.valor ?? 0),
		},
	};
}
export type TSalesResultsByPaymentMethod = Awaited<ReturnType<typeof getSalesResultsByPaymentMethod>>;
