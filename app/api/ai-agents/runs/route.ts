import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { hasChatPermission } from "@/lib/chats/access";
import { AiAgentRunTriggerEnum, AiAgentRunStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { aiAgentRuns, aiAgentToolCalls } from "@/services/drizzle/schema";
import { and, asc, count, desc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

const RUNS_PAGE_SIZE = 20;

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

const GetAiAgentRunsInputSchema = z.object({
	id: z.string({ invalid_type_error: "Tipo inválido para o ID da execução." }).optional().nullable(),
	page: z
		.string({ invalid_type_error: "Tipo inválido para a página." })
		.optional()
		.nullable()
		.transform((v) => (v ? Number(v) : 1)),
	gatilho: z
		.string({ invalid_type_error: "Tipo inválido para o gatilho." })
		.optional()
		.nullable()
		.transform((v) => (v ? AiAgentRunTriggerEnum.parse(v) : null)),
	status: z
		.string({ invalid_type_error: "Tipo inválido para o status." })
		.optional()
		.nullable()
		.transform((v) => (v ? AiAgentRunStatusEnum.parse(v) : null)),
	// Histórico por atendimento no hub: só as runs de um chat.
	chatId: z.string({ invalid_type_error: "Tipo inválido para o ID do chat." }).optional().nullable(),
});
export type TGetAiAgentRunsInput = z.infer<typeof GetAiAgentRunsInputSchema>;

// ============================================================================
// SERVICES
// ============================================================================

async function getAiAgentRuns({ input, organizacaoId }: { input: TGetAiAgentRunsInput; organizacaoId: string }) {
	// Modo por id: a execução com a timeline completa de chamadas de ferramenta.
	if (input.id) {
		const run = await db.query.aiAgentRuns.findFirst({
			where: and(eq(aiAgentRuns.id, input.id), eq(aiAgentRuns.organizacaoId, organizacaoId)),
			with: {
				mensagemEnviada: { columns: { id: true, conteudoTexto: true, dataEnvio: true, statusEntrega: true } },
			},
		});

		if (!run) throw new createHttpError.NotFound("Execução não encontrada.");

		const toolCalls = await db.query.aiAgentToolCalls.findMany({
			where: and(eq(aiAgentToolCalls.runId, run.id), eq(aiAgentToolCalls.organizacaoId, organizacaoId)),
			orderBy: [asc(aiAgentToolCalls.dataInsercao)],
			with: {
				operacao: {
					columns: {
						id: true,
						tipo: true,
						status: true,
						recursoTipo: true,
						recursoId: true,
						erro: true,
						dataInicio: true,
						dataFim: true,
					},
					with: {
						chamadas: { columns: { id: true } },
					},
				},
			},
		});

		return {
			data: { byId: { ...run, chamadasFerramentas: toolCalls }, default: null },
			message: "Execução carregada com sucesso.",
		};
	}

	const conditions = [eq(aiAgentRuns.organizacaoId, organizacaoId)];
	if (input.chatId) conditions.push(eq(aiAgentRuns.chatId, input.chatId));
	if (input.gatilho) conditions.push(eq(aiAgentRuns.gatilho, input.gatilho));
	if (input.status) conditions.push(eq(aiAgentRuns.status, input.status));
	const where = and(...conditions);

	const page = Math.max(1, input.page);
	const [totalRow] = await db.select({ total: count() }).from(aiAgentRuns).where(where);
	const total = Number(totalRow?.total ?? 0);

	const runs = await db.query.aiAgentRuns.findMany({
		where,
		orderBy: [desc(aiAgentRuns.dataInsercao)],
		limit: RUNS_PAGE_SIZE,
		offset: (page - 1) * RUNS_PAGE_SIZE,
		columns: {
			id: true,
			status: true,
			gatilho: true,
			chatId: true,
			outputResumo: true,
			uso: true,
			erro: true,
			dataInicio: true,
			dataFim: true,
			dataInsercao: true,
		},
	});

	return {
		data: {
			byId: null,
			default: {
				runs,
				pagination: { page, totalPages: Math.max(1, Math.ceil(total / RUNS_PAGE_SIZE)), total },
			},
		},
		message: "Execuções carregadas com sucesso.",
	};
}
export type TGetAiAgentRunsOutput = Awaited<ReturnType<typeof getAiAgentRuns>>;

// ============================================================================
// HANDLERS
// ============================================================================

async function getAiAgentRunsRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session?.membership) throw new createHttpError.Unauthorized("Sessão não encontrada.");
	// Quem atende no hub vê o que a IA fez nas conversas (o drawer abre a partir da thread); a
	// configuração da empresa continua bastando para a lista geral em Configurações.
	const canViewFromHub = hasChatPermission({ session, permission: "visualizar" });
	if (!session.membership.permissoes.empresa.visualizar && !canViewFromHub) {
		throw new createHttpError.Forbidden("Você não tem permissão para visualizar as execuções do agente de IA.");
	}

	const searchParams = request.nextUrl.searchParams;
	const input = GetAiAgentRunsInputSchema.parse({
		id: searchParams.get("id"),
		page: searchParams.get("page"),
		gatilho: searchParams.get("gatilho"),
		status: searchParams.get("status"),
		chatId: searchParams.get("chatId"),
	});

	const result = await getAiAgentRuns({ input, organizacaoId: session.membership.organizacao.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getAiAgentRunsRoute });
