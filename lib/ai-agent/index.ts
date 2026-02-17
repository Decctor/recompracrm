import type { TChatMessageEntity } from "@/services/drizzle/schema";
import { Output, ToolLoopAgent, gateway, stepCountIs } from "ai";
import z from "zod";
import { ENHANCED_SYSTEM_PROMPT, detectEscalationNeeded } from "./prompts";
import { agentTools } from "./tools";

export type TChatDetailsForAgentResponse = {
	id: string;
	cliente: {
		idApp: string; // ID in the main database (Drizzle)
		nome: string;
		telefone: string;
		telefoneBase?: string | null;
		email?: string | null;
		cpfCnpj?: string | null;
		localizacaoCep?: string | null;
		localizacaoEstado?: string | null;
		localizacaoCidade?: string | null;
		localizacaoBairro?: string | null;
		localizacaoLogradouro?: string | null;
		localizacaoNumero?: string | null;
		localizacaoComplemento?: string | null;
	};
	ultimasMensagens: Array<{
		id: string;
		autorTipo: TChatMessageEntity["autorTipo"];
		conteudoTipo?: TChatMessageEntity["conteudoMidiaTipo"];
		conteudoTexto?: string;
		conteudoMidiaUrl?: string;
		dataEnvio: TChatMessageEntity["dataEnvio"];
		atendimentoId?: string;
	}>;
	atendimentoAberto: {
		id: string;
		descricao: string;
		status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDO";
	} | null;
};

type AIResponse = {
	message: string;
	metadata: {
		toolsUsed: string[];
		serviceDescription: string;
		tokensUsed: number;
	};
};

export const agent = new ToolLoopAgent({
	model: gateway("openai/gpt-5"),
	instructions: ENHANCED_SYSTEM_PROMPT,
	tools: agentTools,
	output: Output.object({
		schema: z.object({
			message: z
				.string()
				.describe("Mensagem CONCISA para WhatsApp. MÁXIMO 3-5 frases curtas. Seja DIRETO e OBJETIVO. Use apenas 1 emoji (máximo). Não repita saudações."),
			serviceDescription: z.string().describe("Descrição atualizada do atendimento para uso interno (pode ser detalhado)."),
		}),
	}),
	stopWhen: stepCountIs(20),
});

export async function getAgentResponse({ details }: { details: TChatDetailsForAgentResponse }): Promise<AIResponse> {
	const toolsUsed: string[] = [];
	const ticketCreated = false;

	try {
		if (!details) {
			throw new Error("Detalhes não encontrados");
		}

		// Build conversation context
		const conversationHistory = details.ultimasMensagens
			.slice()
			.reverse() // Oldest first
			.map((msg: TChatDetailsForAgentResponse["ultimasMensagens"][0]) => {
				const role = msg.autorTipo === "CLIENTE" ? "Cliente" : msg.autorTipo === "AI" ? "Você (AI)" : "Atendente Humano";
				let content = msg.conteudoTexto || "";

				if (msg.conteudoTipo && !content) {
					content = `[${msg.conteudoTipo}]`;
				}

				return `${role}: ${content}`;
			})
			.join("\n");

		console.log("[AI_AGENT] Conversation history:", conversationHistory);

		const userPrompt = `Você está encarregado de responder ao cliente.

### INFORMAÇÕES DO CLIENTE
- ID no Sistema: ${details.cliente.idApp}
- Nome: ${details.cliente.nome}
- Telefone: ${details.cliente.telefone}
${details.cliente.email ? `- Email: ${details.cliente.email}` : ""}
${details.cliente.cpfCnpj ? `- CPF/CNPJ: ${details.cliente.cpfCnpj}` : ""}
${details.cliente.localizacaoCep ? `- CEP: ${details.cliente.localizacaoCep}` : ""}
${details.cliente.localizacaoEstado ? `- Estado: ${details.cliente.localizacaoEstado}` : ""}
${details.cliente.localizacaoCidade ? `- Cidade: ${details.cliente.localizacaoCidade}` : ""}
${details.cliente.localizacaoBairro ? `- Bairro: ${details.cliente.localizacaoBairro}` : ""}
${details.cliente.localizacaoLogradouro ? `- Logradouro: ${details.cliente.localizacaoLogradouro}` : ""}
${details.cliente.localizacaoNumero ? `- Número: ${details.cliente.localizacaoNumero}` : ""}
${details.cliente.localizacaoComplemento ? `- Complemento: ${details.cliente.localizacaoComplemento}` : ""}

### ID DO CHAT
${details.id}

### HISTÓRICO DA CONVERSA
${conversationHistory}

${
	details.atendimentoAberto
		? `
### ATENDIMENTO EM ABERTO
- ID: ${details.atendimentoAberto.id}
- Descrição: ${details.atendimentoAberto.descricao}
- Status: ${details.atendimentoAberto.status}
`
		: ""
}


Analise a conversa e responda apropriadamente. Use suas ferramentas quando necessário para fornecer um atendimento personalizado e de alta qualidade.`;

		// Generate response using AI with tools
		const result = await agent.generate({
			prompt: userPrompt,
		});

		console.log("[AI_AGENT] Complete result:", result);
		const agentOutput = result.output;
		if (!agentOutput) {
			console.log("[AI_AGENT] No output");
			throw new Error("Não foi possível gerar a resposta da IA");
		}
		return {
			message: agentOutput.message,
			metadata: {
				toolsUsed,
				serviceDescription: agentOutput.serviceDescription,
				tokensUsed: result.usage.totalTokens ?? 0,
			},
		};
	} catch (error) {
		console.error("[AI_AGENT] Error generating response:", error);
		// Return a safe fallback
		return {
			message: "Desculpe, estou com dificuldades técnicas. Vou transferir você para um de nossos atendentes.",
			metadata: {
				toolsUsed,
				serviceDescription: "Erro técnico no agente AI",
				tokensUsed: 0,
			},
		};
	}
}
