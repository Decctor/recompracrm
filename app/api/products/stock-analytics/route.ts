import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { localDayKey } from "@/lib/operation-timezone";
import { sampleAbcCurve, summarizeAbc } from "@/lib/stock/analytics/abc";
import { buildBackwardSeries } from "@/lib/stock/analytics/balance-series";
import { CONSUMPTION_WINDOW_DAYS, resolveCoverageDays, resolveTurnover } from "@/lib/stock/analytics/consumption";
import { addDays, listLocalDayKeys } from "@/lib/stock/analytics/periods";
import {
	epochMs,
	getAbcRanking,
	getConsumptionByProduct,
	getLeadTimeByProduct,
	getPurchaseEntries,
	getStockDeltasByDay,
	getStockPositions,
	naiveUtc,
} from "@/lib/stock/analytics/queries";
import { resolveReorderPoint } from "@/lib/stock/analytics/replenishment";
import { getSessionOrganizationId } from "@/lib/stock/analytics/route-helpers";
import { db } from "@/services/drizzle";
import {
	clients,
	productStockLots,
	productStockTransactions,
	productVariants,
	productions,
	purchases,
	sales,
	suppliers,
	users,
} from "@/services/drizzle/schema";
import type { TStockMovementOriginEnum, TStockMovementTypeEnum } from "@/schemas/enums";
import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const GetProductStockAnalyticsInputSchema = z.object({
	productId: z
		.string({ required_error: "ID do produto não informado.", invalid_type_error: "Tipo inválido para ID do produto." })
		.min(1, { message: "ID do produto não informado." }),
	period: z
		.string({ invalid_type_error: "Tipo inválido para período." })
		.optional()
		.nullable()
		.transform((value) => (value ? Number(value) : 30))
		.pipe(z.union([z.literal(7), z.literal(30), z.literal(90)], { invalid_type_error: "Período inválido: use 7, 30 ou 90 dias." })),
});
export type TGetProductStockAnalyticsInput = z.infer<typeof GetProductStockAnalyticsInputSchema>;

type TTransactionRow = {
	id: string;
	tipo: TStockMovementTypeEnum;
	origem: TStockMovementOriginEnum;
	data: number;
	dia: string;
	quantidade: number;
	delta: number;
	custoUnitario: number | null;
	motivo: string | null;
	compraId: string | null;
	compraTitulo: string | null;
	fornecedor: string | null;
	vendaItemId: string | null;
	vendaIdExterno: string | null;
	clienteNome: string | null;
	producaoId: string | null;
	producaoTitulo: string | null;
	loteCodigo: string | null;
	varianteNome: string | null;
	operadorNome: string | null;
};

export type TProductStockEventType = "COMPRA" | "PRODUCAO" | "DESCARTE" | "VENDA";
export type TProductStockEventOrigin = { tipo: "COMPRA" | "VENDA" | "PRODUCAO" | "LOTE" | "MANUAL" | "VARIANTE"; rotulo: string };

/**
 * Painel analítico de estoque de um produto: saldo e movimentações por dia, eventos relevantes,
 * consumo, cobertura, giro, ponto de pedido e posição na curva ABC.
 *
 * O saldo é o do produto somado ao das variantes rastreadas. A série e o saldo antes/depois dos
 * eventos são reconstruídos de trás para frente a partir do saldo atual.
 */
async function getProductStockAnalytics({ input, organizationId }: { input: TGetProductStockAnalyticsInput; organizationId: string }) {
	const now = new Date();
	const after = addDays(now, -input.period);
	const [position] = await getStockPositions({ organizationId, productIds: [input.productId] });
	if (!position) return { data: { analytics: null }, message: "Produto sem rastreamento de estoque." };

	const [deltasByDay, consumption, previousConsumption, leadTimes, abcRevenue, abcVolume, purchaseHistory, transactions] = await Promise.all([
		getStockDeltasByDay({ organizationId, after, before: now, productId: input.productId }),
		getConsumptionByProduct({ organizationId, productIds: [input.productId], now }),
		getConsumptionByProduct({ organizationId, productIds: [input.productId], now: addDays(now, -CONSUMPTION_WINDOW_DAYS) }),
		getLeadTimeByProduct({ organizationId, productIds: [input.productId] }),
		getAbcRanking({ organizationId, after, before: now, metric: "FATURAMENTO" }),
		getAbcRanking({ organizationId, after, before: now, metric: "VOLUME" }),
		getPurchaseEntries({ organizationId, productId: input.productId }),
		db.execute<TTransactionRow>(sql`
			select
				t.id,
				t.tipo,
				t.origem,
				${epochMs(sql`t.data_insercao`)} as "data",
				${localDayKey(sql`t.data_insercao`)} as "dia",
				t.quantidade::float8 as "quantidade",
				(coalesce(t.saldo_posterior, 0) - coalesce(t.saldo_anterior, 0))::float8 as "delta",
				t.custo_unitario_movimentado::float8 as "custoUnitario",
				t.motivo,
				t.compra_id as "compraId",
				c.titulo as "compraTitulo",
				coalesce(f.nome, c.pedido_fornecedor_nome) as "fornecedor",
				t.venda_item_id as "vendaItemId",
				s.id_externo as "vendaIdExterno",
				cl.nome as "clienteNome",
				t.producao_id as "producaoId",
				pr.titulo as "producaoTitulo",
				l.codigo_lote as "loteCodigo",
				pv.nome as "varianteNome",
				u.nome as "operadorNome"
			from ${productStockTransactions} t
			left join ${purchases} c on c.id = t.compra_id
			left join ${suppliers} f on f.id = c.fornecedor_id
			left join ${sales} s on s.id = t.venda_id
			left join ${clients} cl on cl.id = s.cliente_id
			left join ${productions} pr on pr.id = t.producao_id
			left join ${productStockLots} l on l.id = t.lote_id
			left join ${productVariants} pv on pv.id = t.produto_variante_id
			left join ${users} u on u.id = t.operador_id
			where t.organizacao_id = ${organizationId}
				and t.produto_id = ${input.productId}
				and t.data_insercao > ${naiveUtc(after)}
				and t.data_insercao <= ${naiveUtc(now)}
			order by t.data_insercao asc, t.id asc
		`),
	]);

	// Série diária: saldo de fim de dia + entradas e saídas.
	const days = listLocalDayKeys(after, now).slice(-input.period);
	const balanceSeries = buildBackwardSeries({
		days,
		currentValue: position.saldo,
		deltaByDay: new Map([...deltasByDay].map(([dia, delta]) => [dia, delta.unidades])),
	});
	const serie = balanceSeries.map((point) => ({
		dia: point.dia,
		saldo: point.valor,
		entradas: deltasByDay.get(point.dia)?.entradas ?? 0,
		saidas: deltasByDay.get(point.dia)?.saidas ?? 0,
	}));

	// Consumo, cobertura, giro e reposição.
	const consumo = consumption.byProductId.get(input.productId) ?? consumption.empty;
	const consumoAnterior = previousConsumption.byProductId.get(input.productId) ?? previousConsumption.empty;
	const leadTime = leadTimes.get(input.productId);
	const reorder = resolveReorderPoint({
		dailyConsumption: consumo.consumoMedioDia,
		dailyStdDev: consumo.desvioPadrao,
		leadTimeDays: leadTime.prazoDias,
		balance: position.saldo,
	});
	const coberturaDias = resolveCoverageDays(position.saldo, consumo.consumoMedioDia);
	const isConsumption = (row: TTransactionRow) => row.tipo === "SAIDA_PRODUCAO" || (row.tipo === "SAIDA" && !row.compraId);
	const saidasPeriodo = transactions.filter(isConsumption).reduce((sum, row) => sum + row.quantidade, 0);
	const saldoMedio = serie.reduce((sum, point) => sum + point.saldo, 0) / Math.max(1, serie.length);

	// Saldo do produto (todas as variantes) antes e depois de cada movimentação da janela.
	const totalAfter: number[] = Array.from({ length: transactions.length }, () => 0);
	let running = position.saldo;
	for (let index = transactions.length - 1; index >= 0; index--) {
		totalAfter[index] = running;
		running -= transactions[index].delta;
	}
	const totalBefore = (index: number) => totalAfter[index] - transactions[index].delta;

	// Custo da compra anterior a cada compra (histórico completo, média ponderada entre variantes).
	const purchaseCosts = new Map<string, { quantidade: number; custoTotal: number; data: number }>();
	for (const entry of purchaseHistory) {
		if (entry.custoUnitario == null) continue;
		const purchase = purchaseCosts.get(entry.compraId) ?? { quantidade: 0, custoTotal: 0, data: entry.data };
		purchase.quantidade += entry.quantidade;
		purchase.custoTotal += entry.quantidade * entry.custoUnitario;
		purchase.data = Math.min(purchase.data, entry.data);
		purchaseCosts.set(entry.compraId, purchase);
	}
	const orderedPurchases = [...purchaseCosts.entries()].sort((a, b) => a[1].data - b[1].data);
	const previousPurchaseCost = new Map<string, number | null>(
		orderedPurchases.map(([compraId], index) => {
			const previous = orderedPurchases[index - 1]?.[1];
			return [compraId, previous && previous.quantidade > 0 ? previous.custoTotal / previous.quantidade : null];
		}),
	);

	// Eventos: compras e produções agrupadas pelo documento, cada descarte, e as vendas atípicas.
	const groups = new Map<string, { tipo: TProductStockEventType; indexes: number[] }>();
	transactions.forEach((row, index) => {
		let key: string | null = null;
		let tipo: TProductStockEventType | null = null;
		if (row.tipo === "ENTRADA_AQUISICAO") {
			tipo = "COMPRA";
			key = `compra:${row.compraId ?? row.id}`;
		} else if (row.tipo === "ENTRADA_PRODUCAO") {
			tipo = "PRODUCAO";
			key = `producao:${row.producaoId ?? row.id}`;
		} else if (row.tipo === "DESCARTE") {
			tipo = "DESCARTE";
			key = `descarte:${row.id}`;
		} else if (row.tipo === "SAIDA" && row.vendaItemId) {
			tipo = "VENDA";
			key = `venda:${row.vendaItemId}`;
		}
		if (!key || !tipo) return;
		const group = groups.get(key) ?? { tipo, indexes: [] };
		group.indexes.push(index);
		groups.set(key, group);
	});

	const eventos = [...groups.entries()]
		.map(([key, group]) => {
			const rows = group.indexes.map((index) => transactions[index]);
			const first = rows[0];
			const quantidade = rows.reduce((sum, row) => sum + row.delta, 0);
			const costed = rows.filter((row) => row.custoUnitario != null);
			const costedQuantity = costed.reduce((sum, row) => sum + row.quantidade, 0);
			const custoUnitario =
				costedQuantity > 0 ? costed.reduce((sum, row) => sum + row.quantidade * (row.custoUnitario as number), 0) / costedQuantity : null;
			const lotes = [...new Set(rows.map((row) => row.loteCodigo).filter((code): code is string => !!code))];
			const variantes = [...new Set(rows.map((row) => row.varianteNome).filter((name): name is string => !!name))];

			const origens: TProductStockEventOrigin[] = [];
			if (group.tipo === "COMPRA") origens.push({ tipo: "COMPRA", rotulo: first.compraTitulo ?? "Compra" });
			if (group.tipo === "VENDA") origens.push({ tipo: "VENDA", rotulo: first.vendaIdExterno ? `#${first.vendaIdExterno}` : "Venda" });
			if (group.tipo === "PRODUCAO") origens.push({ tipo: "PRODUCAO", rotulo: first.producaoTitulo ?? "Produção" });
			if (first.origem === "MANUAL") origens.push({ tipo: "MANUAL", rotulo: "Manual" });
			for (const name of variantes) origens.push({ tipo: "VARIANTE", rotulo: name });
			for (const code of lotes) origens.push({ tipo: "LOTE", rotulo: code });

			const motivo =
				group.tipo === "COMPRA" ? first.fornecedor : group.tipo === "VENDA" ? (first.clienteNome ? `Cliente: ${first.clienteNome}` : null) : first.motivo;
			return {
				id: key,
				tipo: group.tipo,
				data: first.data,
				dia: first.dia,
				quantidade,
				saldoAnterior: totalBefore(group.indexes[0]),
				saldoPosterior: totalAfter[group.indexes[group.indexes.length - 1]],
				custoUnitario,
				origens,
				motivo,
				operador: first.operadorNome ?? (first.origem === "SISTEMA" ? "Sistema" : null),
				custoCompraAnterior: group.tipo === "COMPRA" && first.compraId ? (previousPurchaseCost.get(first.compraId) ?? null) : null,
				multiploConsumo: group.tipo === "VENDA" && consumo.consumoMedioDia > 0 ? Math.abs(quantidade) / consumo.consumoMedioDia : null,
			};
		})
		.filter((event) => event.tipo !== "VENDA" || (consumo.limiteAtipico != null && Math.abs(event.quantidade) >= consumo.limiteAtipico))
		.sort((a, b) => a.data - b.data);

	// Curva ABC (faturamento) e classe por volume.
	const revenueItem = abcRevenue.byProductId.get(input.productId) ?? null;
	const volumeItem = abcVolume.byProductId.get(input.productId) ?? null;
	const revenueSummary = summarizeAbc(abcRevenue.ranked);
	const totalProdutos = abcRevenue.ranked.length;
	const faturamentoTotal = abcRevenue.ranked.reduce((sum, item) => sum + item.valor, 0);

	return {
		data: {
			analytics: {
				produto: { saldo: position.saldo, unidade: position.unidade, precoVenda: position.precoVenda },
				kpis: {
					coberturaDias,
					consumoMedioDia: consumo.consumoMedioDia,
					consumoMedioAnterior: consumoAnterior.consumoMedioDia,
					desvioPadrao: consumo.desvioPadrao,
					giro: resolveTurnover(saidasPeriodo, saldoMedio),
					saidasPeriodo,
				},
				reposicao: {
					prazoDias: leadTime.prazoDias,
					prazoOrigem: leadTime.origem,
					comprasConsideradas: leadTime.compras,
					...reorder,
					rupturaPrevista: coberturaDias != null ? addDays(now, coberturaDias).getTime() : null,
				},
				serie,
				eventos,
				abc: {
					classe: revenueItem?.classe ?? "C",
					classeVolume: volumeItem?.classe ?? "C",
					posicao: revenueItem?.posicao ?? null,
					totalProdutos,
					faturamento: revenueItem?.valor ?? 0,
					participacao: revenueItem?.participacao ?? 0,
					faturamentoTotal,
					classes: revenueSummary,
					curva: sampleAbcCurve(abcRevenue.ranked, 40),
					ponto: revenueItem && totalProdutos > 0 ? { x: revenueItem.posicao / totalProdutos, y: revenueItem.acumulado } : null,
				},
			},
		},
		message: "Análise de estoque do produto obtida com sucesso.",
	};
}
export type TGetProductStockAnalyticsOutput = Awaited<ReturnType<typeof getProductStockAnalytics>>;
export type TProductStockAnalytics = NonNullable<TGetProductStockAnalyticsOutput["data"]["analytics"]>;

async function getProductStockAnalyticsRoute(request: NextRequest) {
	const organizationId = getSessionOrganizationId(await getCurrentSessionUncached());
	const searchParams = request.nextUrl.searchParams;
	const input = GetProductStockAnalyticsInputSchema.parse({ productId: searchParams.get("productId"), period: searchParams.get("period") });
	const result = await getProductStockAnalytics({ input, organizationId });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getProductStockAnalyticsRoute });
