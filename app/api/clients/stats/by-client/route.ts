import { appApiHandler } from "@/lib/app-api";
import { runPagesRouteHandler, type PagesRouteHandler, type PagesRouteRequest, type PagesRouteResponse } from "@/lib/pages-route-compat";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import type { TUserSession } from "@/schemas/users";
import { db } from "@/services/drizzle";
import { clients, products, saleItems, sales, sellers } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, count, countDistinct, desc, eq, gte, isNotNull, lte, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { z } from "zod";

const GetClientStatsInputSchema = z.object({
	clientId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo inválido para ID do cliente.",
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
});
export type TGetClientStatsInput = z.infer<typeof GetClientStatsInputSchema>;

type GetClientStatsParams = {
	session: TAuthUserSession;
	input: TGetClientStatsInput;
};

async function getClientStats({ session, input }: GetClientStatsParams) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const client = await db.query.clients.findFirst({
		where: and(eq(clients.id, input.clientId), eq(clients.organizacaoId, userOrgId)),
	});
	if (!client) throw new createHttpError.NotFound("Cliente não encontrado.");

	const periodAfterDate = input.periodAfter ? new Date(input.periodAfter) : undefined;
	const periodBeforeDate = input.periodBefore ? new Date(input.periodBefore) : undefined;

	const saleWhereConditions = [eq(sales.organizacaoId, userOrgId), eq(sales.clienteId, input.clientId), isNotNull(sales.dataVenda)] as const;
	const saleWhere = and(
		...saleWhereConditions,
		periodAfterDate ? gte(sales.dataVenda, periodAfterDate) : undefined,
		periodBeforeDate ? lte(sales.dataVenda, periodBeforeDate) : undefined,
	);

	const totalPuchasesResult = await db
		.select({ qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.where(saleWhere);
	const totalPurchaseResultStats = totalPuchasesResult[0];

	const totalPurchasesCount = totalPurchaseResultStats?.qtde ?? 0;
	const totalPurchasesValue = totalPurchaseResultStats?.total ? Number(totalPurchaseResultStats.total) : 0;
	const avgPurchaseValue = totalPurchasesCount > 0 ? totalPurchasesValue / totalPurchasesCount : 0;

	// Vida inteira do cliente, ignorando o período: o cabeçalho da página fica visível em todas as
	// abas, inclusive nas que não têm filtro de data, e "14 compras" não pode virar "3" porque a
	// aba de estatísticas está olhando setembro.
	const lifetimePurchasesResult = await db
		.select({ qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.where(and(...saleWhereConditions));
	const lifetimePurchasesStats = lifetimePurchasesResult[0];

	const lifetimePurchasesCount = lifetimePurchasesStats?.qtde ?? 0;
	const lifetimePurchasesValue = lifetimePurchasesStats?.total ? Number(lifetimePurchasesStats.total) : 0;
	const lifetimeAvgPurchaseValue = lifetimePurchasesCount > 0 ? lifetimePurchasesValue / lifetimePurchasesCount : 0;

	const firstPurchaseResult = await db
		.select({ data: sales.dataVenda })
		.from(sales)
		.where(saleWhere)
		.orderBy(sql`${sales.dataVenda} asc`)
		.limit(1);
	const lastPurchaseResult = await db
		.select({ data: sales.dataVenda })
		.from(sales)
		.where(saleWhere)
		.orderBy(sql`${sales.dataVenda} desc`)
		.limit(1);

	const firstPurchaseDate = firstPurchaseResult[0]?.data ?? null;
	const lastPurchaseDate = lastPurchaseResult[0]?.data ?? null;

	const periodDiffMap = {
		days: dayjs(lastPurchaseDate).diff(dayjs(firstPurchaseDate), "days"),
		weeks: dayjs(lastPurchaseDate).diff(dayjs(firstPurchaseDate), "weeks"),
		months: dayjs(lastPurchaseDate).diff(dayjs(firstPurchaseDate), "months"),
		years: dayjs(lastPurchaseDate).diff(dayjs(firstPurchaseDate), "years"),
	};

	const totalPurchasesValuePeriodGroupMap = {
		dia: periodDiffMap.days > 1 ? totalPurchasesValue / periodDiffMap.days : undefined,
		semana: periodDiffMap.weeks > 1 ? totalPurchasesValue / periodDiffMap.weeks : undefined,
		mes: periodDiffMap.months > 1 ? totalPurchasesValue / periodDiffMap.months : undefined,
		ano: periodDiffMap.years > 1 ? totalPurchasesValue / periodDiffMap.years : undefined,
	};

	const byProductGroupRaw = await db
		.select({ grupo: products.grupo, total: sum(saleItems.valorVendaTotalLiquido), sales: countDistinct(saleItems.vendaId) })
		.from(saleItems)
		.innerJoin(sales, eq(saleItems.vendaId, sales.id))
		.leftJoin(products, eq(saleItems.produtoId, products.id))
		.where(and(eq(saleItems.organizacaoId, userOrgId), eq(products.organizacaoId, userOrgId), saleWhere))
		.groupBy(products.grupo)
		.orderBy(desc(sql`sum(${saleItems.valorVendaTotalLiquido})`))
		.limit(10);

	const bySellerTop10Raw = await db
		.select({
			vendedorId: sales.vendedorId,
			vendedorNome: sellers.nome,
			qtde: count(sales.id),
			total: sum(sales.valorTotal),
		})
		.from(sales)
		.leftJoin(sellers, eq(sales.vendedorId, sellers.id))
		.where(and(eq(sellers.organizacaoId, userOrgId), saleWhere))
		.groupBy(sales.vendedorId, sellers.nome)
		.orderBy(desc(sql`sum(${sales.valorTotal})`))
		.limit(10);

	const byProductTop10Raw = await db
		.select({
			produtoId: saleItems.produtoId,
			produtoNome: products.nome,
			produtoGrupo: products.grupo,
			qtde: sum(saleItems.quantidade),
			total: sum(saleItems.valorVendaTotalLiquido),
		})
		.from(saleItems)
		.innerJoin(sales, eq(saleItems.vendaId, sales.id))
		.leftJoin(products, eq(saleItems.produtoId, products.id))
		.where(and(eq(saleItems.organizacaoId, userOrgId), eq(products.organizacaoId, userOrgId), saleWhere))
		.groupBy(saleItems.produtoId, products.nome, products.grupo)
		.orderBy(desc(sql`sum(${saleItems.valorVendaTotalLiquido})`))
		.limit(10);

	const dayExpr = sql<number>`extract(day from ${sales.dataVenda})`;
	const byDayOfMonthRaw = await db
		.select({ dia: dayExpr, qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.where(saleWhere)
		.groupBy(dayExpr)
		.orderBy(dayExpr);

	const monthExpr = sql<number>`extract(month from ${sales.dataVenda})`;
	const byMonthRaw = await db
		.select({ mes: monthExpr, qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.where(saleWhere)
		.groupBy(monthExpr)
		.orderBy(monthExpr);

	const weekDayExpr = sql<number>`extract(dow from ${sales.dataVenda})`;
	const byWeekDayRaw = await db
		.select({ semana: weekDayExpr, qtde: count(sales.id), total: sum(sales.valorTotal) })
		.from(sales)
		.where(saleWhere)
		.groupBy(weekDayExpr)
		.orderBy(weekDayExpr);

	return {
		data: {
			cliente: {
				nome: client.nome,
				telefone: client.telefone,
				email: client.email,
				cpfCnpj: client.cpfCnpj,
				canalAquisicao: client.canalAquisicao,
				localizacaoCidade: client.localizacaoCidade,
				localizacaoEstado: client.localizacaoEstado,
				localizacaoBairro: client.localizacaoBairro,
				localizacaoLogradouro: client.localizacaoLogradouro,
				localizacaoNumero: client.localizacaoNumero,
				localizacaoComplemento: client.localizacaoComplemento,
				localizacaoCep: client.localizacaoCep,
				dataNascimento: client.dataNascimento,
				dataInsercao: client.dataInsercao,
				analiseRFMTitulo: client.analiseRFMTitulo,
			},
			dataPrimeiraCompra: firstPurchaseDate,
			dataUltimaCompra: lastPurchaseDate,

			valorComproTotal: totalPurchasesValue,
			valorComproGrupoPeriodo: totalPurchasesValuePeriodGroupMap,
			qtdeCompras: totalPurchasesCount,
			ticketMedio: avgPurchaseValue,
			// Mesmas métricas sem recorte de período — o que o cabeçalho persistente mostra.
			totais: {
				qtdeCompras: lifetimePurchasesCount,
				valorComproTotal: lifetimePurchasesValue,
				ticketMedio: lifetimeAvgPurchaseValue,
			},
			resultadosAgrupados: {
				grupo: byProductGroupRaw.map((row) => ({
					grupo: row.grupo ?? null,
					quantidade: row.sales ? Number(row.sales) : 0,
					total: row.total ? Number(row.total) : 0,
				})),
				vendedor: bySellerTop10Raw.map((row) => ({
					vendedorId: row.vendedorId,
					vendedorNome: row.vendedorNome ?? null,
					quantidade: Number(row.qtde ?? 0),
					total: row.total ? Number(row.total) : 0,
				})),
				produto: byProductTop10Raw.map((row) => ({
					produtoId: row.produtoId,
					produtoNome: row.produtoNome ?? "",
					produtoGrupo: row.produtoGrupo ?? null,
					quantidade: row.qtde ? Number(row.qtde) : 0,
					total: row.total ? Number(row.total) : 0,
				})),
				dia: byDayOfMonthRaw.map((row) => ({
					dia: Number(row.dia),
					quantidade: Number(row.qtde ?? 0),
					total: row.total ? Number(row.total) : 0,
				})),
				mes: byMonthRaw.map((row) => ({
					mes: Number(row.mes),
					quantidade: Number(row.qtde ?? 0),
					total: row.total ? Number(row.total) : 0,
				})),
				diaSemana: byWeekDayRaw.map((row) => ({
					diaSemana: Number(row.semana),
					quantidade: Number(row.qtde ?? 0),
					total: row.total ? Number(row.total) : 0,
				})),
			},
		},
	};
}
export type TGetClientStatsOutput = Awaited<ReturnType<typeof getClientStats>>;

const getClientStatsHandler: PagesRouteHandler<TGetClientStatsOutput> = async (req, res) => {
	const sessionUser = await getCurrentSessionUncached();
	if (!sessionUser) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetClientStatsInputSchema.parse({
		clientId: req.query.clientId as string,
		periodAfter: (req.query.periodAfter as string | undefined) ?? null,
		periodBefore: (req.query.periodBefore as string | undefined) ?? null,
	});
	const data = await getClientStats({ session: sessionUser, input });
	return res.status(200).json(data);
};

const routeHandlers = {
	GET: getClientStatsHandler,
} satisfies Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", PagesRouteHandler<any>>>;

export const GET = appApiHandler({
	GET: (request) => runPagesRouteHandler({ request, handler: routeHandlers.GET! }),
});
