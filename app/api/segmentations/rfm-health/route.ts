import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanViewClients } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { sales, utils } from "@/services/drizzle/schema";
import { getRFMLabel, type TRFMConfig } from "@/utils/rfm";
import dayjs from "dayjs";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const DEFAULT_ANALYSIS_MONTHS = 12;
const PERCENTILES = [0, 5, 10, 25, 50, 75, 90, 95, 100] as const;
const RFM_LABEL_ORDER = [
	"CAMPEÕES",
	"CLIENTES LEAIS",
	"POTENCIAIS CLIENTES LEAIS",
	"CLIENTES RECENTES",
	"PROMISSORES",
	"PRECISAM DE ATENÇÃO",
	"PRESTES A DORMIR",
	"EM RISCO",
	"NÃO PODE PERDÊ-LOS",
	"HIBERNANDO",
	"PERDIDOS",
] as const;

type TScoreKey = "1" | "2" | "3" | "4" | "5";
type TRFMRanges = Record<TScoreKey, { min: number; max: number }>;

const GetRFMHealthInputSchema = z.object({
	months: z
		.string({ invalid_type_error: "Tipo inválido para meses de análise." })
		.optional()
		.nullable()
		.transform((v) => {
			const parsed = v ? Number(v) : DEFAULT_ANALYSIS_MONTHS;
			return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ANALYSIS_MONTHS;
		}),
});
export type TGetRFMHealthInput = z.infer<typeof GetRFMHealthInputSchema>;

function toNumber(value: number | string | null | undefined) {
	return Number(value ?? 0);
}

function percentile(values: number[], percentileValue: number) {
	if (values.length === 0) return null;
	const sortedValues = [...values].sort((a, b) => a - b);
	const index = (percentileValue / 100) * (sortedValues.length - 1);
	const lowerIndex = Math.floor(index);
	const upperIndex = Math.ceil(index);
	const lowerValue = sortedValues[lowerIndex] ?? 0;
	const upperValue = sortedValues[upperIndex] ?? lowerValue;
	if (lowerIndex === upperIndex) return lowerValue;
	return lowerValue + (upperValue - lowerValue) * (index - lowerIndex);
}

function summarizeMetric(values: number[]) {
	const percentilesMap = Object.fromEntries(PERCENTILES.map((p) => [`p${p}`, percentile(values, p)])) as Record<
		`p${(typeof PERCENTILES)[number]}`,
		number | null
	>;
	const sum = values.reduce((acc, value) => acc + value, 0);
	const average = values.length > 0 ? sum / values.length : null;
	const median = percentile(values, 50);
	return {
		count: values.length,
		average,
		median,
		percentiles: percentilesMap,
	};
}

function buildSuggestedRanges(values: number[], higherIsBetter: boolean): TRFMRanges {
	const min = percentile(values, 0) ?? 0;
	const p20 = percentile(values, 20) ?? 0;
	const p40 = percentile(values, 40) ?? 0;
	const p60 = percentile(values, 60) ?? 0;
	const p80 = percentile(values, 80) ?? 0;
	const max = percentile(values, 100) ?? 0;

	const ascending: TRFMRanges = {
		"1": { min, max: p20 },
		"2": { min: p20, max: p40 },
		"3": { min: p40, max: p60 },
		"4": { min: p60, max: p80 },
		"5": { min: p80, max },
	};
	if (higherIsBetter) return ascending;

	return {
		"5": { min, max: p20 },
		"4": { min: p20, max: p40 },
		"3": { min: p40, max: p60 },
		"2": { min: p60, max: p80 },
		"1": { min: p80, max },
	};
}

function scoreByConfig(value: number, ranges: TRFMRanges, fallbackScore: number) {
	const matchedScore = Object.entries(ranges).find(([, range]) => value >= range.min && value <= range.max)?.[0];
	return matchedScore ? Number(matchedScore) : fallbackScore;
}

function buildHistogram(values: number[], binCount: number, options: { clipToPercentile?: number } = {}) {
	if (values.length === 0) return { bins: [], min: 0, max: 0, clippedAt: null as number | null };
	const minValue = Math.min(...values);
	const maxValueRaw = Math.max(...values);
	const clipPercentile = options.clipToPercentile ?? null;
	const clippedAt = clipPercentile ? percentile(values, clipPercentile) : null;
	const maxValue = clippedAt && clippedAt > minValue ? clippedAt : maxValueRaw;
	const range = maxValue - minValue;
	const binSize = range > 0 ? range / binCount : 1;
	const bins = Array.from({ length: binCount }, (_, index) => {
		const start = minValue + index * binSize;
		const end = index === binCount - 1 ? maxValue : start + binSize;
		return { start, end, count: 0 };
	});

	let overflowCount = 0;
	for (const value of values) {
		if (value > maxValue) {
			overflowCount += 1;
			continue;
		}
		const relative = value - minValue;
		const indexCandidate = binSize > 0 ? Math.floor(relative / binSize) : 0;
		const index = Math.max(0, Math.min(binCount - 1, indexCandidate));
		bins[index].count += 1;
	}

	return {
		bins,
		min: minValue,
		max: maxValueRaw,
		clippedAt: overflowCount > 0 ? maxValue : null,
		overflowCount,
	};
}

function buildDiscreteHistogram(values: number[], buckets: { label: string; min: number; max: number }[]) {
	return buckets.map((bucket) => ({
		label: bucket.label,
		min: bucket.min,
		max: bucket.max,
		count: values.filter((value) => value >= bucket.min && value <= bucket.max).length,
	}));
}

type TAlert = {
	id: string;
	severity: "info" | "warning" | "critical";
	title: string;
	description: string;
};

type TLabelDistributionItem = {
	label: string;
	count: number;
	percentage: number;
};

async function getRFMHealth({ input, session }: { input: TGetRFMHealthInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const analysisMonths = input.months;
	const intervalStart = dayjs().subtract(analysisMonths, "month").startOf("day").toDate();
	const intervalEnd = dayjs().endOf("day").toDate();

	const rfmConfigReturn = await db.query.utils.findFirst({
		where: and(eq(utils.identificador, "CONFIG_RFM"), eq(utils.organizacaoId, userOrgId)),
	});
	const rfmConfig = rfmConfigReturn?.valor?.identificador === "CONFIG_RFM" ? (rfmConfigReturn.valor as TRFMConfig) : null;

	if (!rfmConfig) {
		throw new createHttpError.NotFound(
			"Configuração RFM não encontrada para esta organização. Configure a matriz RFM antes de visualizar a saúde da segmentação.",
		);
	}

	const rows = await db
		.select({
			clienteId: sales.clienteId,
			totalPurchases: sql<number>`sum(${sales.valorTotal})`,
			purchaseCount: sql<number>`count(${sales.id})`,
			lastPurchaseDate: sql<Date>`max(${sales.dataVenda})`,
			firstPurchaseDate: sql<Date>`min(${sales.dataVenda})`,
		})
		.from(sales)
		.where(
			and(
				eq(sales.organizacaoId, userOrgId),
				isNotNull(sales.clienteId),
				isNotNull(sales.dataVenda),
				gte(sales.dataVenda, intervalStart),
				lte(sales.dataVenda, intervalEnd),
				eq(sales.statusVenda, "CONFIRMADA"),
			),
		)
		.groupBy(sales.clienteId);

	const clientsRfm = rows.map((row) => {
		const recencyDays = dayjs().diff(dayjs(row.lastPurchaseDate), "days");
		const frequency = toNumber(row.purchaseCount);
		const monetary = toNumber(row.totalPurchases);
		return { clienteId: row.clienteId, recencyDays, frequency, monetary };
	});

	const recencyValues = clientsRfm.map((client) => client.recencyDays);
	const frequencyValues = clientsRfm.map((client) => client.frequency);
	const monetaryValues = clientsRfm.map((client) => client.monetary);

	const recencyMetrics = summarizeMetric(recencyValues);
	const frequencyMetrics = summarizeMetric(frequencyValues);
	const monetaryMetrics = summarizeMetric(monetaryValues);

	const labelCounts: Record<string, number> = {};
	const scoreCounts = {
		recency: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>,
		frequency: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>,
		monetary: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>,
	};

	for (const client of clientsRfm) {
		const recencyScore = scoreByConfig(client.recencyDays, rfmConfig.recencia, 1);
		const frequencyScore = scoreByConfig(client.frequency, rfmConfig.frequencia, 1);
		const monetaryScore = scoreByConfig(client.monetary, rfmConfig.monetario, 1);
		scoreCounts.recency[recencyScore] = (scoreCounts.recency[recencyScore] ?? 0) + 1;
		scoreCounts.frequency[frequencyScore] = (scoreCounts.frequency[frequencyScore] ?? 0) + 1;
		scoreCounts.monetary[monetaryScore] = (scoreCounts.monetary[monetaryScore] ?? 0) + 1;
		const label = getRFMLabel({ monetary: monetaryScore, frequency: frequencyScore, recency: recencyScore });
		labelCounts[label] = (labelCounts[label] ?? 0) + 1;
	}

	const totalClients = clientsRfm.length;
	const labelDistribution: TLabelDistributionItem[] = RFM_LABEL_ORDER.map((label) => {
		const count = labelCounts[label] ?? 0;
		return {
			label,
			count,
			percentage: totalClients > 0 ? (count / totalClients) * 100 : 0,
		};
	});

	const recencyHistogram = buildHistogram(recencyValues, 15, { clipToPercentile: 95 });
	const monetaryHistogram = buildHistogram(monetaryValues, 15, { clipToPercentile: 95 });
	const frequencyHistogram = buildDiscreteHistogram(frequencyValues, [
		{ label: "1", min: 1, max: 1 },
		{ label: "2", min: 2, max: 2 },
		{ label: "3", min: 3, max: 3 },
		{ label: "4", min: 4, max: 4 },
		{ label: "5", min: 5, max: 5 },
		{ label: "6-10", min: 6, max: 10 },
		{ label: "11-20", min: 11, max: 20 },
		{ label: "20+", min: 21, max: Number.MAX_SAFE_INTEGER },
	]);

	const suggestedConfig: TRFMConfig = {
		identificador: "CONFIG_RFM",
		recencia: buildSuggestedRanges(recencyValues, false),
		frequencia: buildSuggestedRanges(frequencyValues, true),
		monetario: buildSuggestedRanges(monetaryValues, true),
	};

	const alerts = buildAlerts({
		totalClients,
		labelDistribution,
		recencyMetrics,
		monetaryMetrics,
		frequencyValues,
		rfmConfig,
	});

	const healthScore = buildHealthScore(alerts, totalClients);

	return {
		data: {
			period: {
				months: analysisMonths,
				start: intervalStart,
				end: intervalEnd,
			},
			totalClients,
			healthScore,
			alerts,
			labelDistribution,
			scoreDistribution: scoreCounts,
			metrics: {
				recency: recencyMetrics,
				frequency: frequencyMetrics,
				monetary: monetaryMetrics,
			},
			histograms: {
				recency: recencyHistogram,
				frequency: frequencyHistogram,
				monetary: monetaryHistogram,
			},
			rfmConfig,
			suggestedConfig,
		},
		message: "Saúde da matriz RFM calculada com sucesso.",
	};
}

export type TGetRFMHealthOutput = Awaited<ReturnType<typeof getRFMHealth>>;

function buildAlerts({
	totalClients,
	labelDistribution,
	recencyMetrics,
	monetaryMetrics,
	frequencyValues,
	rfmConfig,
}: {
	totalClients: number;
	labelDistribution: TLabelDistributionItem[];
	recencyMetrics: ReturnType<typeof summarizeMetric>;
	monetaryMetrics: ReturnType<typeof summarizeMetric>;
	frequencyValues: number[];
	rfmConfig: TRFMConfig;
}) {
	const alerts: TAlert[] = [];
	if (totalClients === 0) {
		alerts.push({
			id: "no-clients",
			severity: "warning",
			title: "Sem clientes para analisar.",
			description: "Não foram encontrados clientes com vendas no período. A análise depende de vendas com cliente identificado.",
		});
		return alerts;
	}

	const perdidosShare = labelDistribution.find((item) => item.label === "PERDIDOS")?.percentage ?? 0;
	if (perdidosShare >= 50) {
		alerts.push({
			id: "perdidos-critico",
			severity: "critical",
			title: `${perdidosShare.toFixed(1)}% dos clientes estão em PERDIDOS.`,
			description:
				"Mais da metade da base foi classificada como perdida. Em geral isso indica que a régua de recência está mais curta do que o ciclo real de recompra.",
		});
	} else if (perdidosShare >= 35) {
		alerts.push({
			id: "perdidos-alerta",
			severity: "warning",
			title: `${perdidosShare.toFixed(1)}% dos clientes estão em PERDIDOS.`,
			description: "Concentração alta em PERDIDOS. Vale comparar a faixa de recência configurada com a mediana real de recência da base.",
		});
	}

	const hibernandoShare = labelDistribution.find((item) => item.label === "HIBERNANDO")?.percentage ?? 0;
	if (hibernandoShare >= 30) {
		alerts.push({
			id: "hibernando-alerta",
			severity: "warning",
			title: `${hibernandoShare.toFixed(1)}% dos clientes estão em HIBERNANDO.`,
			description: "Concentração elevada em HIBERNANDO. Considere relaxar as faixas intermediárias de recência ou rever as faixas de frequência.",
		});
	}

	const frequencyOneShare = frequencyValues.length > 0 ? (frequencyValues.filter((value) => value === 1).length / frequencyValues.length) * 100 : 0;
	if (frequencyOneShare >= 50) {
		alerts.push({
			id: "frequencia-unica-compra",
			severity: "warning",
			title: `${frequencyOneShare.toFixed(1)}% dos clientes tem apenas 1 compra no período.`,
			description:
				"Quando a maioria da base é mono-compra, usar quintis puros de frequência tende a achatar as notas. Considere tratar frequência como faixas discretas.",
		});
	}

	const recencyMedian = recencyMetrics.median ?? 0;
	const recencyP90 = recencyMetrics.percentiles.p90 ?? 0;
	const configuredRecencyMax = Math.max(
		rfmConfig.recencia[1].max,
		rfmConfig.recencia[2].max,
		rfmConfig.recencia[3].max,
		rfmConfig.recencia[4].max,
		rfmConfig.recencia[5].max,
	);
	const r1Min = rfmConfig.recencia[1].min;
	if (recencyMedian > 0 && r1Min > 0 && recencyMedian > r1Min) {
		alerts.push({
			id: "recencia-curta",
			severity: "critical",
			title: "A régua de recência parece curta para o ciclo da base.",
			description: `A mediana de recência da sua base é ${Math.round(recencyMedian)} dias, mas clientes recebem score 1 a partir de ${r1Min} dias. Considere ampliar as faixas de recência.`,
		});
	}
	if (recencyP90 > 0 && configuredRecencyMax > 0 && configuredRecencyMax < recencyP90) {
		alerts.push({
			id: "recencia-teto-baixo",
			severity: "warning",
			title: "O teto de recência configurado fica abaixo do p90 da base.",
			description: `Cerca de 10% dos clientes (p90 = ${Math.round(recencyP90)} dias) ficam acima do limite máximo configurado (${configuredRecencyMax} dias) e caem direto na pior faixa.`,
		});
	}

	const monetaryAvg = monetaryMetrics.average ?? 0;
	const monetaryMedian = monetaryMetrics.median ?? 0;
	if (monetaryMedian > 0 && monetaryAvg > monetaryMedian * 3) {
		alerts.push({
			id: "monetario-outliers",
			severity: "info",
			title: "Distribuição monetária assimétrica.",
			description:
				"A média monetária é muito superior à mediana, sugerindo poucos clientes com gasto desproporcional. Faixas baseadas em média ficam distorcidas.",
		});
	}

	const frequencyDistinct = new Set(frequencyValues).size;
	if (frequencyDistinct <= 3 && totalClients > 0) {
		alerts.push({
			id: "frequencia-baixa-variancia",
			severity: "info",
			title: "Pouca variação na frequência de compra.",
			description: "A base tem pouca dispersão de frequência. Considere usar faixas discretas em vez de percentis.",
		});
	}

	const configuredRecencyRanges = [rfmConfig.recencia[1], rfmConfig.recencia[2], rfmConfig.recencia[3], rfmConfig.recencia[4], rfmConfig.recencia[5]];
	const hasRecencyOverlap = configuredRecencyRanges.some((rangeA, indexA) =>
		configuredRecencyRanges.some((rangeB, indexB) => indexA !== indexB && rangeA.min < rangeB.max && rangeA.max > rangeB.min),
	);
	if (hasRecencyOverlap) {
		alerts.push({
			id: "recencia-sobreposicao",
			severity: "warning",
			title: "Faixas de recência se sobrepõem.",
			description:
				"Algumas faixas de recência têm valores que se cruzam. Isso faz com que o score atribuído seja sempre o primeiro encontrado, mascarando o restante.",
		});
	}

	const champ = labelDistribution.find((item) => item.label === "CAMPEÕES")?.percentage ?? 0;
	const leais = labelDistribution.find((item) => item.label === "CLIENTES LEAIS")?.percentage ?? 0;
	if (champ + leais < 5 && totalClients > 50) {
		alerts.push({
			id: "topo-vazio",
			severity: "warning",
			title: "Quase ninguém na faixa de topo (CAMPEÕES + CLIENTES LEAIS).",
			description:
				"Menos de 5% da base alcança as faixas de topo. Pode ser que os limites superiores estejam altos demais para a realidade da organização.",
		});
	}

	return alerts;
}

function buildHealthScore(alerts: TAlert[], totalClients: number) {
	if (totalClients === 0) {
		return {
			classification: "INSUFICIENTE" as const,
			label: "Dados insuficientes",
			summary: "Não há clientes suficientes para avaliar a saúde da matriz.",
		};
	}

	const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
	const warningCount = alerts.filter((alert) => alert.severity === "warning").length;

	if (criticalCount >= 1) {
		return {
			classification: "DESALINHADA" as const,
			label: "Configuração possivelmente desalinhada",
			summary: "Detectamos pelo menos um sintoma forte de desalinhamento entre a configuração RFM e o comportamento real da base.",
		};
	}
	if (warningCount >= 2) {
		return {
			classification: "ATENCAO" as const,
			label: "Atenção",
			summary: "A matriz está parcialmente alinhada, mas alguns sintomas sugerem ajustes para refinar a leitura.",
		};
	}
	if (warningCount === 1) {
		return {
			classification: "ATENCAO" as const,
			label: "Atenção",
			summary: "Um ponto de atenção foi identificado. Vale conferir o detalhe antes de decisões automatizadas.",
		};
	}
	return {
		classification: "SAUDAVEL" as const,
		label: "Saudável",
		summary: "A configuração RFM parece coerente com o comportamento da sua base no período analisado.",
	};
}

async function getRFMHealthRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	assertCanViewClients(session);

	const input = GetRFMHealthInputSchema.parse({
		months: request.nextUrl.searchParams.get("months"),
	});
	const result = await getRFMHealth({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getRFMHealthRoute });
