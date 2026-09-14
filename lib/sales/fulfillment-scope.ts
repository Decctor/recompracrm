import { sales } from "@/services/drizzle/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import type { TChannelErpPolicy } from "./fulfillment-channels";

/**
 * Etapas que sao fila de trabalho: o pedido entrou e ainda nao foi entregue. ENTREGUE e terminal
 * (nenhuma transicao sai dele), entao nao pertence a este conjunto.
 */
export const ACTIVE_ATTENDANCE_STATUSES = ["NAO_INICIADO", "EM_PREPARO", "PRONTO", "EM_ENTREGA"] as const;

/**
 * Recorte de proveniencia do quadro: vendas internas sempre; vendas de canal gerenciado (ex.: iFood)
 * apenas quando a politica de fulfillment de integracoes esta ligada.
 */
export function buildFulfillmentOriginFilter(policy: TChannelErpPolicy) {
	return policy.fulfillment
		? or(eq(sales.processamentoOrigem, "INTERNO"), and(eq(sales.processamentoOrigem, "EXTERNO"), eq(sales.modelo, "IFOOD")))
		: eq(sales.processamentoOrigem, "INTERNO");
}

/**
 * Populacao das colunas ativas do quadro. Mora aqui, e nao na rota, porque a contagem da sidebar
 * (`/api/sales/fulfillment/pending`) so vale se contar exatamente as mesmas linhas que o quadro
 * mostra — um recorte duplicado divergiria no primeiro ajuste de qualquer um dos dois lados.
 */
export function buildActiveFulfillmentWhere({ organizationId, policy }: { organizationId: string; policy: TChannelErpPolicy }) {
	return and(
		eq(sales.organizacaoId, organizationId),
		eq(sales.statusVenda, "CONFIRMADA"),
		inArray(sales.statusAtendimento, [...ACTIVE_ATTENDANCE_STATUSES]),
		buildFulfillmentOriginFilter(policy),
	);
}
