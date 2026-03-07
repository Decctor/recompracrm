import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { campaignFlowExecutions } from "@/services/drizzle/schema";
import { and, count, desc, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// ============================================================================
// GET: List executions for a campaign flow
// ============================================================================

const GetCampaignFlowExecutionsInputSchema = z.object({
	campanhaId: z.string({
		required_error: "ID da campanha não informado.",
		invalid_type_error: "Tipo não válido para o ID da campanha.",
	}),
	status: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? v.split(",") : [])),
	page: z
		.string()
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : 1)),
});
export type TGetCampaignFlowExecutionsInput = z.infer<typeof GetCampaignFlowExecutionsInputSchema>;

async function getCampaignFlowExecutions({ input, session }: { input: TGetCampaignFlowExecutionsInput; session: TAuthUserSession }) {
	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const PAGE_SIZE = 25;
	const conditions = [
		eq(campaignFlowExecutions.campanhaId, input.campanhaId),
		eq(campaignFlowExecutions.organizacaoId, userOrgId),
	];

	if (input.status && input.status.length > 0) {
		conditions.push(
			sql`${campaignFlowExecutions.status} IN ${input.status}`,
		);
	}

	const [{ matched }] = await db
		.select({ matched: count() })
		.from(campaignFlowExecutions)
		.where(and(...conditions));

	if (matched === 0) {
		return {
			data: { executions: [], matched: 0, totalPages: 0 },
			message: "Nenhuma execução encontrada.",
		};
	}

	const totalPages = Math.ceil(matched / PAGE_SIZE);

	const executions = await db.query.campaignFlowExecutions.findMany({
		where: and(...conditions),
		orderBy: [desc(campaignFlowExecutions.dataInsercao)],
		with: {
			cliente: { columns: { id: true, nome: true } },
		},
		offset: PAGE_SIZE * (input.page - 1),
		limit: PAGE_SIZE,
	});

	return {
		data: { executions, matched, totalPages },
		message: "Execuções obtidas com sucesso.",
	};
}
export type TGetCampaignFlowExecutionsOutput = Awaited<ReturnType<typeof getCampaignFlowExecutions>>;

async function getCampaignFlowExecutionsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");

	const searchParams = request.nextUrl.searchParams;
	const campanhaId = searchParams.get("campanhaId");
	if (!campanhaId) throw new createHttpError.BadRequest("ID da campanha não informado.");

	const input = GetCampaignFlowExecutionsInputSchema.parse({
		campanhaId,
		status: searchParams.get("status") ?? undefined,
		page: searchParams.get("page") ?? undefined,
	});
	const result = await getCampaignFlowExecutions({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getCampaignFlowExecutionsRoute });
