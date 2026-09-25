import { updateChatAttendanceSummary } from "@/lib/chats/attendance-state";
import type { DB, DBTransaction } from "@/services/drizzle";
import { db } from "@/services/drizzle";
import { chatMessages } from "@/services/drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import { executeAgentTurn, prepareAgentExecution } from "./runtime";

type TDb = DB | DBTransaction;

/**
 * Modo assistência: a IA a serviço do humano que detém o atendimento.
 *
 * Mesmo runtime do agente (mesmo prompt, mesmas ferramentas de leitura, mesmo registro em
 * `ai_agent_runs` com gatilho `SUGESTAO_HUB`), com três diferenças estruturais que
 * `prepareAgentExecution` aplica ao receber `assistencia`:
 *
 * - **nunca envia**: não há deliverer; o texto volta para o rascunho do compositor;
 * - **só lê**: `orcamentos.criar` e `atendimento.transferir_para_humano` saem do toolset — o
 *   humano cria orçamento pelo builder do hub e transfere pelo painel;
 * - **é barato**: modelo rápido por padrão, poucas chamadas de ferramenta, contexto compacto.
 *
 * Sem `watchForStaleRun`: a sugestão é um rascunho, e a conversa avançar durante a geração não
 * a invalida — o atendente lê antes de enviar.
 */

export type TChatAssistAction = "SUGERIR_RESPOSTA" | "RESUMIR" | "REESCREVER";

export type TChatAssistInput = {
	organizacaoId: string;
	chatId: string;
	acao: TChatAssistAction;
	atendente: { id: string; nome: string };
	/** Orientação do atendente para a sugestão ("diz que o frete é grátis acima de 300"). */
	orientacao?: string | null;
	/** Rascunho atual, para REESCREVER. */
	texto?: string | null;
};

export type TChatAssistResult = {
	runId: string;
	sugestao: string | null;
	resumo: string | null;
};

export async function runChatAssist(input: TChatAssistInput, database: TDb = db): Promise<TChatAssistResult> {
	// A última mensagem do cliente é a chave de rastreabilidade da run (o "gatilho" da sugestão).
	const ultimaDoCliente = await database.query.chatMessages.findFirst({
		where: and(eq(chatMessages.chatId, input.chatId), eq(chatMessages.autorTipo, "CLIENTE")),
		orderBy: [desc(chatMessages.dataEnvio), desc(chatMessages.id)],
		columns: { id: true },
	});

	const prepared = await prepareAgentExecution({
		organizacaoId: input.organizacaoId,
		chatId: input.chatId,
		gatilho: "SUGESTAO_HUB",
		mensagemGatilhoId: ultimaDoCliente?.id ?? null,
		assistencia: {
			acao: input.acao,
			atendenteNome: input.atendente.nome,
			orientacao: input.orientacao?.trim() || null,
			texto: input.texto?.trim() || null,
		},
		database,
	});

	const output = await executeAgentTurn(prepared);

	const resumo = output.resumoAtendimento?.trim() || null;
	// RESUMIR grava o resumo; as demais ações devolvem o rascunho e deixam o resumo como está —
	// um pedido de sugestão não deve reescrever a memória do atendimento por efeito colateral.
	if (input.acao === "RESUMIR" && resumo) {
		await updateChatAttendanceSummary(database, { organizacaoId: input.organizacaoId, chatId: input.chatId, resumo });
	}

	return {
		runId: prepared.run.id,
		sugestao: input.acao === "RESUMIR" ? null : output.mensagem?.trim() || null,
		resumo: input.acao === "RESUMIR" ? resumo : null,
	};
}
