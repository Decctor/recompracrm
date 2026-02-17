import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { internalLeadActivities, internalLeads } from "@/services/drizzle/schema";
import { InternalLeadStatusCRMOptions } from "@/utils/select-options";
import { and, count, gte, lte, sum } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ==================== GET - CRM Stats ====================

const GetStatsInputSchema = z.object({
	periodAfter: z.string().optional(),
	periodBefore: z.string().optional(),
});
export type TGetStatsInput = z.infer<typeof GetStatsInputSchema>;

async function getCrmStats(input: TGetStatsInput) {
	const periodConditions = [];
	if (input.periodAfter) periodConditions.push(gte(internalLeads.dataInsercao, new Date(input.periodAfter)));
	if (input.periodBefore) periodConditions.push(lte(internalLeads.dataInsercao, new Date(input.periodBefore)));
	const periodWhere = periodConditions.length > 0 ? and(...periodConditions) : undefined;

	// Leads per stage
	const leadsPerStage = await db
		.select({
			status: internalLeads.statusCRM,
			count: count(),
			totalValor: sum(internalLeads.valor),
		})
		.from(internalLeads)
		.where(periodWhere)
		.groupBy(internalLeads.statusCRM);

	const stageMap: Record<string, { count: number; totalValor: number }> = {};
	for (const stage of InternalLeadStatusCRMOptions) {
		stageMap[stage.value] = { count: 0, totalValor: 0 };
	}
	for (const row of leadsPerStage) {
		stageMap[row.status] = {
			count: row.count,
			totalValor: Number(row.totalValor) || 0,
		};
	}

	// Overall stats
	const totalLeads = Object.values(stageMap).reduce((acc, s) => acc + s.count, 0);
	const ganhos = stageMap.GANHO?.count ?? 0;
	const perdidos = stageMap.PERDIDO?.count ?? 0;
	const taxaConversao = totalLeads > 0 ? ((ganhos / totalLeads) * 100).toFixed(1) : "0";
	const valorPipeline = Object.entries(stageMap)
		.filter(([key]) => !["GANHO", "PERDIDO"].includes(key))
		.reduce((acc, [, s]) => acc + s.totalValor, 0);

	// Activities stats
	const activityConditions = [];
	if (input.periodAfter) activityConditions.push(gte(internalLeadActivities.dataInsercao, new Date(input.periodAfter)));
	if (input.periodBefore) activityConditions.push(lte(internalLeadActivities.dataInsercao, new Date(input.periodBefore)));

	const activityStats = await db
		.select({
			status: internalLeadActivities.status,
			count: count(),
		})
		.from(internalLeadActivities)
		.where(activityConditions.length > 0 ? and(...activityConditions) : undefined)
		.groupBy(internalLeadActivities.status);

	const atividadesPendentes = activityStats.find((a) => a.status === "PENDENTE")?.count ?? 0;
	const atividadesConcluidas = activityStats.find((a) => a.status === "CONCLUIDA")?.count ?? 0;

	// Leads per responsavel
	const leadsPerResponsavel = await db
		.select({
			responsavelId: internalLeads.responsavelId,
			count: count(),
			totalValor: sum(internalLeads.valor),
		})
		.from(internalLeads)
		.where(periodWhere)
		.groupBy(internalLeads.responsavelId);

	return {
		data: {
			stageMap,
			totalLeads,
			ganhos,
			perdidos,
			taxaConversao: Number(taxaConversao),
			valorPipeline,
			atividadesPendentes,
			atividadesConcluidas,
			leadsPerResponsavel,
		},
		message: "Estatísticas obtidas com sucesso.",
	};
}
export type TGetCrmStatsOutput = Awaited<ReturnType<typeof getCrmStats>>;

async function getCrmStatsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.user.admin) throw new createHttpError.Forbidden("Acesso restrito a administradores.");

	const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
	const input = GetStatsInputSchema.parse(searchParams);
	const result = await getCrmStats(input);
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCrmStatsRoute });
