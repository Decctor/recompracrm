import { getValidSaleConditions } from "@/lib/sales/valid-sale";
import type { DB, DBTransaction } from "@/services/drizzle";
import { campaignConversions, cashbackProgramTransactions, clients, interactions, sales } from "@/services/drizzle/schema";
import { and, asc, count, countDistinct, eq, gte, inArray, isNotNull, max, min, sql } from "drizzle-orm";
import type { TActivationSalesOrigin } from "./activation";
import type { TErpChannel } from "./erp-channels";

/**
 * O que a organização fez de fato desde o cadastro: vendas por origem, mensagens de campanha
 * entregues, resgates e clientes segmentados. Lido pela ativação do hub (`activation.ts`) e pela
 * sincronização com o Control (`lib/control/sync.ts`), para que os dois contem igual.
 *
 * Vendas anteriores ao cadastro são histórico importado, não uso da plataforma, e ficam de fora.
 */

export const DELIVERED_CAMPAIGN_STATUSES = ["ENTREGUE", "LIDO"] as const;

const WEEK_SECONDS = 7 * 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

type TSalesOriginKey = "BALCAO_POI" | "INTEGRACAO" | TErpChannel | "OUTRO";

export type TOrganizationActivity = {
	vendas: { balcao: TActivationSalesOrigin; integracao: TActivationSalesOrigin; erp: Record<TErpChannel, TActivationSalesOrigin> };
	primeiraVendaEm: Date | null;
	envios: { primeiraEntregaEm: Date | null; ultimaEntregaEm: Date | null; entregas14Dias: number };
	primeiroResgateEm: Date | null;
	/** Primeira compra atribuída a uma campanha: valor e o tempo entre a mensagem e a compra. */
	primeiraConversao: { em: Date; valor: number; minutos: number | null } | null;
	/** Primeiro cashback creditado desde o cadastro (saldo migrado de antes não conta). */
	primeiroCashback: { em: Date; valor: number } | null;
	/** Clientes distintos com compra atribuída a uma campanha. */
	conversoes: number;
	clientesSegmentados: number;
};

const EMPTY_ORIGIN: TActivationSalesOrigin = { primeiraEm: null, ultimaEm: null, semanas: 0, total: 0, diasUltimos7: 0 };

const toDate = (value: Date | string | null) => (value === null ? null : value instanceof Date ? value : new Date(value));

export async function loadOrganizationActivity({
	executor,
	organizationId,
	criadaEm,
	now,
}: {
	executor: DB | DBTransaction;
	organizationId: string;
	criadaEm: Date;
	now: Date;
}): Promise<TOrganizationActivity> {
	// Origem da venda: o Ponto de Interação grava processamento interno sem canal; PDV, loja digital
	// e comanda gravam o seu canal; integrações chegam como processamento externo.
	const origin = sql<TSalesOriginKey>`case
		when ${sales.processamentoOrigem} = 'INTERNO' and ${sales.canal} is null then 'BALCAO_POI'
		when ${sales.processamentoOrigem} = 'INTERNO' and ${sales.canal} = 'POS' then 'BALCAO'
		when ${sales.processamentoOrigem} = 'INTERNO' and ${sales.canal} = 'SHOP' then 'CATALOGO'
		when ${sales.processamentoOrigem} = 'INTERNO' and ${sales.canal} = 'COMANDA' then 'MESAS'
		when ${sales.processamentoOrigem} = 'EXTERNO' then 'INTEGRACAO'
		else 'OUTRO' end`;
	const deliveredCampaignMessages = and(
		eq(interactions.organizacaoId, organizationId),
		isNotNull(interactions.campanhaId),
		inArray(interactions.statusEnvio, [...DELIVERED_CAMPAIGN_STATUSES]),
	);

	const [salesRows, [deliveries], [recentDeliveries], [firstRedemption], [firstConversion], [segmented], [firstCashback], [conversions]] =
		await Promise.all([
			executor
				.select({
					origem: origin,
					primeira: min(sales.dataVenda),
					ultima: max(sales.dataVenda),
					semanas: sql<number>`count(distinct floor(extract(epoch from (${sales.dataVenda} - ${criadaEm.toISOString()}::timestamptz)) / ${WEEK_SECONDS}))::integer`,
					total: count(),
					diasUltimos7: sql<number>`count(distinct date_trunc('day', ${sales.dataVenda})) filter (where ${sales.dataVenda} >= ${new Date(now.getTime() - 7 * DAY_MS).toISOString()}::timestamptz)::integer`,
				})
				.from(sales)
				.where(and(...getValidSaleConditions({ orgId: organizationId }), gte(sales.dataVenda, criadaEm)))
				.groupBy(origin),
			executor
				.select({ primeira: min(interactions.dataInsercao), ultima: max(interactions.dataInsercao) })
				.from(interactions)
				.where(deliveredCampaignMessages),
			executor
				.select({ total: count() })
				.from(interactions)
				.where(and(deliveredCampaignMessages, gte(interactions.dataInsercao, new Date(now.getTime() - 14 * DAY_MS)))),
			executor
				.select({ at: min(cashbackProgramTransactions.dataInsercao) })
				.from(cashbackProgramTransactions)
				.where(and(eq(cashbackProgramTransactions.organizacaoId, organizationId), eq(cashbackProgramTransactions.tipo, "RESGATE"))),
			executor
				.select({ at: campaignConversions.dataConversao, valor: campaignConversions.vendaValor, minutos: campaignConversions.tempoParaConversaoMinutos })
				.from(campaignConversions)
				.where(eq(campaignConversions.organizacaoId, organizationId))
				.orderBy(asc(campaignConversions.dataConversao))
				.limit(1),
			executor
				.select({ total: count() })
				.from(clients)
				.where(and(eq(clients.organizacaoId, organizationId), isNotNull(clients.analiseRFMTitulo))),
			executor
				.select({ at: cashbackProgramTransactions.dataInsercao, valor: cashbackProgramTransactions.valor })
				.from(cashbackProgramTransactions)
				.where(
					and(
						eq(cashbackProgramTransactions.organizacaoId, organizationId),
						eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
						gte(cashbackProgramTransactions.dataInsercao, criadaEm),
					),
				)
				.orderBy(asc(cashbackProgramTransactions.dataInsercao))
				.limit(1),
			// Clientes distintos: a meta fala em "clientes de volta", e um cliente pode converter mais de uma vez.
			executor
				.select({ total: countDistinct(campaignConversions.clienteId) })
				.from(campaignConversions)
				.where(eq(campaignConversions.organizacaoId, organizationId)),
		]);

	const byOrigin = new Map(
		salesRows.map((row) => [
			row.origem,
			{
				primeiraEm: toDate(row.primeira),
				ultimaEm: toDate(row.ultima),
				semanas: Number(row.semanas) || 0,
				total: Number(row.total) || 0,
				diasUltimos7: Number(row.diasUltimos7) || 0,
			},
		]),
	);
	const originOf = (key: TSalesOriginKey) => byOrigin.get(key) ?? EMPTY_ORIGIN;
	const firstSale = [...byOrigin.values()]
		.map((row) => row.primeiraEm)
		.reduce<Date | null>((earliest, at) => (at && (!earliest || at < earliest) ? at : earliest), null);

	return {
		vendas: {
			balcao: originOf("BALCAO_POI"),
			integracao: originOf("INTEGRACAO"),
			erp: { BALCAO: originOf("BALCAO"), CATALOGO: originOf("CATALOGO"), MESAS: originOf("MESAS") },
		},
		primeiraVendaEm: firstSale,
		envios: {
			primeiraEntregaEm: toDate(deliveries?.primeira ?? null),
			ultimaEntregaEm: toDate(deliveries?.ultima ?? null),
			entregas14Dias: recentDeliveries?.total ?? 0,
		},
		primeiroResgateEm: toDate(firstRedemption?.at ?? null),
		primeiraConversao: firstConversion?.at
			? { em: toDate(firstConversion.at) as Date, valor: Number(firstConversion.valor) || 0, minutos: firstConversion.minutos ?? null }
			: null,
		primeiroCashback: firstCashback?.at ? { em: toDate(firstCashback.at) as Date, valor: Number(firstCashback.valor) || 0 } : null,
		conversoes: conversions?.total ?? 0,
		clientesSegmentados: segmented?.total ?? 0,
	};
}
