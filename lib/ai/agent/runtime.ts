import { AiAgentCapabilitiesSchema, AiAgentModelConfigSchema, type TAiAgentTurnOutput } from "@/schemas/ai-agents";
import { AiAgentAttachmentTypeEnum, type TAiAgentRunTriggerEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import type { DB, DBTransaction } from "@/services/drizzle";
import { aiAgents, organizations } from "@/services/drizzle/schema";
import { NoObjectGeneratedError, Output, ToolLoopAgent, stepCountIs } from "ai";
import { eq } from "drizzle-orm";
import z from "zod";
import { resolveLanguageModel } from "../providers/language";
import { resolveLanguageModelId } from "../providers/models";
import { normalizeAiUsage, type TAiUsageSegment } from "../providers/usage";
import { isAiGatewayCreditError, notifyAiGatewayCreditExhausted } from "../providers/credit-alert";
import { AgentDailyRunLimitError, AgentInactiveError, AgentRunAbortedError, formatAgentErrorChain } from "../shared/errors";
import { parseJsonbWithFallback } from "../shared/json";
import { listActiveProductGroups } from "../shared/product-groups";
import { isToolEnabled } from "../tools/guards";
import { toAISdkTools } from "../tools/registry";
import type { TAgentToolContext } from "../tools/types";
import { normalizeTurnAttachment } from "./attachment";
import { buildChatRunContext, formatChatRunContext } from "./context";
import { formatKnowledgeContext, getActiveKnowledgeBlocks } from "./knowledge";
import { buildAgentSystemPrompt } from "./prompts";
import { mergeRunSummary } from "./run-memory";
import { assertAiSpendWithinLimit } from "./spend";
import { notifyAiSpendThresholdIfReached } from "./spend-alert";
import { completeAgentRun, countAgentRunsToday, createAgentRun, failAgentRun, markAgentRunCancelled, markAgentRunRunning } from "./runs";
import { shouldRetryDeferredAction } from "./turn-validation";

type TDb = DB | DBTransaction;
const STRUCTURED_OUTPUT_FALLBACK_MODEL = "openai/gpt-5-mini";

/**
 * Quantas mensagens do cliente as ferramentas recebem para interpretar o pedido. Cobre o vaivém
 * típico entre o pedido ("até 500 reais") e a cobrança ("quais são?") sem arrastar um filtro que
 * o cliente já abandonou.
 */
const RECENT_CLIENT_MESSAGES_WINDOW = 5;

const TurnOutputSchema = z.object({
	mensagem: z
		.string()
		.nullable()
		.describe(
			"Mensagem a enviar ao cliente no WhatsApp: até 5 frases (listas de produtos com preço não contam), no máximo 1 emoji. null somente quando um humano acabou de assumir a conversa.",
		),
	anexo: z
		.object({
			url: z.string().describe("URL do arquivo, copiada literalmente das instruções ou da base de conhecimento."),
			tipo: AiAgentAttachmentTypeEnum.describe("IMAGEM, VIDEO ou DOCUMENTO (PDF e afins)."),
			nomeArquivo: z.string().nullable().describe("Nome com que o arquivo aparece para o cliente, com extensão. null usa o nome padrão do provedor."),
		})
		.nullable()
		.describe(
			"Arquivo a enviar junto da mensagem, que vira a legenda dele. null na grande maioria dos turnos: só preencha quando a URL existir literalmente nas instruções ou na base de conhecimento.",
		),
	resumoAtendimento: z.string().describe("Resumo interno do estado do atendimento, para a equipe. Não é visto pelo cliente."),
});

export type TPreparedAgentExecution = {
	run: { id: string };
	toolContext: TAgentToolContext;
	systemPrompt: string;
	turnPrompt: string;
	modeloConfig: ReturnType<typeof AiAgentModelConfigSchema.parse>;
	maxSteps: number;
	previousSummary: string | null;
};

function formatRunError(error: unknown): string {
	if (!NoObjectGeneratedError.isInstance(error)) return formatAgentErrorChain(error);
	const cause = error.cause instanceof Error ? error.cause.message : error.cause ? String(error.cause) : null;
	return [error.message, error.finishReason ? `finishReason=${error.finishReason}` : null, cause ? `causa=${cause}` : null]
		.filter(Boolean)
		.join(" | ");
}

/**
 * Fase 1 do runtime: carrega e valida o agente, checa limites, monta contexto e abre o run.
 *
 * As validações aqui são defesa em profundidade — o webhook já checou status e capacidade
 * antes de chegar até aqui, mas a configuração pode mudar no intervalo, e o playground entra
 * por outro caminho.
 */
export async function prepareAgentExecution({
	organizacaoId,
	chatId,
	gatilho,
	mensagemGatilhoId,
	database = db,
}: {
	organizacaoId: string;
	chatId: string;
	gatilho: TAiAgentRunTriggerEnum;
	mensagemGatilhoId?: string | null;
	database?: TDb;
}): Promise<TPreparedAgentExecution> {
	const agent = await database.query.aiAgents.findFirst({ where: eq(aiAgents.organizacaoId, organizacaoId) });
	if (!agent) throw new AgentInactiveError("A organização não possui um agente de IA configurado.");
	if (agent.status !== "ATIVO") throw new AgentInactiveError("O agente de IA da organização está pausado.");

	const modeloConfig = parseJsonbWithFallback(AiAgentModelConfigSchema, agent.modeloConfig);
	const capacidades = parseJsonbWithFallback(AiAgentCapabilitiesSchema, agent.capacidades);

	const runsToday = await countAgentRunsToday(database, organizacaoId);
	if (runsToday >= capacidades.limites.maxRunsDiarios) {
		throw new AgentDailyRunLimitError(`Limite diário de ${capacidades.limites.maxRunsDiarios} execuções do agente atingido.`);
	}

	// Segundo freio, em moeda: `recursos.iaAtendimento.limiteCreditos` como teto mensal estimado.
	const organization = await database.query.organizations.findFirst({ where: eq(organizations.id, organizacaoId), columns: { configuracao: true } });
	await assertAiSpendWithinLimit(database, { organizacaoId, configuracao: organization?.configuracao });

	const [{ contexto: chatContext, clienteId }, knowledge, productGroups] = await Promise.all([
		buildChatRunContext(database, { organizacaoId, chatId }),
		getActiveKnowledgeBlocks(database, agent.id),
		// A grafia dos grupos entra no system prompt para o agente não filtrar por categoria
		// inexistente nem gastar uma tool call para descobrir o que a empresa vende.
		isToolEnabled(capacidades, "produtos.consultar") ? listActiveProductGroups(database, organizacaoId) : Promise.resolve([]),
	]);

	const run = await createAgentRun(database, {
		organizacaoId,
		agenteId: agent.id,
		gatilho,
		chatId,
		clienteId,
		mensagemGatilhoId,
		// Substitui o versionamento: o run carrega a configuração que o produziu.
		configSnapshot: {
			instrucoes: agent.instrucoes,
			modeloConfig,
			capacidades,
			conhecimento: knowledge.map((block) => ({ id: block.id, titulo: block.titulo })),
		},
		contextoEntradaSnapshot: chatContext,
	});
	const recentClientMessages = chatContext.conversa
		.slice()
		.reverse()
		.filter((message) => message.autor === "Cliente")
		.slice(0, RECENT_CLIENT_MESSAGES_WINDOW)
		.map((message) => message.texto);

	return {
		run,
		toolContext: {
			db: database,
			organizacaoId,
			agent: { id: agent.id, nome: agent.nome },
			// A mensagem é a chave estável entre retries do mesmo evento; no playground não há
			// mensagem gatilho e o próprio run assume esse papel.
			run: { id: run.id, gatilho, mensagemGatilhoId: mensagemGatilhoId ?? null },
			chat: { id: chatId, clienteId },
			turn: { mensagensRecentesCliente: recentClientMessages },
			effects: { handoffAttendanceId: null },
			capacidades,
		},
		systemPrompt: buildAgentSystemPrompt({
			instrucoes: agent.instrucoes,
			capacidades,
			knowledgeContext: formatKnowledgeContext(knowledge),
			productGroups,
		}),
		turnPrompt: formatChatRunContext(chatContext),
		modeloConfig,
		// A saída estruturada ocupa uma etapa adicional depois do último resultado de ferramenta.
		// O limite real de chamadas é aplicado no adapter das ferramentas.
		maxSteps: capacidades.limites.maxChamadasFerramentasPorRun + 1,
		previousSummary: chatContext.atendimento?.resumo ?? null,
	};
}

/**
 * Fase 2 do runtime: executa o turno e fecha o run.
 *
 * Não há fallback de texto: uma falha marca o run como FALHA e sobe o erro. O caminho antigo
 * respondia "estou com dificuldades técnicas" ao cliente, o que escondia o problema e gastava
 * a janela de conversa com uma mensagem inútil.
 *
 * `abortSignal` corta a geração no meio quando a conversa supera a run (ver
 * `respondToChatWithAgent`). Um turno leva dezenas de segundos e chegava ao fim para ser
 * descartado na revalidação pré-entrega — em duas semanas, 19 runs e ~500k tokens de entrada.
 */
export async function executeAgentTurn(
	prepared: TPreparedAgentExecution,
	{ abortSignal }: { abortSignal?: AbortSignal } = {},
): Promise<TAiAgentTurnOutput> {
	const { toolContext, run, modeloConfig } = prepared;

	await markAgentRunRunning(toolContext.db, run.id);

	try {
		const tools = toAISdkTools(toolContext);
		const results: Array<{ steps: Array<{ toolCalls: unknown[]; toolResults: Array<{ toolName: string; output: unknown }> }> }> = [];
		// Um trecho por chamada de modelo, na ordem: o custo é estimado por trecho com o preço do
		// modelo que o executou (o fallback de saída estruturada troca de modelo no meio da run).
		const usageSegments: TAiUsageSegment[] = [];

		const generate = async ({ modelConfig, prompt }: { modelConfig: ReturnType<typeof AiAgentModelConfigSchema.parse>; prompt: string }) => {
			const segment: TAiUsageSegment = { modelo: resolveLanguageModelId(modelConfig.modelo), usage: undefined };
			usageSegments.push(segment);
			const loopAgent = new ToolLoopAgent({
				model: resolveLanguageModel(modelConfig),
				instructions: prepared.systemPrompt,
				tools,
				temperature: modelConfig.temperatura,
				maxOutputTokens: modelConfig.maxTokensSaida,
				topP: modelConfig.topP,
				stopWhen: stepCountIs(prepared.maxSteps),
				output: Output.object({ schema: TurnOutputSchema }),
			});
			const result = await loopAgent.generate({ prompt, abortSignal });
			segment.usage = result.totalUsage;
			results.push(result);
			return result;
		};

		const generateWithFallback = async (prompt: string, preferredConfig: ReturnType<typeof AiAgentModelConfigSchema.parse> = modeloConfig) => {
			try {
				return await generate({ modelConfig: preferredConfig, prompt });
			} catch (error) {
				if (!NoObjectGeneratedError.isInstance(error) || preferredConfig.modelo === STRUCTURED_OUTPUT_FALLBACK_MODEL) throw error;
				// A tentativa falha também custou tokens: o trecho já está na lista, só recebe o uso.
				usageSegments[usageSegments.length - 1]!.usage = error.usage;
				console.warn(`[AI_AGENT] Saída estruturada inválida no modelo ${preferredConfig.modelo}; repetindo com ${STRUCTURED_OUTPUT_FALLBACK_MODEL}.`);
				return generate({
					modelConfig: { ...preferredConfig, modelo: STRUCTURED_OUTPUT_FALLBACK_MODEL },
					prompt: `${prompt}\n\nA tentativa anterior não respeitou o formato estruturado exigido. Responda exatamente no schema solicitado.`,
				});
			}
		};

		const calledToolsOf = (generation: { steps: Array<{ toolCalls: unknown[] }> }) =>
			generation.steps.flatMap((step) => step.toolCalls.map((toolCall) => (toolCall as { toolName: string }).toolName));

		// Normaliza antes de qualquer decisão: uma URL torta não pode contar como entrega no
		// backstop de promessa nem chegar ao adapter de canal.
		const settleAttachment = (raw: z.infer<typeof TurnOutputSchema>) => ({ ...raw, anexo: normalizeTurnAttachment(raw.anexo) });

		let result = await generateWithFallback(prepared.turnPrompt);
		let output = result.output;
		if (!output) throw new Error("O agente não produziu uma resposta estruturada.");
		output = settleAttachment(output);

		if (shouldRetryDeferredAction({ ...output, calledTools: calledToolsOf(result) })) {
			const rejectedMessage = output.mensagem;
			// Alarme de regressão do prompt: as regras do canal já dizem que não há segundo momento.
			console.warn(
				`[AI_AGENT] Turno rejeitado por promessa sem execução (run ${run.id}, modelo ${modeloConfig.modelo}): ${JSON.stringify(rejectedMessage)}`,
			);
			result = await generateWithFallback(
				`${prepared.turnPrompt}

## Correção obrigatória
A resposta anterior foi rejeitada porque prometeu uma ação sem executar ferramenta:
${JSON.stringify(rejectedMessage)}

Execute a ferramenta nesta execução ou pergunte objetivamente o único dado que ainda falta. Não prometa executar depois.`,
				{ ...modeloConfig, modelo: STRUCTURED_OUTPUT_FALLBACK_MODEL },
			);
			output = result.output;
			if (!output) throw new Error("O agente não produziu uma resposta estruturada após a correção.");
			output = settleAttachment(output);
			if (shouldRetryDeferredAction({ ...output, calledTools: calledToolsOf(result) })) {
				throw new Error("O agente tentou encerrar novamente com uma promessa de ação sem executar ferramenta.");
			}
		}

		const toolResults = results.flatMap((generation) => generation.steps.flatMap((step) => step.toolResults));
		const finalOutput: TAiAgentTurnOutput = {
			...output,
			resumoAtendimento: mergeRunSummary({
				modelSummary: output.resumoAtendimento,
				previousSummary: prepared.previousSummary,
				toolResults,
			}),
		};

		await completeAgentRun(toolContext.db, {
			runId: run.id,
			outputResumo: finalOutput.resumoAtendimento,
			uso: normalizeAiUsage(usageSegments),
		});
		// Acessório e nunca lança: o custo desta run pode ter cruzado 80% do limite mensal.
		await notifyAiSpendThresholdIfReached({ organizacaoId: toolContext.organizacaoId });

		return finalOutput;
	} catch (error) {
		// Abortada de fora: a conversa seguiu sem esta run. Não é falha do agente.
		if (abortSignal?.aborted) {
			const reason = typeof abortSignal.reason === "string" ? abortSignal.reason : "Execução abortada.";
			await markAgentRunCancelled(toolContext.db, { runId: run.id, reason });
			throw new AgentRunAbortedError(reason);
		}

		const erro = formatRunError(error);
		await failAgentRun(toolContext.db, { runId: run.id, erro });
		// Crédito do gateway é global: esta run é só a primeira de muitas a falhar.
		if (isAiGatewayCreditError(error)) {
			await notifyAiGatewayCreditExhausted({ source: "AGENTE", organizacaoId: toolContext.organizacaoId, detail: erro });
		}
		throw error;
	}
}
