import { db } from "@/services/drizzle";
import { saleItemModifiers, saleItems } from "@/services/drizzle/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";

/**
 * Linhas de venda ATRIBUÍDAS A PRODUTO — a fonte das estatísticas por produto.
 *
 * O item de venda grava o unitário com os adicionais embutidos (base + adicionais): um cookie de
 * R$ 17 com o adicional "Cookie de Ovomaltine" de R$ 14 é uma linha de R$ 31. Somar `sale_items`
 * por `produto_id` credita os R$ 31 ao cookie base e nada ao de Ovomaltine, que no entanto saiu do
 * estoque (process-stock-deduction baixa o produto vinculado à opção).
 *
 * Aqui cada linha de venda vira:
 * - uma linha `ITEM` do produto do item, sem o valor dos adicionais VINCULADOS a produto;
 * - uma linha `ADICIONAL` por adicional vinculado, no produto da opção (snapshot gravado no
 *   adicional da venda pelo trigger de drizzle/0146), com unidades = quantidade do item ×
 *   quantidade do adicional × consumo — as mesmas da baixa de estoque — e custo do produto.
 *
 * Adicional SEM produto ("Nutella", "Borda recheada") não tem para onde ir: fica com o produto do
 * item, que foi o que gerou a receita. Somadas, as linhas reproduzem exatamente o faturamento de
 * `sale_items` — nada é contado duas vezes nem some.
 *
 * Desconto do item é repartido na proporção do bruto. Quando os adicionais vinculados passam do
 * bruto da linha (importação que gravou o valor já multiplicado pela quantidade), eles são
 * escalados para caber: a base nunca fica negativa.
 *
 * O custo da linha `ITEM` continua sendo o de `sale_items` (só o produto base); o do adicional
 * vem do snapshot. Por isso a soma dos custos aqui é MAIOR que a de `sale_items` quando há
 * adicional vinculado — é a correção da margem, não um desvio.
 *
 * Os campos têm os mesmos nomes de `saleItems`, para a troca nas consultas ser direta. Medidas no
 * nível da venda (itens por venda, contagem de linhas) devem continuar lendo `sale_items`.
 *
 * Os aliases SQL levam o prefixo `psl_`: o drizzle referencia campo `sql` de subquery SEM o nome
 * da subquery (`"organizacao_id"`, não `"product_sales_lines"."organizacao_id"`), e a consulta que
 * juntar `sales` ficaria com coluna ambígua.
 */
export type TProductSalesLineOrigin = "ITEM" | "ADICIONAL";

export function getProductSalesLines({ organizationId }: { organizationId: string }) {
	const linkedAddOns = db
		.select({
			itemVendaId: saleItemModifiers.itemVendaId,
			// Valor por UNIDADE do item (como gravado em sale_item_modifiers).
			valorUnitarioVinculado: sql<number>`sum(${saleItemModifiers.valorTotal})`.as("valor_unitario_vinculado"),
		})
		.from(saleItemModifiers)
		.innerJoin(saleItems, eq(saleItems.id, saleItemModifiers.itemVendaId))
		.where(and(isNotNull(saleItemModifiers.produtoId), eq(saleItems.organizacaoId, organizationId)))
		.groupBy(saleItemModifiers.itemVendaId)
		.as("adicionais_vinculados");

	const bruto = sql`greatest(${saleItems.valorVendaTotalBruto}, 0)`;
	const linkedLineValue = sql`(${saleItems.quantidade} * coalesce(${linkedAddOns.valorUnitarioVinculado}, 0))`;
	const linkedShare = sql`least(${linkedLineValue}, ${bruto})`;
	const itemRatio = sql`(case when ${bruto} > 0 then ${linkedShare} / ${bruto} else 0 end)`;

	const itemLines = db
		.select({
			organizacaoId: sql<string>`${saleItems.organizacaoId}`.as("psl_organizacao_id"),
			vendaId: sql<string>`${saleItems.vendaId}`.as("psl_venda_id"),
			clienteId: sql<string | null>`${saleItems.clienteId}`.as("psl_cliente_id"),
			itemVendaId: sql<string>`${saleItems.id}`.as("psl_item_venda_id"),
			produtoId: sql<string>`${saleItems.produtoId}`.as("psl_produto_id"),
			produtoVarianteId: sql<string | null>`${saleItems.produtoVarianteId}`.as("psl_produto_variante_id"),
			origem: sql<TProductSalesLineOrigin>`'ITEM'`.as("psl_origem"),
			quantidade: sql<number>`${saleItems.quantidade}`.as("psl_quantidade"),
			valorVendaTotalBruto: sql<number>`(${saleItems.valorVendaTotalBruto} - ${linkedShare})`.as("psl_valor_venda_total_bruto"),
			valorTotalDesconto: sql<number>`(${saleItems.valorTotalDesconto} * (1 - ${itemRatio}))`.as("psl_valor_total_desconto"),
			valorVendaTotalLiquido: sql<number>`(${saleItems.valorVendaTotalLiquido} * (1 - ${itemRatio}))`.as("psl_valor_venda_total_liquido"),
			valorCustoTotal: sql<number>`${saleItems.valorCustoTotal}`.as("psl_valor_custo_total"),
		})
		.from(saleItems)
		.leftJoin(linkedAddOns, eq(linkedAddOns.itemVendaId, saleItems.id))
		.where(eq(saleItems.organizacaoId, organizationId));

	// Fator que encolhe os adicionais quando passam do bruto da linha (dado de importação incoerente).
	const scale = sql`(case when ${linkedLineValue} > ${bruto} and ${linkedLineValue} > 0 then ${bruto} / ${linkedLineValue} else 1 end)`;
	const addOnGross = sql`(${saleItems.quantidade} * ${saleItemModifiers.valorTotal} * ${scale})`;
	const addOnRatio = sql`(case when ${bruto} > 0 then ${addOnGross} / ${bruto} else 0 end)`;
	const addOnUnits = sql`(${saleItems.quantidade} * ${saleItemModifiers.quantidade} * coalesce(${saleItemModifiers.quantidadeConsumo}, 1))`;

	const addOnLines = db
		.select({
			organizacaoId: sql<string>`${saleItems.organizacaoId}`.as("psl_organizacao_id"),
			vendaId: sql<string>`${saleItems.vendaId}`.as("psl_venda_id"),
			clienteId: sql<string | null>`${saleItems.clienteId}`.as("psl_cliente_id"),
			itemVendaId: sql<string>`${saleItems.id}`.as("psl_item_venda_id"),
			produtoId: sql<string>`${saleItemModifiers.produtoId}`.as("psl_produto_id"),
			produtoVarianteId: sql<string | null>`${saleItemModifiers.produtoVarianteId}`.as("psl_produto_variante_id"),
			origem: sql<TProductSalesLineOrigin>`'ADICIONAL'`.as("psl_origem"),
			quantidade: sql<number>`${addOnUnits}`.as("psl_quantidade"),
			valorVendaTotalBruto: sql<number>`${addOnGross}`.as("psl_valor_venda_total_bruto"),
			valorTotalDesconto: sql<number>`(${saleItems.valorTotalDesconto} * ${addOnRatio})`.as("psl_valor_total_desconto"),
			valorVendaTotalLiquido: sql<number>`(${saleItems.valorVendaTotalLiquido} * ${addOnRatio})`.as("psl_valor_venda_total_liquido"),
			valorCustoTotal: sql<number>`(${addOnUnits} * coalesce(${saleItemModifiers.valorCustoUnitario}, 0))`.as("psl_valor_custo_total"),
		})
		.from(saleItemModifiers)
		.innerJoin(saleItems, eq(saleItems.id, saleItemModifiers.itemVendaId))
		.innerJoin(linkedAddOns, eq(linkedAddOns.itemVendaId, saleItems.id))
		.where(and(isNotNull(saleItemModifiers.produtoId), eq(saleItems.organizacaoId, organizationId)));

	return itemLines.unionAll(addOnLines).as("product_sales_lines");
}

export type TProductSalesLines = ReturnType<typeof getProductSalesLines>;
