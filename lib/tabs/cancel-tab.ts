import { db } from "@/services/drizzle";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { saleItems, sales, tabOrders, tabs } from "@/services/drizzle/schema";
import { and, eq, ne } from "drizzle-orm";
import createHttpError from "http-errors";
import { attendanceStatusValues } from "@/lib/sales/sale-processing/attendance";

export type TCancelTabInput = {
	tabId: string;
	// Consumo ja entregue e fato fisico: cancelar a conta exige confirmacao explicita e as
	// movimentacoes de estoque permanecem como registro honesto (devolucao = cancelar cada
	// pedido individualmente com devolverEstoque antes de cancelar a conta).
	confirmarItensEntregues?: boolean | null;
	motivo?: string | null;
};

/**
 * Cancela a conta inteira: pedidos ativos -> CANCELADO, venda rascunho -> CANCELADA,
 * tab -> CANCELADA (compare-and-set sob lock).
 */
export async function cancelTab({
	organization,
	userId,
	input,
}: {
	organization: TOrganizationEntity;
	userId: string;
	input: TCancelTabInput;
}) {
	return db.transaction(async (tx) => {
		const [tab] = await tx
			.select()
			.from(tabs)
			.where(and(eq(tabs.id, input.tabId), eq(tabs.organizacaoId, organization.id)))
			.for("update");

		if (!tab) throw new createHttpError.NotFound("Conta nao encontrada.");
		if (tab.status !== "ABERTA") throw new createHttpError.BadRequest("Conta nao esta aberta.");

		const [draftSale] = await tx
			.select({ id: sales.id })
			.from(sales)
			.where(and(eq(sales.tabId, tab.id), eq(sales.statusVenda, "ORCAMENTO")))
			.for("update");

		if (draftSale) {
			const items = await tx
				.select({ id: saleItems.id, quantidade: saleItems.quantidade, quantidadeEntregue: saleItems.quantidadeEntregue })
				.from(saleItems)
				.where(eq(saleItems.vendaId, draftSale.id));

			const hasDeliveredItems = items.some((item) => (item.quantidadeEntregue ?? 0) > 0);
			if (hasDeliveredItems && input.confirmarItensEntregues !== true) {
				throw new createHttpError.BadRequest(
					"A conta possui itens ja entregues. Confirme o cancelamento com consumo entregue ou cancele os pedidos individualmente com devolucao de estoque.",
				);
			}

			// Pedidos ainda nao finalizados sao cancelados junto com a conta.
			await tx
				.update(tabOrders)
				.set({ status: "CANCELADO" })
				.where(and(eq(tabOrders.tabId, tab.id), ne(tabOrders.status, "ENTREGUE"), ne(tabOrders.status, "CANCELADO")));

			// Itens marcam quantidadeCancelada (deliverable = 0 -> nunca mais baixam estoque).
			const itemIds = items.map((item) => item.id);
			if (itemIds.length > 0) {
				for (const item of items) {
					await tx.update(saleItems).set({ quantidadeCancelada: item.quantidade }).where(eq(saleItems.id, item.id));
				}
			}

			const cancelledSaleRows = await tx
				.update(sales)
				.set({ statusVenda: "CANCELADA", ...attendanceStatusValues("CANCELADO") })
				.where(and(eq(sales.id, draftSale.id), eq(sales.statusVenda, "ORCAMENTO")))
				.returning({ id: sales.id });
			if (cancelledSaleRows.length === 0) {
				throw new createHttpError.Conflict("A venda da conta foi alterada por outra operacao. Atualize e tente novamente.");
			}
		}

		const cancelledRows = await tx
			.update(tabs)
			.set({
				status: "CANCELADA",
				fechadaPorUsuarioId: userId,
				dataFechamento: new Date(),
				observacoes: input.motivo ? `${tab.observacoes ?? ""}\n[CANCELAMENTO] ${input.motivo}`.trim() : tab.observacoes,
			})
			.where(and(eq(tabs.id, tab.id), eq(tabs.status, "ABERTA")))
			.returning({ id: tabs.id });
		if (cancelledRows.length === 0) {
			throw new createHttpError.Conflict("A conta foi alterada por outra operacao. Atualize e tente novamente.");
		}

		return { tabId: tab.id, saleId: draftSale?.id ?? null };
	});
}
export type TCancelTabResult = Awaited<ReturnType<typeof cancelTab>>;
