import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { campaignFlowExecutionSteps, campaignFlowExecutions } from "@/services/drizzle/schema";
import { and, count, desc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// GET: List steps for an execution
// ============================================================================

const GetCampaignFlowExecutionStepsInputSchema = z.object({
	execucaoId: z.string({
		required_error: "ID da execução não informado.",
		invalid_type_error: "Tipo não válido para o ID da execução.",
	}),
	page: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : 1)),
});
export type TGetCampaignFlowExecutionStepsInput = z.infer<typeof GetCampaignFlowExecutionStepsInputSchema>;

async function getCampaignFlowExecutionSteps({ input, session }: { input: TGetCampaignFlowExecutionStepsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	// Verify the execution belongs to user's org
	const execution = await db.query.campaignFlowExecutions.findFirst({
		where: and(
			eq(campaignFlowExecutions.id, input.execucaoId),
			eq(campaignFlowExecutions.organizacaoId, userOrgId),
		),
		columns: { id: true },
	});
	if (!execution) throw new createHttpError.NotFound("Execução não encontrada.");

	const PAGE_SIZE = 50;
	const conditions = [eq(campaignFlowExecutionSteps.execucaoId, input.execucaoId)];

	const [{ matched }] = await db
		.select({ matched: count() })
		.from(campaignFlowExecutionSteps)
		.where(and(...conditions));

	if (matched === 0) {
		return {
			data: { steps: [], matched: 0, totalPages: 0 },
			message: "Nenhum passo encontrado.",
		};
	}

	const totalPages = Math.ceil(matched / PAGE_SIZE);

	const steps = await db.query.campaignFlowExecutionSteps.findMany({
		where: and(...conditions),
		orderBy: [desc(campaignFlowExecutionSteps.dataInsercao)],
		with: {
			no: { columns: { id: true, tipo: true, subtipo: true, rotulo: true } },
			cliente: { columns: { id: true, nome: true } },
		},
		offset: PAGE_SIZE * (input.page - 1),
		limit: PAGE_SIZE,
	});

	return {
		data: { steps, matched, totalPages },
		message: "Passos da execução obtidos com sucesso.",
	};
}
export type TGetCampaignFlowExecutionStepsOutput = Awaited<ReturnType<typeof getCampaignFlowExecutionSteps>>;

async function getCampaignFlowExecutionStepsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const searchParams = request.nextUrl.searchParams;
	const execucaoId = searchParams.get("execucaoId");
	if (!execucaoId) throw new createHttpError.BadRequest("ID da execução não informado.");

	const input = GetCampaignFlowExecutionStepsInputSchema.parse({
		execucaoId,
		page: searchParams.get("page") ?? undefined,
	});
	const result = await getCampaignFlowExecutionSteps({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCampaignFlowExecutionStepsRoute });
