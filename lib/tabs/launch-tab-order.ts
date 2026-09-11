import { validateSaleItemsPricing } from "@/lib/sales/sale-pricing-validation";
import { db } from "@/services/drizzle";
import { saleItemModifiers, saleItems, sales, tabOrders, tabs } from "@/services/drizzle/schema";
import { and, eq, max } from "drizzle-orm";
import createHttpError from "http-errors";
import { recomputeTabDraftSaleTotals } from "./utils";

type TTabOrderItemModifierInput = {
	opcaoId: string;
	nome: string;
	quantidade: number;
	valorUnitario: number;
	valorTotal: number;
};

export type TTabOrderItemInput = {
	produtoId: string;
	produtoVarianteId?: string | null;
	nome: string;
	codigo: string;
	imagemUrl?: string | null;
	quantidade: number;
	valorUnitarioBase: number;
	valorModificadores: number;
	valorUnitarioFinal: number;
	valorTotalBruto: number;
	valorDesconto: number;
	valorTotalLiquido: number;
	observacoes?: string | null;
	modificadores: TTabOrderItemModifierInput[];
};

export type TLaunchTabOrderInput = {
	tabId: string;
	// Gerado no CALLER (client/solicitacao), obrigatorio: retry reenvia o mesmo id e dedupa.
	tabOrderId: string;
	observacoes?: string | null;
	itens: TTabOrderItemInput[];
};

/**
 * Lanca um pedido (rodada) em uma conta aberta:
 * 1. valida os precos contra o catalogo (mesma interface autoritativa do POS/shop);
 * 2. bloqueia a tab (FOR UPDATE) — serializa lancamentos e alocacao de numero;
 * 3. dedupa por id de tabOrder gerado no client (retry seguro sem tabela de execucoes);
 * 4. resolve ou cria (lazy) a venda rascunho da conta;
 * 5. insere tabOrder + saleItems/modifiers vinculados a venda e a rodada;
 * 6. recalcula os totais da venda rascunho.
 */
export async function launchTabOrder({ orgId, userId, input }: { orgId: string; userId: string; input: TLaunchTabOrderInput }) {
	if (input.itens.length === 0) throw new createHttpError.BadRequest("Informe pelo menos um item para o pedido.");

	// Nunca confie nos valores do cliente: recalcula os itens contra o catalogo antes de qualquer uso.
	// Autoridade do canal COMANDA: preço e presença valem para o pedido da mesa, venha ele do
	// QR do cliente (aprovação) ou do composer do operador.
	await validateSaleItemsPricing({ orgId, itens: input.itens, canal: "COMANDA" });

	// Custos atuais do catalogo (mesmo padrao do rascunho de POS).
	const productIds = [...new Set(input.itens.map((item) => item.produtoId))];
	const variantIds = input.itens.map((item) => item.produtoVarianteId).filter((id): id is string => !!id);
	const [produtosResult, variantesResult] = await Promise.all([
		productIds.length > 0
			? db.query.products.findMany({
					where: (fields, { and, eq, inArray }) => and(inArray(fields.id, productIds), eq(fields.organizacaoId, orgId)),
					columns: { id: true, precoCusto: true },
				})
			: [],
		variantIds.length > 0
			? db.query.productVariants.findMany({
					where: (fields, { and, eq, inArray }) => and(inArray(fields.id, variantIds), eq(fields.organizacaoId, orgId)),
					columns: { id: true, precoCusto: true },
				})
			: [],
	]);
	const productCostMap = new Map(produtosResult.map((product) => [product.id, product.precoCusto ?? 0]));
	const variantCostMap = new Map(variantesResult.map((variant) => [variant.id, variant.precoCusto ?? 0]));

	return db.transaction(async (tx) => {
		// Lock da tab: serializa lancamentos concorrentes e a alocacao do numero do pedido.
		const [tab] = await tx
			.select()
			.from(tabs)
			.where(and(eq(tabs.id, input.tabId), eq(tabs.organizacaoId, orgId)))
			.for("update");

		if (!tab) throw new createHttpError.NotFound("Conta nao encontrada.");
		if (tab.status !== "ABERTA") throw new createHttpError.BadRequest("Conta nao esta aberta.");

		// Idempotencia: id do tabOrder gerado no caller. Retry do mesmo pedido retorna o existente.
		const existingOrder = await tx.query.tabOrders.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.tabOrderId), eq(fields.organizacaoId, orgId)),
		});
		if (existingOrder) {
			if (existingOrder.tabId !== tab.id) throw new createHttpError.Conflict("O ID do pedido ja foi usado em outra conta.");
			const existingDraftSale = await tx.query.sales.findFirst({
				where: (fields, { and, eq }) => and(eq(fields.tabId, tab.id), eq(fields.statusVenda, "ORCAMENTO")),
				columns: { id: true, valorTotal: true },
			});
			return {
				tabId: tab.id,
				tabOrderId: existingOrder.id,
				tabOrderNumero: existingOrder.numero,
				saleId: existingDraftSale?.id ?? null,
				valorTotalConta: existingDraftSale?.valorTotal ?? 0,
				deduplicated: true as const,
			};
		}

		// Venda rascunho lazy: criada no primeiro pedido da conta.
		let draftSale = await tx.query.sales.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.tabId, tab.id), eq(fields.statusVenda, "ORCAMENTO")),
			columns: { id: true },
		});

		if (!draftSale) {
			const servicePoint = tab.servicePointId
				? await tx.query.servicePoints.findFirst({
						where: (fields, { eq }) => eq(fields.id, tab.servicePointId as string),
						columns: { rotulo: true },
					})
				: null;
			const responsavel = tab.responsavelVendedorId
				? await tx.query.sellers.findFirst({
						where: (fields, { eq }) => eq(fields.id, tab.responsavelVendedorId as string),
						columns: { id: true, nome: true },
					})
				: null;

			const [createdSale] = await tx
				.insert(sales)
				.values({
					organizacaoId: orgId,
					clienteId: tab.clienteId,
					tabId: tab.id,
					idExterno: `TAB-${Date.now()}`,
					valorTotal: 0,
					custoTotal: 0,
					vendedorNome: responsavel?.nome ?? "",
					vendedorId: responsavel?.id ?? null,
					entregaModalidade: "COMANDA",
					// Snapshot legado p/ relatorios existentes (docs/tabs: denormalizar codigo ?? rotulo do ponto).
					comandaNumero: tab.codigo ?? servicePoint?.rotulo ?? null,
					parceiro: "",
					chave: "",
					documento: "",
					modelo: "",
					movimento: "RECEITAS",
					natureza: "",
					serie: "",
					situacao: "",
					tipo: "Venda de produtos",
					canal: "COMANDA",
					processamentoOrigem: "INTERNO",
					statusVenda: "ORCAMENTO",
				})
				.returning({ id: sales.id });
			draftSale = createdSale;
		}

		// Numero sequencial alocado sob o lock da tab; unique (tabId, numero) defende no banco.
		const [{ maxNumero }] = await tx
			.select({ maxNumero: max(tabOrders.numero) })
			.from(tabOrders)
			.where(eq(tabOrders.tabId, tab.id));
		const numero = (maxNumero ?? 0) + 1;

		const [createdOrder] = await tx
			.insert(tabOrders)
			.values({
				id: input.tabOrderId,
				organizacaoId: orgId,
				tabId: tab.id,
				numero,
				status: "EM_PREPARO",
				observacoes: input.observacoes ?? null,
				lancadoPorUsuarioId: userId,
			})
			.returning({ id: tabOrders.id, numero: tabOrders.numero });

		for (const item of input.itens) {
			const valorCustoUnitario = item.produtoVarianteId ? (variantCostMap.get(item.produtoVarianteId) ?? 0) : (productCostMap.get(item.produtoId) ?? 0);

			const [saleItem] = await tx
				.insert(saleItems)
				.values({
					organizacaoId: orgId,
					vendaId: draftSale.id,
					clienteId: tab.clienteId,
					produtoId: item.produtoId,
					produtoVarianteId: item.produtoVarianteId ?? null,
					tabOrderId: createdOrder.id,
					quantidade: item.quantidade,
					valorVendaUnitario: item.valorUnitarioFinal,
					valorCustoUnitario,
					valorVendaTotalBruto: item.valorTotalBruto,
					valorTotalDesconto: item.valorDesconto,
					valorVendaTotalLiquido: item.valorTotalLiquido,
					valorCustoTotal: valorCustoUnitario * item.quantidade,
					observacoes: item.observacoes ?? null,
					metadados: {
						nome: item.nome,
						codigo: item.codigo,
						imagemUrl: item.imagemUrl ?? null,
						produtoId: item.produtoId,
						produtoVarianteId: item.produtoVarianteId ?? null,
						valorUnitarioBase: item.valorUnitarioBase,
						valorModificadores: item.valorModificadores,
						modificadores: item.modificadores,
					},
				})
				.returning({ id: saleItems.id });

			if (item.modificadores.length > 0) {
				await tx.insert(saleItemModifiers).values(
					item.modificadores.map((mod) => ({
						itemVendaId: saleItem.id,
						opcaoId: mod.opcaoId,
						nome: mod.nome,
						quantidade: mod.quantidade,
						valorUnitario: mod.valorUnitario,
						valorTotal: mod.valorTotal,
					})),
				);
			}
		}

		const totals = await recomputeTabDraftSaleTotals(tx, { saleId: draftSale.id });

		return {
			tabId: tab.id,
			tabOrderId: createdOrder.id,
			tabOrderNumero: createdOrder.numero,
			saleId: draftSale.id,
			valorTotalConta: totals.valorTotal,
			deduplicated: false as const,
		};
	});
}
export type TLaunchTabOrderResult = Awaited<ReturnType<typeof launchTabOrder>>;
