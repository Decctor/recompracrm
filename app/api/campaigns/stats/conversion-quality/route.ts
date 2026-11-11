import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { incrementalRevenueExpr, sumIncrementalRevenueExpr } from "@/lib/conversions/incremental";
import { db } from "@/services/drizzle";
import { campaignConversions } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, avg, count, eq, gte, isNotNull, lte, sql, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const GetConversionQualityInputSchema = z.object({
	startDate: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).startOf("day").toDate() : undefined)),
	endDate: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? dayjs(v).endOf("day").toDate() : undefined)),
	campanhaId: z.string().optional().nullable(),
});
export type TGetConversionQualityInput = z.infer<typeof GetConversionQualityInputSchema>;

async function getConversionQuality({ input, session }: { input: TGetConversionQualityInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const startDate = input.startDate ?? dayjs().subtract(30, "day").startOf("day").toDate();
	const endDate = input.endDate ?? dayjs().endOf("day").toDate();

	// Build base conditions
	const baseConditions = [
		eq(campaignConversions.organizacaoId, userOrgId),
		gte(campaignConversions.dataConversao, startDate),
		lte(campaignConversions.dataConversao, endDate),
	];

	if (input.campanhaId) {
		baseConditions.push(eq(campaignConversions.campanhaId, input.campanhaId));
	}

	// Get conversion type distribution
	const conversionTypeDistribution = await db
		.select({
			tipoConversao: campaignConversions.tipoConversao,
			total: count(campaignConversions.id),
			// Attributed revenue, so the per-type rows add up to the "receita atribuída" headline
			// (they only coincide with the sale amount while last-touch is the only model).
			receitaTotal: sum(campaignConversions.atribuicaoReceita),
			receitaIncremental: sumIncrementalRevenueExpr,
		})
		.from(campaignConversions)
		.where(and(...baseConditions, isNotNull(campaignConversions.tipoConversao)))
		.groupBy(campaignConversions.tipoConversao);

	// Get frequency impact metrics (only for conversions with reliable cycle data)
	const frequencyMetrics = await db
		.select({
			avgDeltaFrequencia: avg(campaignConversions.deltaFrequencia),
			totalAceleradas: sql<number>`COUNT(*) FILTER (WHERE ${campaignConversions.deltaFrequencia} > 0)`,
			totalAtrasadas: sql<number>`COUNT(*) FILTER (WHERE ${campaignConversions.deltaFrequencia} < 0)`,
			avgDiasAntecipados: sql<number>`AVG(${campaignConversions.deltaFrequencia}) FILTER (WHERE ${campaignConversions.deltaFrequencia} > 0)`,
		})
		.from(campaignConversions)
		.where(and(...baseConditions, eq(campaignConversions.cicloCompraConfiavel, true), isNotNull(campaignConversions.deltaFrequencia)));

	// Get monetary impact metrics
	const monetaryMetrics = await db
		.select({
			avgDeltaMonetarioPercentual: avg(campaignConversions.deltaMonetarioPercentual),
			totalAcimaTicket: sql<number>`COUNT(*) FILTER (WHERE ${campaignConversions.deltaMonetarioAbsoluto} > 0)`,
			totalAbaixoTicket: sql<number>`COUNT(*) FILTER (WHERE ${campaignConversions.deltaMonetarioAbsoluto} < 0)`,
			avgAumentoValor: sql<number>`AVG(${campaignConversions.deltaMonetarioPercentual}) FILTER (WHERE ${campaignConversions.deltaMonetarioPercentual} > 0)`,
		})
		.from(campaignConversions)
		.where(and(...baseConditions, isNotNull(campaignConversions.deltaMonetarioPercentual)));

	// Get overall totals
	const totals = await db
		.select({
			totalConversoes: count(campaignConversions.id),
			totalReceita: sum(campaignConversions.atribuicaoReceita),
			totalReceitaIncremental: sumIncrementalRevenueExpr,
			conversoesIncrementais: sql<number>`COUNT(*) FILTER (WHERE ${incrementalRevenueExpr} > 0)`,
			avgTicketConversao: avg(campaignConversions.vendaValor),
			avgTempoConversaoHoras: sql<number>`AVG(${campaignConversions.tempoParaConversaoMinutos}) / 60.0`,
		})
		.from(campaignConversions)
		.where(and(...baseConditions));

	// Get conversions with reliable cycle data count
	const reliableCycleCount = await db
		.select({
			total: count(campaignConversions.id),
		})
		.from(campaignConversions)
		.where(and(...baseConditions, eq(campaignConversions.cicloCompraConfiavel, true)));

	// Build type distribution map with labels
	const typeLabels: Record<string, string> = {
		AQUISICAO: "Aquisição",
		REATIVACAO: "Reativação",
		ACELERACAO: "Aceleração",
		REGULAR: "Regular",
		ATRASADA: "Atrasada",
	};

	const distribuicaoTipos = conversionTypeDistribution.map((item) => ({
		tipo: item.tipoConversao,
		label: typeLabels[item.tipoConversao ?? ""] ?? item.tipoConversao,
		quantidade: item.total,
		receita: Number(item.receitaTotal ?? 0),
		receitaIncremental: Math.round(Number(item.receitaIncremental ?? 0) * 100) / 100,
	}));

	// Calculate percentages
	const totalConversoes = totals[0]?.totalConversoes ?? 0;
	const distribuicaoComPercentuais = distribuicaoTipos.map((item) => ({
		...item,
		percentual: totalConversoes > 0 ? Math.round((item.quantidade / totalConversoes) * 10000) / 100 : 0,
	}));

	// Sort by quantity descending
	distribuicaoComPercentuais.sort((a, b) => b.quantidade - a.quantidade);

	return {
		data: {
			resumo: {
				totalConversoes,
				totalReceita: Number(totals[0]?.totalReceita ?? 0),
				totalReceitaIncremental: Math.round(Number(totals[0]?.totalReceitaIncremental ?? 0) * 100) / 100,
				conversoesIncrementais: Number(totals[0]?.conversoesIncrementais ?? 0),
				avgTicketConversao: Number(totals[0]?.avgTicketConversao ?? 0),
				avgTempoConversaoHoras: Math.round((totals[0]?.avgTempoConversaoHoras ?? 0) * 100) / 100,
				conversoesComCicloConfiavel: reliableCycleCount[0]?.total ?? 0,
			},
			distribuicaoTipos: distribuicaoComPercentuais,
			impactoFrequencia: {
				deltaFrequenciaMedio: Math.round(Number(frequencyMetrics[0]?.avgDeltaFrequencia ?? 0) * 10) / 10,
				totalAceleradas: Number(frequencyMetrics[0]?.totalAceleradas ?? 0),
				totalAtrasadas: Number(frequencyMetrics[0]?.totalAtrasadas ?? 0),
				mediasDiasAntecipados: Math.round(Number(frequencyMetrics[0]?.avgDiasAntecipados ?? 0) * 10) / 10,
			},
			impactoMonetario: {
				deltaMonetarioPercentualMedio: Math.round(Number(monetaryMetrics[0]?.avgDeltaMonetarioPercentual ?? 0) * 100) / 100,
				totalAcimaTicket: Number(monetaryMetrics[0]?.totalAcimaTicket ?? 0),
				totalAbaixoTicket: Number(monetaryMetrics[0]?.totalAbaixoTicket ?? 0),
				mediaAumentoPercentual: Math.round(Number(monetaryMetrics[0]?.avgAumentoValor ?? 0) * 100) / 100,
			},
			periodo: {
				inicio: startDate,
				fim: endDate,
			},
		},
		message: "Análise de qualidade das conversões recuperada com sucesso.",
	};
}
export type TGetConversionQualityOutput = Awaited<ReturnType<typeof getConversionQuality>>;

const getConversionQualityRoute = async (request: NextRequest) => {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const searchParams = request.nextUrl.searchParams;
	const input = GetConversionQualityInputSchema.parse({
		startDate: searchParams.get("startDate") ?? undefined,
		endDate: searchParams.get("endDate") ?? undefined,
		campanhaId: searchParams.get("campanhaId") ?? undefined,
	});

	const result = await getConversionQuality({ input, session });
	return NextResponse.json(result, { status: 200 });
};

export const GET = appApiHandler({
	GET: getConversionQualityRoute,
});
