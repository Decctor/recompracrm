import { appApiHandler } from "@/lib/app-api";
import { requireERPSession } from "@/lib/authentication/erp-session";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import {
	PREPARATION_DELIVERY_MODE_LABELS,
	PREPARATION_ITEMS_WITH,
	PREPARATION_STATUSES,
	type TPreparationTicketItem,
	mapPreparationTicketItems,
} from "@/lib/sales/preparation-tickets";
import type { TSaleAttendanceStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { sales, tabOrders } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

// ============================================================================
// PREPARO — tickets unificados de preparo (docs/tabs/implementation-plan.md).
// Um grao de ticket, duas fontes: vendas confirmadas com preparo (delivery,
// retirada, integracoes — 1 venda = 1 ticket) e tabOrders ativos de contas
// abertas (comanda — 1 venda rascunho : N rodadas). O board e dono do trecho
// EM_PREPARO -> PRONTO do eixo de atendimento; zero pagamento, zero fiscal.
// ============================================================================

export type TPreparationTicket = {
	ticketId: string;
	origem: "VENDA" | "PEDIDO_CONTA";
	saleId: string | null;
	tabOrderId: string | null;
	tabId: string | null;
	numeroPedido: number | null;
	status: TSaleAttendanceStatusEnum;
	// Badge de origem no card: "Mesa 12", "Comanda 15", modalidade da venda...
	etiqueta: string;
	entregaModalidade: string | null;
	observacoes: string | null;
	clienteNome: string | null;
	data: Date | string;
	itens: TPreparationTicketItem[];
};

async function getPreparationTickets({ orgId }: { orgId: string }) {
	const [saleRows, orderRows] = await Promise.all([
		// Fonte 1: vendas confirmadas com preparo. Vendas de conta (tabId) nunca aparecem aqui:
		// enquanto abertas sao ORCAMENTO; ao fechar nascem ENTREGUE.
		db.query.sales.findMany({
			where: and(eq(sales.organizacaoId, orgId), eq(sales.statusVenda, "CONFIRMADA"), inArray(sales.statusAtendimento, [...PREPARATION_STATUSES])),
			columns: {
				id: true,
				statusAtendimento: true,
				entregaModalidade: true,
				comandaNumero: true,
				observacoes: true,
				dataVenda: true,
			},
			with: {
				cliente: { columns: { nome: true } },
				itens: PREPARATION_ITEMS_WITH,
			},
			orderBy: (fields, { asc }) => asc(fields.dataVenda),
		}),
		// Fonte 2: pedidos (rodadas) ativos de contas abertas.
		db.query.tabOrders.findMany({
			where: and(eq(tabOrders.organizacaoId, orgId), inArray(tabOrders.status, [...PREPARATION_STATUSES])),
			with: {
				tab: {
					columns: { id: true, codigo: true, status: true },
					with: {
						servicePoint: { columns: { rotulo: true } },
						cliente: { columns: { nome: true } },
					},
				},
				itens: PREPARATION_ITEMS_WITH,
			},
			orderBy: (fields, { asc }) => asc(fields.dataEnvio),
		}),
	]);

	const saleTickets: TPreparationTicket[] = saleRows.map((sale) => ({
		ticketId: `venda:${sale.id}`,
		origem: "VENDA",
		saleId: sale.id,
		tabOrderId: null,
		tabId: null,
		numeroPedido: null,
		status: sale.statusAtendimento,
		etiqueta: sale.comandaNumero ?? PREPARATION_DELIVERY_MODE_LABELS[sale.entregaModalidade ?? ""] ?? "Venda",
		entregaModalidade: sale.entregaModalidade,
		observacoes: sale.observacoes,
		clienteNome: sale.cliente?.nome ?? null,
		data: sale.dataVenda ?? new Date(),
		itens: mapPreparationTicketItems(sale.itens),
	}));

	const orderTickets: TPreparationTicket[] = orderRows
		.filter((order) => order.tab.status === "ABERTA")
		.map((order) => ({
			ticketId: `pedido:${order.id}`,
			origem: "PEDIDO_CONTA",
			saleId: null,
			tabOrderId: order.id,
			tabId: order.tab.id,
			numeroPedido: order.numero,
			status: order.status,
			etiqueta: order.tab.servicePoint?.rotulo ?? (order.tab.codigo ? `Comanda ${order.tab.codigo}` : "Conta"),
			entregaModalidade: "COMANDA",
			observacoes: order.observacoes,
			clienteNome: order.tab.cliente?.nome ?? null,
			data: order.dataEnvio,
			itens: mapPreparationTicketItems(order.itens),
		}));

	const tickets = [...saleTickets, ...orderTickets].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

	return {
		data: { tickets },
		message: "Tickets de preparo carregados com sucesso.",
	};
}
export type TGetPreparationOutput = Awaited<ReturnType<typeof getPreparationTickets>>;

async function getPreparationRoute(_request: NextRequest) {
	const session = requireERPSession(await getCurrentSessionUncached());

	const result = await getPreparationTickets({ orgId: session.membership!.organizacao.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getPreparationRoute });
