import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getChannelErpPolicy, type TChannelErpPolicy } from "@/lib/sales/fulfillment-channels";
import { buildActiveFulfillmentWhere } from "@/lib/sales/fulfillment-scope";
import { db } from "@/services/drizzle";
import { sales } from "@/services/drizzle/schema";
import { count } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Quantos pedidos ainda não foram entregues — o número que a badge de "Pedidos" exibe na sidebar.
 *
 * É deliberadamente uma contagem da fila inteira, não das exceções (como faz o Fiscal): o que o
 * operador precisa saber de relance é quanto trabalho está aberto, e um pedido só sai da conta
 * quando é entregue ou cancelado.
 *
 * Só um `count(*)`, sem joins nem colunas de card: a badge é montada em toda página do dashboard e
 * repolada em segundo plano, então não pode custar o payload do quadro. O recorte vem de
 * `buildActiveFulfillmentWhere` para ser, por construção, o mesmo do quadro; o filtro roda sobre
 * `idx_sales_org_atendimento_data`.
 */
async function getSalesFulfillmentPending({ organizationId, policy }: { organizationId: string; policy: TChannelErpPolicy }) {
	const [row] = await db.select({ value: count() }).from(sales).where(buildActiveFulfillmentWhere({ organizationId, policy }));

	return { data: { total: row?.value ?? 0 }, message: "Pedidos em atendimento contados com sucesso." };
}
export type TGetSalesFulfillmentPendingOutput = Awaited<ReturnType<typeof getSalesFulfillmentPending>>;

// ============================================================================
// HANDLERS
// ============================================================================

async function getSalesFulfillmentPendingRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const sessionMembership = session.membership;
	if (!sessionMembership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	// Mesmo par de condições da capability `orders` (`lib/access/capabilities.ts`): quem não vê o
	// quadro não recebe a contagem dele. Sem permissão a query da badge falha em silêncio.
	if (!sessionMembership.organizacao.configuracao.recursos.erp.acesso) {
		throw new createHttpError.Forbidden("Sua organização não possui acesso ao módulo de ERP.");
	}
	if (!sessionMembership.permissoes.vendas.visualizar) {
		throw new createHttpError.Forbidden("Oops, você não possui permissão para visualizar pedidos.");
	}

	const policy = getChannelErpPolicy(sessionMembership.organizacao.configuracao);
	const result = await getSalesFulfillmentPending({ organizationId: sessionMembership.organizacao.id, policy });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSalesFulfillmentPendingRoute });
