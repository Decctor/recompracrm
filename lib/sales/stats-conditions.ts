import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import type { TSaleStatsGeneralQueryParams } from "@/schemas/query-params-utils";
import { db } from "@/services/drizzle";
import { clients, sales } from "@/services/drizzle/schema";
import { and, eq, exists, gte, inArray, lte, notInArray, type SQL } from "drizzle-orm";

export type TSalesStatsFilters = Omit<TSaleStatsGeneralQueryParams, "period">;

/**
 * Condições de venda confirmada que os relatórios comerciais compartilham, sem o período.
 *
 * O período fica de fora de propósito: o comparativo aplica o mesmo recorte (vendedores,
 * integrações, RFM, valor, vendas excluídas) a duas janelas diferentes, e cada janela entra
 * pelo `withinPeriod` abaixo. `max` usa `lte` — a versão original do resumo geral usava `gte`
 * para o teto, o que fazia "até R$ 100" significar "a partir de R$ 100".
 */
export function buildSalesStatsConditions({ organizacaoId, filters }: { organizacaoId: string; filters: TSalesStatsFilters }): SQL[] {
	const conditions: SQL[] = [eq(sales.organizacaoId, organizacaoId), eq(sales.statusVenda, "CONFIRMADA")];

	if (filters.total.min != null) conditions.push(gte(sales.valorTotal, filters.total.min));
	if (filters.total.max != null) conditions.push(lte(sales.valorTotal, filters.total.max));
	const integrationCondition = getSalesIntegrationCondition(filters.integrationsIds);
	if (integrationCondition) conditions.push(integrationCondition);
	if (filters.sellersIds.length > 0) conditions.push(inArray(sales.vendedorId, filters.sellersIds));
	if (filters.clientRFMTitles.length > 0)
		conditions.push(
			exists(
				db
					.select({ id: clients.id })
					.from(clients)
					.where(
						and(eq(clients.organizacaoId, organizacaoId), eq(clients.id, sales.clienteId), inArray(clients.analiseRFMTitulo, filters.clientRFMTitles)),
					),
			),
		);
	if (filters.excludedSalesIds.length > 0) conditions.push(notInArray(sales.id, filters.excludedSalesIds));

	return conditions;
}

/** Janela fechada de `dataVenda`, para somar às condições acima. */
export function withinPeriod(period: { after: Date; before: Date }): SQL[] {
	return [gte(sales.dataVenda, period.after), lte(sales.dataVenda, period.before)];
}
