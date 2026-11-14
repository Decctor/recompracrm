import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { resolveCampaignStatsComparisonPeriod } from "@/lib/campaigns/stats-period";
import { findChartBucketIndex, getChartBuckets, getChartGranularity } from "@/lib/charts/period-buckets";
import { canViewProductions } from "@/lib/permissions/productions";
import { db } from "@/services/drizzle";
import { productions } from "@/services/drizzle/schema";
import { and, count, eq, gte, inArray, lte } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Estatísticas de produção. Tudo sai das produções CONCLUÍDAS no período (por `dataConclusao`), pelo
 * snapshot de valoração gravado na conclusão — nunca pelo catálogo atual, que reescreveria o passado.
 *
 * Volumes nunca somam unidades diferentes: kg, L e un vêm separados (`volumes`), e o que o painel
 * mostra como "volume" é o da unidade principal (a de mais produções no período).
 */

const RequiredDateParam = (label: string) =>
	z
		.string({ required_error: `${label} não informado.`, invalid_type_error: `Tipo inválido para ${label.toLowerCase()}.` })
		.datetime({ message: `Formato inválido para ${label.toLowerCase()}.` })
		.transform((value) => new Date(value));

const OptionalDateParam = (label: string) =>
	z
		.string({ invalid_type_error: `Tipo inválido para ${label.toLowerCase()}.` })
		.datetime({ message: `Formato inválido para ${label.toLowerCase()}.` })
		.optional()
		.nullable()
		.transform((value) => (value ? new Date(value) : null));

const GetProductionStatsInputSchema = z.object({
	periodAfter: RequiredDateParam("Início do período"),
	periodBefore: RequiredDateParam("Fim do período"),
	comparingPeriodAfter: OptionalDateParam("Início do período de comparação"),
	comparingPeriodBefore: OptionalDateParam("Fim do período de comparação"),
	recipeIds: z
		.string({ invalid_type_error: "Tipo inválido para receitas." })
		.optional()
		.nullable()
		.transform((value) => (value ? value.split(",") : [])),
});
export type TGetProductionStatsInput = z.infer<typeof GetProductionStatsInputSchema>;

/** Faixas de rendimento (saída real ÷ prevista) de cada produção. */
const YIELD_BANDS = [
	{ id: "ACIMA_DO_PREVISTO", min: 1 },
	{ id: "DENTRO_DA_META", min: 0.98 },
	{ id: "ABAIXO_DO_PREVISTO", min: 0.95 },
	{ id: "PERDA_ALTA", min: Number.NEGATIVE_INFINITY },
] as const;
type TYieldBand = (typeof YIELD_BANDS)[number]["id"];

const normalizeUnit = (unit: string | null | undefined) => (unit ?? "UN").trim().toUpperCase() || "UN";

async function loadCompletedProductions({
	organizationId,
	period,
	recipeIds,
}: {
	organizationId: string;
	period: { startDate: Date; endDate: Date };
	recipeIds: string[];
}) {
	const conditions = [
		eq(productions.organizacaoId, organizationId),
		eq(productions.status, "CONCLUIDA"),
		gte(productions.dataConclusao, period.startDate),
		lte(productions.dataConclusao, period.endDate),
	];
	if (recipeIds.length > 0) conditions.push(inArray(productions.receitaId, recipeIds));

	return await db.query.productions.findMany({
		where: and(...conditions),
		columns: { id: true, receitaId: true, titulo: true, custoTotal: true, retornoEsperado: true, dataConclusao: true },
		with: {
			receita: {
				columns: { id: true, titulo: true, imagemCapaUrl: true, capaIcone: true, capaCor: true },
				with: {
					saidas: {
						columns: { id: true, quantidade: true },
						with: { produto: { columns: { unidade: true } } },
						orderBy: (fields, { asc }) => asc(fields.id),
					},
				},
			},
			entradas: {
				columns: {
					id: true,
					produtoId: true,
					produtoVarianteId: true,
					quantidadePrevista: true,
					quantidadeReal: true,
					custoUnitario: true,
					reincorporado: true,
				},
				with: {
					produto: { columns: { id: true, nome: true, unidade: true } },
					produtoVariante: { columns: { id: true, nome: true } },
				},
			},
			saidas: {
				columns: { id: true, quantidadePrevista: true, quantidadeReal: true },
				with: { produto: { columns: { unidade: true } } },
				orderBy: (fields, { asc }) => asc(fields.id),
			},
		},
	});
}
type TCompletedProduction = Awaited<ReturnType<typeof loadCompletedProductions>>[number];

/** Números de uma produção concluída, já na unidade da sua saída principal. */
function describeProduction(production: TCompletedProduction) {
	const unidade = normalizeUnit(production.saidas[0]?.produto.unidade);
	const previsto = production.saidas.reduce((total, output) => total + (output.quantidadePrevista ?? 0), 0);
	const real = production.saidas.reduce((total, output) => total + (output.quantidadeReal ?? 0), 0);
	const custo = production.custoTotal ?? 0;
	const valor = production.retornoEsperado ?? 0;
	const perda = previsto > 0 ? Math.max(previsto - real, 0) : 0;
	return {
		unidade,
		previsto,
		real,
		custo,
		valor,
		rendimento: previsto > 0 ? real / previsto : null,
		perda,
		// A perda custa o que a produção custou por unidade de saída: insumo que não virou produto.
		custoPerda: real > 0 ? perda * (custo / real) : perda > 0 ? custo : 0,
		saldoReincorporado: production.entradas
			.filter((input) => input.reincorporado)
			.reduce((total, input) => total + (input.quantidadeReal ?? input.quantidadePrevista ?? 0), 0),
	};
}

function addToUnitMap(map: Map<string, number>, unit: string, value: number) {
	if (value === 0) return;
	map.set(unit, (map.get(unit) ?? 0) + value);
}
const unitMapToList = (map: Map<string, number>) =>
	[...map.entries()].map(([unidade, quantidade]) => ({ unidade, quantidade })).sort((a, b) => b.quantidade - a.quantidade);

function summarize(described: ReturnType<typeof describeProduction>[]) {
	const volumes = new Map<string, number>();
	const productionsByUnit = new Map<string, number>();
	const losses = new Map<string, number>();
	const leftovers = new Map<string, number>();
	let valorProduzido = 0;
	let custoProducao = 0;
	let custoPerda = 0;
	let previstoTotal = 0;
	let realTotal = 0;

	for (const item of described) {
		valorProduzido += item.valor;
		custoProducao += item.custo;
		custoPerda += item.custoPerda;
		addToUnitMap(volumes, item.unidade, item.real);
		addToUnitMap(productionsByUnit, item.unidade, 1);
		addToUnitMap(losses, item.unidade, item.perda);
		addToUnitMap(leftovers, item.unidade, item.saldoReincorporado);
		if (item.previsto > 0) {
			previstoTotal += item.previsto;
			realTotal += item.real;
		}
	}

	const mainUnit = [...productionsByUnit.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
	const mainUnitVolume = mainUnit ? (volumes.get(mainUnit) ?? 0) : 0;
	const mainUnitCost = described.filter((item) => item.unidade === mainUnit).reduce((total, item) => total + item.custo, 0);
	const margem = valorProduzido - custoProducao;

	return {
		completedCount: described.length,
		valorProduzido,
		custoProducao,
		margem,
		margemPercentual: valorProduzido > 0 ? (margem / valorProduzido) * 100 : null,
		unidadePrincipal: mainUnit,
		volumePrincipal: mainUnitVolume,
		/** Custo por unidade da saída principal (ex.: R$/kg) — só das produções nessa unidade. */
		custoPorUnidadePrincipal: mainUnitVolume > 0 ? mainUnitCost / mainUnitVolume : null,
		volumes: unitMapToList(volumes),
		/** Rendimento agregado: soma das saídas reais ÷ soma das previstas. Nulo sem previsão. */
		rendimento: previstoTotal > 0 ? realTotal / previstoTotal : null,
		perdas: unitMapToList(losses),
		custoPerda,
		saldoReincorporado: unitMapToList(leftovers),
	};
}

function yieldBand(ratio: number): TYieldBand {
	return (YIELD_BANDS.find((band) => ratio >= band.min) ?? YIELD_BANDS[YIELD_BANDS.length - 1]).id;
}

type TRankingMetric = "valor" | "producoes" | "rendimento";
function buildRecipeAggregates(productionsList: TCompletedProduction[]) {
	const byRecipe = new Map<
		string,
		{ receita: NonNullable<TCompletedProduction["receita"]>; producoes: number; valor: number; previsto: number; real: number }
	>();
	for (const production of productionsList) {
		if (!production.receita) continue;
		const described = describeProduction(production);
		const current = byRecipe.get(production.receita.id) ?? { receita: production.receita, producoes: 0, valor: 0, previsto: 0, real: 0 };
		current.producoes += 1;
		current.valor += described.valor;
		if (described.previsto > 0) {
			current.previsto += described.previsto;
			current.real += described.real;
		}
		byRecipe.set(production.receita.id, current);
	}
	return [...byRecipe.values()].map((item) => ({
		...item,
		rendimento: item.previsto > 0 ? item.real / item.previsto : null,
	}));
}

function rankPositions(aggregates: ReturnType<typeof buildRecipeAggregates>, metric: TRankingMetric) {
	const sorted = [...aggregates].filter((item) => item[metric] != null).sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0));
	return new Map(sorted.map((item, index) => [item.receita.id, index + 1]));
}

async function getProductionStats({ input, session }: { input: TGetProductionStatsInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (input.periodAfter > input.periodBefore) throw new createHttpError.BadRequest("Período inválido.");

	const period = { startDate: input.periodAfter, endDate: input.periodBefore };
	const comparisonPeriod =
		input.comparingPeriodAfter && input.comparingPeriodBefore
			? { startDate: input.comparingPeriodAfter, endDate: input.comparingPeriodBefore }
			: resolveCampaignStatsComparisonPeriod(period);

	const statusConditions = (status: "EM_PRODUCAO" | "CANCELADA") => {
		const conditions = [eq(productions.organizacaoId, organizationId), eq(productions.status, status)];
		// Canceladas contam no período em que foram criadas; em andamento é o retrato de agora.
		if (status === "CANCELADA") conditions.push(gte(productions.dataInsercao, period.startDate), lte(productions.dataInsercao, period.endDate));
		if (input.recipeIds.length > 0) conditions.push(inArray(productions.receitaId, input.recipeIds));
		return and(...conditions);
	};

	const [currentProductions, comparisonProductions, inProgressResult, cancelledResult] = await Promise.all([
		loadCompletedProductions({ organizationId, period, recipeIds: input.recipeIds }),
		loadCompletedProductions({ organizationId, period: comparisonPeriod, recipeIds: input.recipeIds }),
		db
			.select({ total: count(productions.id) })
			.from(productions)
			.where(statusConditions("EM_PRODUCAO")),
		db
			.select({ total: count(productions.id) })
			.from(productions)
			.where(statusConditions("CANCELADA")),
	]);

	const currentDescribed = currentProductions.map(describeProduction);
	const comparisonDescribed = comparisonProductions.map(describeProduction);
	const currentSummary = summarize(currentDescribed);
	const comparisonSummary = summarize(comparisonDescribed);

	// Série: intervalos do calendário da operação; o período de comparação é alinhado por posição.
	const granularity = getChartGranularity(period);
	const buckets = getChartBuckets({ ...period, granularity });
	const comparisonBuckets = getChartBuckets({ ...comparisonPeriod, granularity });
	const mainUnit = currentSummary.unidadePrincipal;
	const emptyPoint = () => ({ valor: 0, volume: 0, producoes: 0 });
	const series = buckets.map((bucket) => ({ label: bucket.label, current: emptyPoint(), comparison: emptyPoint() }));
	const fillSeries = (
		list: TCompletedProduction[],
		described: ReturnType<typeof describeProduction>[],
		bucketList: typeof buckets,
		key: "current" | "comparison",
	) => {
		list.forEach((production, index) => {
			if (!production.dataConclusao) return;
			const position = findChartBucketIndex(bucketList, production.dataConclusao);
			const point = series[position]?.[key];
			if (!point) return;
			point.valor += described[index].valor;
			point.producoes += 1;
			if (described[index].unidade === mainUnit) point.volume += described[index].real;
		});
	};
	fillSeries(currentProductions, currentDescribed, buckets, "current");
	fillSeries(comparisonProductions, comparisonDescribed, comparisonBuckets, "comparison");

	// Rendimento por produção, em faixas.
	const yieldBands: Record<TYieldBand, number> = { ACIMA_DO_PREVISTO: 0, DENTRO_DA_META: 0, ABAIXO_DO_PREVISTO: 0, PERDA_ALTA: 0 };
	let evaluatedCount = 0;
	for (const item of currentDescribed) {
		if (item.rendimento == null) continue;
		evaluatedCount += 1;
		yieldBands[yieldBand(item.rendimento)] += 1;
	}

	// Ranking de receitas, com a posição que cada uma tinha no período de comparação para cada métrica.
	const currentAggregates = buildRecipeAggregates(currentProductions);
	const comparisonAggregates = buildRecipeAggregates(comparisonProductions);
	const metrics: TRankingMetric[] = ["valor", "producoes", "rendimento"];
	const comparisonPositions = Object.fromEntries(metrics.map((metric) => [metric, rankPositions(comparisonAggregates, metric)])) as Record<
		TRankingMetric,
		Map<string, number>
	>;
	const ranking = currentAggregates.map((item) => {
		const primaryOutput = item.receita.saidas[0];
		return {
			receita: {
				id: item.receita.id,
				titulo: item.receita.titulo,
				imagemCapaUrl: item.receita.imagemCapaUrl,
				capaIcone: item.receita.capaIcone,
				capaCor: item.receita.capaCor,
				rendimentoReceita: primaryOutput?.quantidade ?? null,
				unidade: normalizeUnit(primaryOutput?.produto.unidade),
			},
			producoes: item.producoes,
			valor: item.valor,
			rendimento: item.rendimento,
			previousPositions: {
				valor: comparisonPositions.valor.get(item.receita.id) ?? null,
				producoes: comparisonPositions.producoes.get(item.receita.id) ?? null,
				rendimento: comparisonPositions.rendimento.get(item.receita.id) ?? null,
			},
		};
	});

	// Insumos consumidos (sem o saldo reincorporado, que não é matéria-prima nova).
	const inputsByProduct = new Map<
		string,
		{ produtoId: string; produtoVarianteId: string | null; nome: string; unidade: string; quantidade: number; valor: number; producoes: Set<string> }
	>();
	for (const production of currentProductions) {
		for (const input of production.entradas) {
			if (input.reincorporado) continue;
			const quantity = input.quantidadeReal ?? input.quantidadePrevista ?? 0;
			if (quantity <= 0) continue;
			const key = `${input.produtoId}::${input.produtoVarianteId ?? ""}`;
			const current = inputsByProduct.get(key) ?? {
				produtoId: input.produtoId,
				produtoVarianteId: input.produtoVarianteId,
				nome: input.produtoVariante ? `${input.produto.nome} · ${input.produtoVariante.nome}` : input.produto.nome,
				unidade: normalizeUnit(input.produto.unidade),
				quantidade: 0,
				valor: 0,
				producoes: new Set<string>(),
			};
			current.quantidade += quantity;
			current.valor += quantity * (input.custoUnitario ?? 0);
			current.producoes.add(production.id);
			inputsByProduct.set(key, current);
		}
	}
	const inputs = [...inputsByProduct.values()].map(({ producoes, ...item }) => ({ ...item, producoes: producoes.size }));

	return {
		data: {
			period,
			comparisonPeriod,
			summary: {
				current: {
					...currentSummary,
					inProgressCount: Number(inProgressResult[0]?.total ?? 0),
					cancelledCount: Number(cancelledResult[0]?.total ?? 0),
				},
				comparison: comparisonSummary,
			},
			series: { granularity, points: series },
			yield: { evaluatedCount, bands: yieldBands },
			ranking,
			inputs,
		},
		message: "Estatísticas de produção calculadas com sucesso.",
	};
}
export type TGetProductionStatsOutput = Awaited<ReturnType<typeof getProductionStats>>;

async function getProductionStatsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!canViewProductions(session.membership.permissoes)) throw new createHttpError.Forbidden("Você não possui permissão para visualizar a produção.");
	const searchParams = request.nextUrl.searchParams;
	const input = GetProductionStatsInputSchema.parse({
		periodAfter: searchParams.get("periodAfter"),
		periodBefore: searchParams.get("periodBefore"),
		comparingPeriodAfter: searchParams.get("comparingPeriodAfter"),
		comparingPeriodBefore: searchParams.get("comparingPeriodBefore"),
		recipeIds: searchParams.get("recipeIds"),
	});
	const result = await getProductionStats({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getProductionStatsRoute });
