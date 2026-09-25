import type { TAgentMessageDeliverer } from "@/lib/ai/agent/respond-to-chat";
import { completeAgentRun, createAgentRun, failAgentRun, markAgentRunRunning } from "@/lib/ai/agent/runs";
import { transferChatToHuman } from "@/lib/ai/agent/transfer-to-human";
import { parseJsonbWithFallback } from "@/lib/ai/shared/json";
import { isToolEnabled } from "@/lib/ai/tools/guards";
import { getCurrentChatAttendance, updateChatAttendanceCategory } from "@/lib/chats/attendance-state";
import { AiAgentCapabilitiesSchema, AiAgentModelConfigSchema, type TAiAgentCapabilities } from "@/schemas/ai-agents";
import type { DB, DBTransaction } from "@/services/drizzle";
import { type TAiAgentEntity, chatMessages, chats } from "@/services/drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import { TRIAGE_INTENT_CATEGORY, TRIAGE_MESSAGE_WINDOW, type TMessageTriage, type TTriageDecision, decideTriageAction, triageIncomingMessage } from "./message-triage";

type TDb = DB | DBTransaction;

/**
 * Gate de triagem entre a confirmação do turno e a run do agente.
 *
 * Roda **depois** do claim e da confirmação (não gastar nem centavos numa mensagem que um humano
 * já respondeu) e **antes** de `respondToChatWithAgent`. Três saídas curtas e uma normal:
 *
 * - PULAR: mensagem de encerramento sem pergunta. Nenhum turno; fica uma run CONCLUIDO de custo
 *   ~zero dizendo por quê, para a organização ver que a IA *decidiu* não responder.
 * - HANDOFF: reclamação, negociação ou pergunta dirigida a alguém. Transfere sem turno e avisa o
 *   cliente com um texto fixo — o mesmo efeito da ferramenta, sem o modelo grande no meio.
 * - MODELO_ECONOMICO: intenção simples; o turno roda no modelo barato.
 * - TURNO_COMPLETO: o comportamento de antes.
 *
 * A intenção também preenche `chat_assignments.categoria`, coluna que existia desde o redesign
 * e nunca foi escrita.
 */

const HANDOFF_NOTICE_MESSAGE = "Vou passar sua conversa para alguém da nossa equipe, que continua o atendimento com você em instantes.";

export type TTriageGateResult =
	| { acao: "PULAR" | "HANDOFF"; runId: string; triagem: TMessageTriage }
	| { acao: "MODELO_ECONOMICO"; modelo: string; triagem: TMessageTriage }
	| { acao: "TURNO_COMPLETO"; triagem: TMessageTriage | null };

function describeAuthor(autorTipo: string): string {
	if (autorTipo === "CLIENTE") return "Cliente";
	if (autorTipo === "AI") return "Assistente";
	return "Atendente";
}

export async function runTriageGate(
	db: TDb,
	input: { organizacaoId: string; chatId: string; agent: TAiAgentEntity; triggerMessageId: string; deliver: TAgentMessageDeliverer },
): Promise<TTriageGateResult> {
	const capacidades = parseJsonbWithFallback(AiAgentCapabilitiesSchema, input.agent.capacidades);
	if (!capacidades.triagem.habilitada) return { acao: "TURNO_COMPLETO", triagem: null };

	const [messages, atendimento] = await Promise.all([
		db.query.chatMessages.findMany({
			where: and(eq(chatMessages.chatId, input.chatId), eq(chatMessages.organizacaoId, input.organizacaoId)),
			orderBy: [desc(chatMessages.dataEnvio), desc(chatMessages.id)],
			limit: TRIAGE_MESSAGE_WINDOW,
			columns: { autorTipo: true, conteudoTexto: true, conteudoMidiaTipo: true, conteudoMidiaTextoProcessado: true },
		}),
		getCurrentChatAttendance(db, { organizacaoId: input.organizacaoId, chatId: input.chatId }),
	]);

	const triagem = await triageIncomingMessage({
		mensagens: messages
			.slice()
			.reverse()
			.map((message) => ({
				autor: describeAuthor(message.autorTipo),
				texto: message.conteudoTexto || message.conteudoMidiaTextoProcessado || (message.conteudoMidiaTipo !== "TEXTO" ? `[${message.conteudoMidiaTipo}]` : ""),
			}))
			.filter((message) => message.texto.length > 0),
		resumo: atendimento?.resumo ?? null,
	});

	const decision = decideTriageAction({
		triagem,
		settings: capacidades.triagem,
		agenteTemHandoff: isToolEnabled(capacidades, "atendimento.transferir_para_humano"),
	});

	// Categoria do atendimento: de graça, a partir da intenção. Intenções neutras não sobrescrevem.
	if (triagem) {
		const categoria = TRIAGE_INTENT_CATEGORY[triagem.intencao];
		if (categoria) {
			await updateChatAttendanceCategory(db, { organizacaoId: input.organizacaoId, chatId: input.chatId, categoria }).catch((error) =>
				console.error("[AI_TRIAGE] Falha ao gravar a categoria do atendimento:", error),
			);
		}
	}

	if (!triagem || decision.acao === "TURNO_COMPLETO") return { acao: "TURNO_COMPLETO", triagem };

	if (decision.acao === "MODELO_ECONOMICO") {
		const modeloConfig = parseJsonbWithFallback(AiAgentModelConfigSchema, input.agent.modeloConfig);
		return { acao: "MODELO_ECONOMICO", modelo: modeloConfig.modeloEconomico ?? "agent-fast", triagem };
	}

	return recordTriageOnlyRun(db, { ...input, capacidades, triagem, decision });
}

/**
 * Run sem turno: PULAR ou HANDOFF. Fica registrada como qualquer outra — status, custo (o da
 * triagem), resumo dizendo a decisão — para o histórico do atendimento e as estatísticas contarem.
 */
async function recordTriageOnlyRun(
	db: TDb,
	input: {
		organizacaoId: string;
		chatId: string;
		agent: TAiAgentEntity;
		triggerMessageId: string;
		deliver: TAgentMessageDeliverer;
		capacidades: TAiAgentCapabilities;
		triagem: TMessageTriage;
		decision: Extract<TTriageDecision, { acao: "PULAR" | "HANDOFF" }>;
	},
): Promise<TTriageGateResult> {
	const chat = await db.query.chats.findFirst({ where: eq(chats.id, input.chatId), columns: { clienteId: true } });
	const run = await createAgentRun(db, {
		organizacaoId: input.organizacaoId,
		agenteId: input.agent.id,
		gatilho: "CHAT_MENSAGEM",
		chatId: input.chatId,
		clienteId: chat?.clienteId ?? "",
		mensagemGatilhoId: input.triggerMessageId,
		configSnapshot: {
			instrucoes: input.agent.instrucoes,
			modeloConfig: parseJsonbWithFallback(AiAgentModelConfigSchema, input.agent.modeloConfig),
			capacidades: input.capacidades,
			conhecimento: [],
		},
		contextoEntradaSnapshot: { triagem: input.triagem },
	});
	await markAgentRunRunning(db, run.id);

	const uso = {
		tokensEntrada: input.triagem.tokensEntrada,
		tokensSaida: 0,
		tokensTotal: input.triagem.tokensEntrada,
		modelo: input.triagem.modelo,
		modelos: [input.triagem.modelo],
		custoUsd: input.triagem.custoUsd ?? undefined,
	};

	try {
		if (input.decision.acao === "PULAR") {
			await completeAgentRun(db, { runId: run.id, outputResumo: `Triagem: sem resposta necessária. ${input.decision.motivo}`, uso });
			return { acao: "PULAR", runId: run.id, triagem: input.triagem };
		}

		const { usuarioDestinoNome } = await transferChatToHuman({
			db,
			organizacaoId: input.organizacaoId,
			chatId: input.chatId,
			motivo: `Triagem: ${input.decision.motivo}`,
			resumoConversa: input.triagem.intencao === "RECLAMACAO" ? "Cliente com reclamação ou problema; a IA encaminhou sem responder." : "Conversa que exige decisão humana; a IA encaminhou sem responder.",
		});
		await input.deliver({ mensagem: HANDOFF_NOTICE_MESSAGE, anexo: null, runId: run.id, agenteId: input.agent.id });
		await completeAgentRun(db, { runId: run.id, outputResumo: `Triagem: encaminhado a ${usuarioDestinoNome}. ${input.decision.motivo}`, uso });
		return { acao: "HANDOFF", runId: run.id, triagem: input.triagem };
	} catch (error) {
		// Sem candidato para transferir, ou falha no envio: a run registra e o turno completo assume.
		await failAgentRun(db, { runId: run.id, erro: `Triagem (${input.decision.acao}) falhou: ${error instanceof Error ? error.message : String(error)}` });
		console.warn("[AI_TRIAGE] Ação da triagem falhou; seguindo com o turno completo:", error);
		return { acao: "TURNO_COMPLETO", triagem: input.triagem };
	}
}
