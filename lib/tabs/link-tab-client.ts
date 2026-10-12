import { db } from "@/services/drizzle";
import { saleItems, sales, tabs } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";

export type TLinkTabClientInput = {
	tabId: string;
	/** null desvincula: a conta volta a ser "ao consumidor". */
	clienteId: string | null;
};

/**
 * Vincula (ou desvincula) o cliente de uma conta aberta. O cliente da conta e
 * replicado na venda rascunho e nos seus itens no lancamento, entao a troca
 * acompanha os tres no mesmo lock — o fechamento le o cliente da tab.
 */
export async function linkTabClient({ orgId, input }: { orgId: string; input: TLinkTabClientInput }) {
	// Isolamento multi-tenant: o cliente precisa pertencer a organizacao da sessao.
	if (input.clienteId) {
		const client = await db.query.clients.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.clienteId as string), eq(fields.organizacaoId, orgId)),
			columns: { id: true },
		});
		if (!client) throw new createHttpError.NotFound("Cliente nao encontrado.");
	}

	return db.transaction(async (tx) => {
		// Lock da tab: serializa contra fechamento/cancelamento e lancamentos concorrentes.
		const [tab] = await tx
			.select({ id: tabs.id, status: tabs.status, clienteId: tabs.clienteId })
			.from(tabs)
			.where(and(eq(tabs.id, input.tabId), eq(tabs.organizacaoId, orgId)))
			.for("update");

		if (!tab) throw new createHttpError.NotFound("Conta nao encontrada.");
		if (tab.status !== "ABERTA") throw new createHttpError.BadRequest("Somente contas abertas podem ter o cliente alterado.");
		if (tab.clienteId === input.clienteId) return { tabId: tab.id, clienteId: tab.clienteId };

		await tx.update(tabs).set({ clienteId: input.clienteId }).where(eq(tabs.id, tab.id));

		const [draftSale] = await tx
			.select({ id: sales.id })
			.from(sales)
			.where(and(eq(sales.tabId, tab.id), eq(sales.statusVenda, "ORCAMENTO")))
			.limit(1);
		if (draftSale) {
			await tx.update(sales).set({ clienteId: input.clienteId }).where(eq(sales.id, draftSale.id));
			await tx.update(saleItems).set({ clienteId: input.clienteId }).where(eq(saleItems.vendaId, draftSale.id));
		}

		return { tabId: tab.id, clienteId: input.clienteId };
	});
}
export type TLinkTabClientResult = Awaited<ReturnType<typeof linkTabClient>>;
