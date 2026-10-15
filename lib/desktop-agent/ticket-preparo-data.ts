import { splitPreparationTicketByStation } from "@/lib/sales/preparation-stations";
import { loadPreparationStationsForOrganization } from "@/lib/sales/preparation-stations-db";
import {
	PREPARATION_DELIVERY_MODE_LABELS,
	PREPARATION_ITEMS_WITH,
	type TPreparationTicketItem,
	mapPreparationTicketItems,
} from "@/lib/sales/preparation-tickets";
import { db } from "@/services/drizzle";
import { sales, tabOrders } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import type { TTicketPreparoDados } from "./templates/ticket-preparo";

// Builders únicos dos `dados` do TICKET_PREPARO — consumidos pela impressão manual (board/rota de
// gestão) e pelo auto-print. Mesmo mapeamento de itens do board (/api/sales/preparation): o que
// a cozinha vê na tela e no papel nunca diverge.
// Um ticket por estação de preparo (docs/dev-planning/preparation-stations-plan.md). Org sem
// estação ativa: um único ticket com `estacaoId: null`, idêntico ao de antes das estações.

export type TTicketPreparoBuildEntry = {
	estacaoId: string | null;
	dados: TTicketPreparoDados;
};

type TTicketPreparoHeader = Omit<TTicketPreparoDados, "itens" | "estacao">;

function toTicketItem(item: TPreparationTicketItem & { destaque: boolean }): TTicketPreparoDados["itens"][number] {
	return {
		nome: item.nome,
		quantidade: item.quantidade,
		observacoes: item.observacoes,
		gruposAdicionais: item.gruposAdicionais,
		destaque: item.destaque,
	};
}

async function splitTicketPreparoByStation({
	organizacaoId,
	header,
	itens,
}: {
	organizacaoId: string;
	header: TTicketPreparoHeader;
	itens: TPreparationTicketItem[];
}): Promise<TTicketPreparoBuildEntry[]> {
	const { stations, rules } = await loadPreparationStationsForOrganization({ organizacaoId });
	const entries = splitPreparationTicketByStation({ itens, rules, stations });

	if (entries.length === 0) {
		return [{ estacaoId: null, dados: { ...header, estacao: null, itens: itens.map((item) => toTicketItem({ ...item, destaque: true })) } }];
	}

	return entries.map(({ estacao, itens: stationItems }) => ({
		estacaoId: estacao.id,
		dados: { ...header, estacao: { id: estacao.id, nome: estacao.nome }, itens: stationItems.map(toTicketItem) },
	}));
}

export async function buildTicketPreparoDadosFromSale({
	organizacaoId,
	vendaId,
}: {
	organizacaoId: string;
	vendaId: string;
}): Promise<TTicketPreparoBuildEntry[]> {
	const sale = await db.query.sales.findFirst({
		where: and(eq(sales.id, vendaId), eq(sales.organizacaoId, organizacaoId)),
		columns: { id: true, dataVenda: true, canal: true, entregaModalidade: true, comandaNumero: true, observacoes: true },
		with: {
			cliente: { columns: { nome: true } },
			itens: PREPARATION_ITEMS_WITH,
		},
	});
	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");

	const itens = mapPreparationTicketItems(sale.itens);
	if (itens.length === 0) throw new createHttpError.BadRequest("A venda não possui itens para preparo.");

	return await splitTicketPreparoByStation({
		organizacaoId,
		itens,
		header: {
			etiqueta: sale.comandaNumero ?? PREPARATION_DELIVERY_MODE_LABELS[sale.entregaModalidade ?? ""] ?? "Venda",
			numeroPedido: null,
			origem: "VENDA",
			modalidade: sale.entregaModalidade,
			canal: sale.canal,
			data: sale.dataVenda ?? new Date(),
			clienteNome: sale.cliente?.nome ?? null,
			codigoInterno: sale.id.slice(0, 8).toUpperCase(),
			observacoes: sale.observacoes?.trim() || null,
		},
	});
}

export async function buildTicketPreparoDadosFromTabOrder({
	organizacaoId,
	tabOrderId,
}: {
	organizacaoId: string;
	tabOrderId: string;
}): Promise<TTicketPreparoBuildEntry[]> {
	const order = await db.query.tabOrders.findFirst({
		where: and(eq(tabOrders.id, tabOrderId), eq(tabOrders.organizacaoId, organizacaoId)),
		with: {
			tab: {
				columns: { id: true, codigo: true },
				with: {
					servicePoint: { columns: { rotulo: true } },
					cliente: { columns: { nome: true } },
				},
			},
			itens: PREPARATION_ITEMS_WITH,
		},
	});
	if (!order) throw new createHttpError.NotFound("Pedido não encontrado.");

	const itens = mapPreparationTicketItems(order.itens);
	if (itens.length === 0) throw new createHttpError.BadRequest("O pedido não possui itens para preparo.");

	return await splitTicketPreparoByStation({
		organizacaoId,
		itens,
		header: {
			etiqueta: order.tab.servicePoint?.rotulo ?? (order.tab.codigo ? `Comanda ${order.tab.codigo}` : "Conta"),
			numeroPedido: order.numero,
			origem: "PEDIDO_CONTA",
			modalidade: "COMANDA",
			canal: "COMANDA",
			data: order.dataEnvio,
			clienteNome: order.tab.cliente?.nome ?? null,
			codigoInterno: null,
			observacoes: order.observacoes?.trim() || null,
		},
	});
}
