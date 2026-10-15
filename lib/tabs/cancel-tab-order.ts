import { applyStockMovement } from "@/lib/stock/apply-stock-movement";
import { db } from "@/services/drizzle";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { saleItems, tabOrders, tabs } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { assertTabCoversPartialPayments, recomputeTabDraftSaleTotals } from "./utils";

export type TCancelTabOrderInput = {
	tabOrderId: string;
	// Pedido ja entregue: o cancelamento e um estorno explicito. true = devolve o estoque
	// (ENTRADA_DEVOLUCAO); false = mantem a saida como registro fisico honesto (perda vira
	// ajuste manual). Obrigatorio quando houver itens entregues.
	devolverEstoque?: boolean | null;
	motivo?: string | null;
};

/**
 * Cancela um pedido (rodada) da conta:
 * - pedido nao entregue: status -> CANCELADO; itens marcam quantidadeCancelada = quantidade
 *   (marcar, nao deletar — preserva o historico do que foi pedido) e saem dos totais;
 * - pedido entregue: exige decisao explicita de estoque (devolverEstoque).
 */
export async function cancelTabOrder({
	organization,
	userId,
	input,
}: {
	organization: TOrganizationEntity;
	userId: string;
	input: TCancelTabOrderInput;
}) {
	const order = await db.query.tabOrders.findFirst({
		where: and(eq(tabOrders.id, input.tabOrderId), eq(tabOrders.organizacaoId, organization.id)),
		with: {
			itens: { with: { adicionais: true } },
		},
	});
	if (!order) throw new createHttpError.NotFound("Pedido nao encontrado.");
	if (order.status === "CANCELADO") throw new createHttpError.BadRequest("Pedido ja esta cancelado.");

	const deliveredItems = order.itens.filter((item) => (item.quantidadeEntregue ?? 0) > 0);
	if (deliveredItems.length > 0 && typeof input.devolverEstoque !== "boolean") {
		throw new createHttpError.BadRequest("O pedido possui itens entregues. Informe se o estoque deve ser devolvido.");
	}

	return db.transaction(async (tx) => {
		// Lock da tab: serializa contra fechamento da conta.
		const [tab] = await tx.select({ id: tabs.id, status: tabs.status }).from(tabs).where(eq(tabs.id, order.tabId)).for("update");
		if (!tab || tab.status !== "ABERTA") throw new createHttpError.BadRequest("A conta deste pedido nao esta aberta.");

		const cancelledRows = await tx
			.update(tabOrders)
			.set({ status: "CANCELADO", observacoes: input.motivo ? `${order.observacoes ?? ""}\n[CANCELAMENTO] ${input.motivo}`.trim() : order.observacoes })
			.where(and(eq(tabOrders.id, order.id), eq(tabOrders.status, order.status)))
			.returning({ id: tabOrders.id });
		if (cancelledRows.length === 0) {
			throw new createHttpError.Conflict("O pedido foi alterado por outra operacao. Atualize e tente novamente.");
		}

		// Devolucao fisica dos itens ja entregues, quando solicitada. O estorno reverte
		// as SAIDAS realmente registradas para cada item (mesmos produtos, variantes e
		// quantidades da baixa original) — isso cobre composicao (insumos da ficha
		// tecnica), adicionais e splits de FEFO sem recalcular nada.
		if (input.devolverEstoque === true && deliveredItems.length > 0 && organization.configuracao.preferencias.rastreamentoEstoque) {
			const deliveredItemIds = deliveredItems.map((item) => item.id);
			const outboundTransactions = await tx.query.productStockTransactions.findMany({
				where: (fields, { and, eq, inArray }) =>
					and(inArray(fields.vendaItemId, deliveredItemIds), eq(fields.organizacaoId, organization.id), eq(fields.tipo, "SAIDA")),
				columns: { id: true, produtoId: true, produtoVarianteId: true, quantidade: true, vendaId: true, vendaItemId: true },
			});

			for (const transaction of outboundTransactions) {
				await applyStockMovement({
					trx: tx,
					organizationId: organization.id,
					userId,
					produtoId: transaction.produtoId,
					produtoVarianteId: transaction.produtoVarianteId,
					signedQuantity: transaction.quantidade,
					movementType: "ENTRADA_DEVOLUCAO",
					reason: `Pedido ${order.numero} cancelado (devolucao)`,
					links: { vendaId: transaction.vendaId, vendaItemId: transaction.vendaItemId },
				});
			}
		}

		// Marca os itens como cancelados (deliverable = 0 -> delta zero, nunca mais baixam).
		for (const item of order.itens) {
			await tx.update(saleItems).set({ quantidadeCancelada: item.quantidade }).where(eq(saleItems.id, item.id));
		}

		const saleId = order.itens[0]?.vendaId;
		const totals = saleId ? await recomputeTabDraftSaleTotals(tx, { saleId }) : null;
		// A conta nao pode ficar abaixo do que ja foi recebido em parciais; estorna-se um antes.
		if (totals) await assertTabCoversPartialPayments(tx, { tabId: tab.id, consumo: totals.valorTotal });

		return {
			tabOrderId: order.id,
			tabId: order.tabId,
			valorTotalConta: totals?.valorTotal ?? null,
		};
	});
}
export type TCancelTabOrderResult = Awaited<ReturnType<typeof cancelTabOrder>>;
