import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { getSalesIntegrationCondition } from "@/lib/sales/integration-filter";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { ProductSchema } from "@/schemas/products";
import { db } from "@/services/drizzle";
import { getProductSalesLines } from "@/lib/products/product-sales-lines";
import { clients, partners, products, saleItemModifiers, saleItems, sales, sellers } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, countDistinct, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { z } from "zod";

const GetProductStatsInputSchema = z.object({
	productId: z.string({
		required_error: "ID do produto não informado.",
		invalid_type_error: "Tipo inválido para ID do produto.",
	}),
	periodAfter: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.optional()
		.nullable(),
	periodBefore: z
		.string({
			required_error: "Período não informado.",
			invalid_type_error: "Tipo inválido para período.",
		})
		.optional()
		.nullable(),
	sellerId: z
		.string({
			required_error: "ID do vendedor não informado.",
			invalid_type_error: "Tipo inválido para ID do vendedor.",
		})
		.optional()
		.nullable(),
	partnerId: z
		.string({
			required_error: "ID do parceiro não informado.",
			invalid_type_error: "Tipo inválido para ID do parceiro.",
		})
		.optional()
		.nullable(),
	integrationsIds: z.array(z.string()).optional().nullable(),
});
export type TGetProductStatsInput = z.infer<typeof GetProductStatsInputSchema>;

type GetProductStatsParams = {
	session: TAuthUserSession;
	input: TGetProductStatsInput;
};

async function getProductStats({ session, input }: GetProductStatsParams) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const product = await db.query.products.findFirst({
		where: and(eq(products.id, input.productId), eq(products.organizacaoId, userOrgId)),
	});
	if (!product) throw new createHttpError.NotFound("Produto não encontrado.");

	const periodAfterDate = input.periodAfter ? new Date(input.periodAfter) : undefined;
	const periodBeforeDate = input.periodBefore ? new Date(input.periodBefore) : undefined;

	// Linhas atribuídas a produto: o produto aparece tanto como item quanto como adicional
	// vinculado de outro item (lib/products/product-sales-lines.ts).
	const lines = getProductSalesLines({ organizationId: userOrgId });
	const saleItemWhereConditions = [eq(lines.organizacaoId, userOrgId), eq(lines.produtoId, input.productId)] as const;
	const saleWhereConditions = [eq(sales.organizacaoId, userOrgId), eq(sales.statusVenda, "CONFIRMADA"), isNotNull(sales.dataVenda)] as const;

	const saleWhere = and(
		...saleWhereConditions,
		periodAfterDate ? gte(sales.dataVenda, periodAfterDate) : undefined,
		periodBeforeDate ? lte(sales.dataVenda, periodBeforeDate) : undefined,
		input.sellerId ? eq(sales.vendedorId, input.sellerId) : undefined,
		input.partnerId ? eq(sales.parceiroId, input.partnerId) : undefined,
		getSalesIntegrationCondition(input.integrationsIds),
	);

	const saleItemWhere = and(...saleItemWhereConditions, inArray(lines.vendaId, db.select({ id: sales.id }).from(sales).where(saleWhere)));

	const allTimeStatsResult = await db
		.select({
			quantidadeTotal: sum(lines.quantidade),
			vendasQtdeTotal: countDistinct(lines.vendaId),
			faturamentoBrutoTotal: sum(lines.valorVendaTotalBruto),
			faturamentoLiquidoTotal: sum(lines.valorVendaTotalLiquido),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(
			and(
				eq(lines.organizacaoId, userOrgId),
				eq(sales.organizacaoId, userOrgId),
				...saleWhereConditions,
				eq(lines.produtoId, input.productId),
				input.sellerId ? eq(sales.vendedorId, input.sellerId) : undefined,
				input.partnerId ? eq(sales.parceiroId, input.partnerId) : undefined,
				getSalesIntegrationCondition(input.integrationsIds),
			),
		);
	// Quantitative: Basic metrics
	const totalStatsResult = await db
		.select({
			quantidadeTotal: sum(lines.quantidade),
			vendasCount: countDistinct(lines.vendaId),
			faturamentoBrutoTotal: sum(lines.valorVendaTotalBruto),
			faturamentoLiquidoTotal: sum(lines.valorVendaTotalLiquido),
			custoTotal: sum(lines.valorCustoTotal),
			descontoTotal: sum(lines.valorTotalDesconto),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), saleItemWhere));

	const totalStats = totalStatsResult[0];
	const quantidadeTotal = totalStats?.quantidadeTotal ? Number(totalStats.quantidadeTotal) : 0;
	const vendasCount = Number(totalStats?.vendasCount ?? 0);
	const faturamentoBrutoTotal = totalStats?.faturamentoBrutoTotal ? Number(totalStats.faturamentoBrutoTotal) : 0;
	const faturamentoLiquidoTotal = totalStats?.faturamentoLiquidoTotal ? Number(totalStats.faturamentoLiquidoTotal) : 0;
	const custoTotal = totalStats?.custoTotal ? Number(totalStats.custoTotal) : 0;
	const descontoTotal = totalStats?.descontoTotal ? Number(totalStats.descontoTotal) : 0;

	// Composição: o que veio do produto vendido como item, o que veio dele como adicional
	// vinculado de outro item, e — dentro das vendas como item — quanto foram adicionais SEM
	// produto, que ficam com este produto por não terem para onde ir.
	const byOriginResult = await db
		.select({
			origem: lines.origem,
			quantidade: sum(lines.quantidade),
			faturamentoLiquido: sum(lines.valorVendaTotalLiquido),
		})
		.from(lines)
		.where(saleItemWhere)
		.groupBy(lines.origem);
	const asItem = byOriginResult.find((row) => row.origem === "ITEM");
	const asAddOn = byOriginResult.find((row) => row.origem === "ADICIONAL");

	const unlinkedAddOns = db
		.select({
			itemVendaId: saleItemModifiers.itemVendaId,
			valorUnitario: sql<number>`sum(${saleItemModifiers.valorTotal})`.as("valor_unitario_sem_produto"),
		})
		.from(saleItemModifiers)
		.innerJoin(saleItems, eq(saleItems.id, saleItemModifiers.itemVendaId))
		.where(and(isNull(saleItemModifiers.produtoId), eq(saleItems.organizacaoId, userOrgId), eq(saleItems.produtoId, input.productId)))
		.groupBy(saleItemModifiers.itemVendaId)
		.as("adicionais_sem_produto");
	// Mesma regra da atribuição: valor por unidade do item × quantidade, limitado ao bruto da
	// linha, e o desconto repartido na proporção do bruto.
	const unlinkedAddOnsResult = await db
		.select({
			faturamentoLiquido: sql<number>`sum(least(${saleItems.quantidade} * ${unlinkedAddOns.valorUnitario}, greatest(${saleItems.valorVendaTotalBruto}, 0)) * (case when ${saleItems.valorVendaTotalBruto} > 0 then ${saleItems.valorVendaTotalLiquido} / ${saleItems.valorVendaTotalBruto} else 0 end))`,
		})
		.from(saleItems)
		.innerJoin(unlinkedAddOns, eq(unlinkedAddOns.itemVendaId, saleItems.id))
		.where(
			and(
				eq(saleItems.organizacaoId, userOrgId),
				eq(saleItems.produtoId, input.productId),
				inArray(saleItems.vendaId, db.select({ id: sales.id }).from(sales).where(saleWhere)),
			),
		);
	const composicao = {
		quantidadeComoItem: Number(asItem?.quantidade ?? 0),
		faturamentoComoItem: Number(asItem?.faturamentoLiquido ?? 0),
		quantidadeComoAdicional: Number(asAddOn?.quantidade ?? 0),
		faturamentoComoAdicional: Number(asAddOn?.faturamentoLiquido ?? 0),
		faturamentoAdicionaisSemProduto: Number(unlinkedAddOnsResult[0]?.faturamentoLiquido ?? 0),
	};

	const margemBrutaTotal = faturamentoLiquidoTotal - custoTotal;
	const margemBrutaPercentual = faturamentoLiquidoTotal > 0 ? (margemBrutaTotal / faturamentoLiquidoTotal) * 100 : 0;
	const valorMedioPorUnidade = quantidadeTotal > 0 ? faturamentoLiquidoTotal / quantidadeTotal : 0;
	const ticketMedio = vendasCount > 0 ? faturamentoLiquidoTotal / vendasCount : 0;
	const percentualDescontoMedio = faturamentoBrutoTotal > 0 ? (descontoTotal / faturamentoBrutoTotal) * 100 : 0;

	// First and last sale dates (respecting filters)
	const firstSaleResult = await db
		.select({ data: sales.dataVenda })
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), saleItemWhere))
		.orderBy(sql`${sales.dataVenda} asc`)
		.limit(1);
	const lastSaleResult = await db
		.select({ data: sales.dataVenda })
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), saleItemWhere))
		.orderBy(sql`${sales.dataVenda} desc`)
		.limit(1);

	const firstSaleDate = firstSaleResult[0]?.data ?? null;
	const lastSaleDate = lastSaleResult[0]?.data ?? null;

	const daysDiff = firstSaleDate && lastSaleDate ? dayjs(lastSaleDate).diff(dayjs(firstSaleDate), "days") + 1 : 1;
	const faturamentoPorDia = faturamentoLiquidoTotal / daysDiff;

	// Unique clients count
	const uniqueClientsResult = await db
		.select({ count: countDistinct(lines.clienteId) })
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), saleItemWhere));
	const clientesUnicos = Number(uniqueClientsResult[0]?.count ?? 0);

	// Seasonality: by day of month
	const dayExpr = sql<number>`extract(day from ${sales.dataVenda})`;
	const byDayOfMonthRaw = await db
		.select({
			dia: dayExpr,
			quantidade: sum(lines.quantidade),
			total: sum(lines.valorVendaTotalLiquido),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), saleItemWhere))
		.groupBy(dayExpr)
		.orderBy(dayExpr);

	// Seasonality: by month
	const monthExpr = sql<number>`extract(month from ${sales.dataVenda})`;
	const byMonthRaw = await db
		.select({
			mes: monthExpr,
			quantidade: sum(lines.quantidade),
			total: sum(lines.valorVendaTotalLiquido),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), saleItemWhere))
		.groupBy(monthExpr)
		.orderBy(monthExpr);

	// Seasonality: by week day
	const weekDayExpr = sql<number>`extract(dow from ${sales.dataVenda})`;
	const byWeekDayRaw = await db
		.select({
			diaSemana: weekDayExpr,
			quantidade: sum(lines.quantidade),
			total: sum(lines.valorVendaTotalLiquido),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), saleItemWhere))
		.groupBy(weekDayExpr)
		.orderBy(weekDayExpr);

	// Top 10 clients
	const byClientTop10Raw = await db
		.select({
			clienteId: lines.clienteId,
			clienteNome: clients.nome,
			quantidade: sum(lines.quantidade),
			total: sum(lines.valorVendaTotalLiquido),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.leftJoin(clients, eq(lines.clienteId, clients.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), eq(clients.organizacaoId, userOrgId), saleItemWhere))
		.groupBy(lines.clienteId, clients.nome)
		.orderBy(desc(sql`sum(${lines.valorVendaTotalLiquido})`))
		.limit(10);

	// Top 10 sellers
	const bySellerTop10Raw = await db
		.select({
			vendedorId: sales.vendedorId,
			vendedorNome: sellers.nome,
			quantidade: sum(lines.quantidade),
			total: sum(lines.valorVendaTotalLiquido),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.leftJoin(sellers, eq(sales.vendedorId, sellers.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), eq(sellers.organizacaoId, userOrgId), saleItemWhere))
		.groupBy(sales.vendedorId, sellers.nome)
		.orderBy(desc(sql`sum(${lines.valorVendaTotalLiquido})`))
		.limit(10);

	// Top 10 partners
	const byPartnerTop10Raw = await db
		.select({
			parceiroId: sales.parceiroId,
			parceiroNome: partners.nome,
			quantidade: sum(lines.quantidade),
			total: sum(lines.valorVendaTotalLiquido),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.leftJoin(partners, eq(sales.parceiroId, partners.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), eq(partners.organizacaoId, userOrgId), saleItemWhere))
		.groupBy(sales.parceiroId, partners.nome)
		.orderBy(desc(sql`sum(${lines.valorVendaTotalLiquido})`))
		.limit(10);

	// Related products (basket analysis) - products sold together
	const relatedProductsRaw = await db
		.select({
			produtoId: lines.produtoId,
			produtoNome: products.nome,
			produtoCodigo: products.codigo,
			produtoGrupo: products.grupo,
			frequencia: count(lines.itemVendaId),
			quantidade: sum(lines.quantidade),
			total: sum(lines.valorVendaTotalLiquido),
		})
		.from(lines)
		.innerJoin(
			// Alias próprio: os campos das linhas saem sem qualificação (`"psl_venda_id"`) e o
			// derivado com o mesmo nome deixaria a junção ambígua.
			db
				.select({ vendaId: sql<string>`${lines.vendaId}`.as("venda_com_produto_id") })
				.from(lines)
				.innerJoin(sales, eq(lines.vendaId, sales.id))
				.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), saleItemWhere))
				.as("vendas_com_produto"),
			sql`${lines.vendaId} = vendas_com_produto.venda_com_produto_id`,
		)
		.leftJoin(products, eq(lines.produtoId, products.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(products.organizacaoId, userOrgId), ne(lines.produtoId, input.productId)))
		.groupBy(lines.produtoId, products.nome, products.codigo, products.grupo)
		.orderBy(desc(sql`count(${lines.itemVendaId})`))
		.limit(10);

	// Margin analysis by seller
	const marginBySellerRaw = await db
		.select({
			vendedorId: sales.vendedorId,
			vendedorNome: sellers.nome,
			faturamentoLiquido: sum(lines.valorVendaTotalLiquido),
			custo: sum(lines.valorCustoTotal),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.leftJoin(sellers, eq(sales.vendedorId, sellers.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), eq(sellers.organizacaoId, userOrgId), saleItemWhere))
		.groupBy(sales.vendedorId, sellers.nome)
		.orderBy(desc(sql`sum(${lines.valorVendaTotalLiquido}) - sum(${lines.valorCustoTotal})`))
		.limit(10);

	// Margin analysis by client
	const marginByClientRaw = await db
		.select({
			clienteId: lines.clienteId,
			clienteNome: clients.nome,
			faturamentoLiquido: sum(lines.valorVendaTotalLiquido),
			custo: sum(lines.valorCustoTotal),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.leftJoin(clients, eq(lines.clienteId, clients.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), eq(clients.organizacaoId, userOrgId), saleItemWhere))
		.groupBy(lines.clienteId, clients.nome)
		.orderBy(desc(sql`sum(${lines.valorVendaTotalLiquido}) - sum(${lines.valorCustoTotal})`))
		.limit(10);

	// Margin analysis by partner
	const marginByPartnerRaw = await db
		.select({
			parceiroId: sales.parceiroId,
			parceiroNome: partners.nome,
			faturamentoLiquido: sum(lines.valorVendaTotalLiquido),
			custo: sum(lines.valorCustoTotal),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.leftJoin(partners, eq(sales.parceiroId, partners.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), eq(partners.organizacaoId, userOrgId), saleItemWhere))
		.groupBy(sales.parceiroId, partners.nome)
		.orderBy(desc(sql`sum(${lines.valorVendaTotalLiquido}) - sum(${lines.valorCustoTotal})`))
		.limit(10);

	// Margin evolution over time (monthly)
	const marginByMonthRaw = await db
		.select({
			mes: monthExpr,
			faturamentoLiquido: sum(lines.valorVendaTotalLiquido),
			custo: sum(lines.valorCustoTotal),
		})
		.from(lines)
		.innerJoin(sales, eq(lines.vendaId, sales.id))
		.where(and(eq(lines.organizacaoId, userOrgId), eq(sales.organizacaoId, userOrgId), saleItemWhere))
		.groupBy(monthExpr)
		.orderBy(monthExpr);

	return {
		data: {
			produto: {
				id: product.id,
				nome: product.nome,
				descricao: product.descricao,
				codigo: product.codigo,
				unidade: product.unidade,
				ncm: product.ncm,
				tipo: product.tipo,
				grupo: product.grupo,
				quantidade: product.quantidade,
				precoVenda: product.precoVenda,
			},
			geral: {
				quantidadeTotal: allTimeStatsResult[0]?.quantidadeTotal ? Number(allTimeStatsResult[0].quantidadeTotal) : 0,
				vendasQtdeTotal: allTimeStatsResult[0]?.vendasQtdeTotal ? Number(allTimeStatsResult[0].vendasQtdeTotal) : 0,
				faturamentoBrutoTotal: allTimeStatsResult[0]?.faturamentoBrutoTotal ? Number(allTimeStatsResult[0].faturamentoBrutoTotal) : 0,
				faturamentoLiquidoTotal: allTimeStatsResult[0]?.faturamentoLiquidoTotal ? Number(allTimeStatsResult[0].faturamentoLiquidoTotal) : 0,
			},
			dataPrimeiraVenda: firstSaleDate,
			dataUltimaVenda: lastSaleDate,
			quantidadeTotal,
			vendasQtdeTotal: vendasCount,
			clientesUnicos,
			faturamentoBrutoTotal,
			faturamentoLiquidoTotal,
			custoTotal,
			margemBrutaTotal,
			margemBrutaPercentual,
			valorMedioPorUnidade,
			ticketMedio,
			descontoTotal,
			percentualDescontoMedio,
			faturamentoPorDia,
			composicao,
			resultadosAgrupados: {
				dia: byDayOfMonthRaw.map((row) => ({
					dia: Number(row.dia),
					quantidade: row.quantidade ? Number(row.quantidade) : 0,
					total: row.total ? Number(row.total) : 0,
				})),
				mes: byMonthRaw.map((row) => ({
					mes: Number(row.mes),
					quantidade: row.quantidade ? Number(row.quantidade) : 0,
					total: row.total ? Number(row.total) : 0,
				})),
				diaSemana: byWeekDayRaw.map((row) => ({
					diaSemana: Number(row.diaSemana),
					quantidade: row.quantidade ? Number(row.quantidade) : 0,
					total: row.total ? Number(row.total) : 0,
				})),
				cliente: byClientTop10Raw.map((row) => ({
					clienteId: row.clienteId,
					clienteNome: row.clienteNome ?? null,
					quantidade: row.quantidade ? Number(row.quantidade) : 0,
					total: row.total ? Number(row.total) : 0,
				})),
				vendedor: bySellerTop10Raw.map((row) => ({
					vendedorId: row.vendedorId,
					vendedorNome: row.vendedorNome ?? null,
					quantidade: row.quantidade ? Number(row.quantidade) : 0,
					total: row.total ? Number(row.total) : 0,
				})),
				parceiro: byPartnerTop10Raw.map((row) => ({
					parceiroId: row.parceiroId,
					parceiroNome: row.parceiroNome ?? null,
					quantidade: row.quantidade ? Number(row.quantidade) : 0,
					total: row.total ? Number(row.total) : 0,
				})),
				produtosRelacionados: relatedProductsRaw.map((row) => ({
					produtoId: row.produtoId,
					produtoNome: row.produtoNome ?? "",
					produtoCodigo: row.produtoCodigo ?? "",
					produtoGrupo: row.produtoGrupo ?? null,
					frequencia: Number(row.frequencia ?? 0),
					quantidade: row.quantidade ? Number(row.quantidade) : 0,
					total: row.total ? Number(row.total) : 0,
				})),
			},
			analiseMargem: {
				porVendedor: marginBySellerRaw.map((row) => ({
					vendedorId: row.vendedorId,
					vendedorNome: row.vendedorNome ?? null,
					faturamentoLiquido: row.faturamentoLiquido ? Number(row.faturamentoLiquido) : 0,
					custo: row.custo ? Number(row.custo) : 0,
					margem: row.faturamentoLiquido && row.custo ? Number(row.faturamentoLiquido) - Number(row.custo) : 0,
					margemPercentual:
						row.faturamentoLiquido && Number(row.faturamentoLiquido) > 0
							? ((Number(row.faturamentoLiquido) - Number(row.custo ?? 0)) / Number(row.faturamentoLiquido)) * 100
							: 0,
				})),
				porCliente: marginByClientRaw.map((row) => ({
					clienteId: row.clienteId,
					clienteNome: row.clienteNome ?? null,
					faturamentoLiquido: row.faturamentoLiquido ? Number(row.faturamentoLiquido) : 0,
					custo: row.custo ? Number(row.custo) : 0,
					margem: row.faturamentoLiquido && row.custo ? Number(row.faturamentoLiquido) - Number(row.custo) : 0,
					margemPercentual:
						row.faturamentoLiquido && Number(row.faturamentoLiquido) > 0
							? ((Number(row.faturamentoLiquido) - Number(row.custo ?? 0)) / Number(row.faturamentoLiquido)) * 100
							: 0,
				})),
				porParceiro: marginByPartnerRaw.map((row) => ({
					parceiroId: row.parceiroId,
					parceiroNome: row.parceiroNome ?? null,
					faturamentoLiquido: row.faturamentoLiquido ? Number(row.faturamentoLiquido) : 0,
					custo: row.custo ? Number(row.custo) : 0,
					margem: row.faturamentoLiquido && row.custo ? Number(row.faturamentoLiquido) - Number(row.custo) : 0,
					margemPercentual:
						row.faturamentoLiquido && Number(row.faturamentoLiquido) > 0
							? ((Number(row.faturamentoLiquido) - Number(row.custo ?? 0)) / Number(row.faturamentoLiquido)) * 100
							: 0,
				})),
				evolucaoMensal: marginByMonthRaw.map((row) => ({
					mes: Number(row.mes),
					faturamentoLiquido: row.faturamentoLiquido ? Number(row.faturamentoLiquido) : 0,
					custo: row.custo ? Number(row.custo) : 0,
					margem: row.faturamentoLiquido && row.custo ? Number(row.faturamentoLiquido) - Number(row.custo) : 0,
					margemPercentual:
						row.faturamentoLiquido && Number(row.faturamentoLiquido) > 0
							? ((Number(row.faturamentoLiquido) - Number(row.custo ?? 0)) / Number(row.faturamentoLiquido)) * 100
							: 0,
				})),
			},
		},
	};
}

export type TGetProductStatsOutput = Awaited<ReturnType<typeof getProductStats>>;

const getProductStatsHandler: PagesRouteHandler<TGetProductStatsOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetProductStatsInputSchema.parse({
		productId: req.query.productId as string,
		periodAfter: (req.query.periodAfter as string | undefined) ?? null,
		periodBefore: (req.query.periodBefore as string | undefined) ?? null,
		sellerId: (req.query.sellerId as string | undefined) ?? null,
		partnerId: (req.query.partnerId as string | undefined) ?? null,
		integrationsIds: req.query.integrationsIds ? JSON.parse(req.query.integrationsIds as string) : null,
	});
	const data = await getProductStats({ session: sessionUser, input });
	return res.status(200).json(data);
};

const routeHandlers = {
	GET: getProductStatsHandler,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
