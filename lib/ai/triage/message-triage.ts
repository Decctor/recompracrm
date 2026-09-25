import type { TAiAgentCapabilities } from "@/schemas/ai-agents";
import { type Experimental_EvaluationModel, experimental_evaluate as evaluate } from "ai";

/**
 * Triagem pré-run com Jev (TypeSafe AI, `typesafe-ai/jev` no AI Gateway).
 *
 * Jev não gera texto: responde perguntas de escolha e booleanas sobre um estado, com
 * probabilidades calibradas, em centenas de milissegundos e a uma fração de centavo. É o "if
 * inteligente" antes do turno do agente: *precisa de resposta?*, *é para humano?*, *que tipo de
 * pedido é?*. Nunca substitui o turno; decide se e como ele acontece.
 *
 * Toda decisão daqui tem um fallback seguro que é o comportamento anterior — o turno completo no
 * modelo configurado. Falha na triagem (rede, modelo indisponível) devolve `null` e o runner
 * segue como se ela não existisse.
 */

export const TRIAGE_MODEL_ID = "typesafe-ai/jev";

/** Preço de referência (USD por 1M tokens de entrada; saída não é cobrada). */
const TRIAGE_PRICE_INPUT_PER_MILLION = 0.042;

/** Últimas mensagens que entram no estado da triagem: o vaivém que dá sentido à última. */
export const TRIAGE_MESSAGE_WINDOW = 8;

export const TRIAGE_INTENTS = {
	PRECO_OU_PRODUTO: "Pergunta preço, disponibilidade, ou pede indicação de produto",
	ORCAMENTO_OU_PEDIDO: "Quer fechar a compra, pede orçamento, confirma quantidade, pergunta como pagar",
	STATUS_OU_ENTREGA: "Pergunta sobre um pedido já feito, prazo, entrega, retirada",
	CASHBACK_OU_CUPOM: "Saldo, pontos, cashback, cupom, promoção",
	RECLAMACAO: "Insatisfação, problema com produto ou pedido, pede reembolso ou troca",
	DIRIGIDA_A_PESSOA: "Fala com alguém da equipe pelo nome, ou responde ao que um atendente humano disse",
	SAUDACAO_OU_INICIO: "Abre a conversa (oi, bom dia) sem pedido concreto ainda",
	ENCERRAMENTO_OU_RECONHECIMENTO: "Obrigado, ok, combinado, tá bom, beleza, emoji ou figurinha, sem pergunta nova",
	OUTRO: "Não se encaixa em nenhuma das anteriores",
} as const;
export type TTriageIntent = keyof typeof TRIAGE_INTENTS;

/** Rótulo em português para `chat_assignments.categoria`. Intenções neutras não categorizam. */
export const TRIAGE_INTENT_CATEGORY: Record<TTriageIntent, string | null> = {
	PRECO_OU_PRODUTO: "Preço / produto",
	ORCAMENTO_OU_PEDIDO: "Orçamento / pedido",
	STATUS_OU_ENTREGA: "Status / entrega",
	CASHBACK_OU_CUPOM: "Cashback / cupom",
	RECLAMACAO: "Reclamação",
	DIRIGIDA_A_PESSOA: null,
	SAUDACAO_OU_INICIO: null,
	ENCERRAMENTO_OU_RECONHECIMENTO: null,
	OUTRO: null,
};

export type TMessageTriage = {
	intencao: TTriageIntent;
	/** Probabilidade da intenção escolhida (0–1). */
	intencaoProbabilidade: number;
	/** P(a última mensagem exige resposta da loja agora). */
	precisaResposta: number;
	/** P(um humano precisa assumir). */
	exigeHumano: number;
	tokensEntrada: number | undefined;
	custoUsd: number | null;
	modelo: string;
};

export type TTriageMessage = { autor: string; texto: string };

export type TTriageInput = {
	/** Últimas mensagens, cronológicas, com a do cliente por último. */
	mensagens: TTriageMessage[];
	resumo: string | null;
};

const TRIAGE_QUESTIONS = {
	intencao: {
		type: "choice",
		instructions: "Qual é a intenção da ÚLTIMA mensagem do cliente, considerando o contexto da conversa?",
		criteria: TRIAGE_INTENTS,
	},
	precisaResposta: {
		type: "boolean",
		instructions:
			"A última mensagem do cliente exige uma resposta da loja agora? Agradecimentos, confirmações ('ok', 'combinado'), emojis e figurinhas sem pergunta nova NÃO exigem resposta.",
	},
	exigeHumano: {
		type: "boolean",
		instructions:
			"Um atendente humano precisa assumir esta conversa? Sim quando há reclamação, cobrança, negociação de preço ou prazo, pedido explícito de falar com uma pessoa, ou quando a mensagem é dirigida a alguém da equipe pelo nome.",
	},
} as const;

export async function triageIncomingMessage(input: TTriageInput, options: { model?: Experimental_EvaluationModel } = {}): Promise<TMessageTriage | null> {
	const mensagens = input.mensagens.slice(-TRIAGE_MESSAGE_WINDOW);
	if (mensagens.length === 0) return null;

	try {
		const result = await evaluate({
			model: options.model ?? TRIAGE_MODEL_ID,
			state: {
				conversa: mensagens.map((mensagem) => `${mensagem.autor}: ${mensagem.texto}`),
				resumoDoAtendimento: input.resumo ?? null,
			},
			questions: TRIAGE_QUESTIONS,
			maxRetries: 1,
		});

		const intencao = result.answers.intencao;
		const tokensEntrada = result.usage.inputTokens;
		return {
			intencao: intencao.choice,
			intencaoProbabilidade: intencao.probabilities?.[intencao.choice] ?? 1,
			precisaResposta: result.answers.precisaResposta.probability,
			exigeHumano: result.answers.exigeHumano.probability,
			tokensEntrada,
			custoUsd: typeof tokensEntrada === "number" ? (tokensEntrada * TRIAGE_PRICE_INPUT_PER_MILLION) / 1_000_000 : null,
			modelo: result.response.modelId || TRIAGE_MODEL_ID,
		};
	} catch (error) {
		console.warn("[AI_TRIAGE] Falha na triagem; seguindo com o turno completo:", error);
		return null;
	}
}

// ============================================================================
// DECISÃO
// ============================================================================

/** Limiares por ação, não por modelo: quanto mais irreversível a ação, mais confiança ela exige. */
export const TRIAGE_THRESHOLDS = {
	/** Pular resposta: não responder a quem esperava resposta é o pior erro daqui. */
	pularMaxPrecisaResposta: 0.15,
	pularMinIntencao: 0.85,
	/** Handoff direto: manda um humano sem o agente ler; precisa de quase certeza. */
	handoffMinExigeHumano: 0.9,
	/** Modelo econômico ainda responde; a aposta é barata. */
	economicoMinIntencao: 0.7,
} as const;

/** Intenções simples o bastante para o modelo econômico. Preço, orçamento e reclamação ficam com o modelo configurado. */
export const ECONOMY_MODEL_INTENTS: readonly TTriageIntent[] = ["SAUDACAO_OU_INICIO", "STATUS_OU_ENTREGA", "CASHBACK_OU_CUPOM"];

export type TTriageDecision =
	| { acao: "PULAR"; motivo: string }
	| { acao: "HANDOFF"; motivo: string }
	| { acao: "MODELO_ECONOMICO"; motivo: string }
	| { acao: "TURNO_COMPLETO"; motivo: string };

export function decideTriageAction({
	triagem,
	settings,
	agenteTemHandoff,
}: {
	triagem: TMessageTriage | null;
	settings: TAiAgentCapabilities["triagem"];
	agenteTemHandoff: boolean;
}): TTriageDecision {
	if (!triagem || !settings.habilitada) return { acao: "TURNO_COMPLETO", motivo: triagem ? "Triagem desabilitada." : "Sem triagem." };

	if (
		settings.pularSemResposta &&
		triagem.intencao === "ENCERRAMENTO_OU_RECONHECIMENTO" &&
		triagem.precisaResposta <= TRIAGE_THRESHOLDS.pularMaxPrecisaResposta &&
		triagem.intencaoProbabilidade >= TRIAGE_THRESHOLDS.pularMinIntencao
	) {
		return { acao: "PULAR", motivo: `Encerramento/reconhecimento sem pergunta nova (p=${triagem.intencaoProbabilidade.toFixed(2)}).` };
	}

	if (settings.handoffDireto && agenteTemHandoff && triagem.exigeHumano >= TRIAGE_THRESHOLDS.handoffMinExigeHumano) {
		return { acao: "HANDOFF", motivo: `Exige humano (p=${triagem.exigeHumano.toFixed(2)}; intenção ${triagem.intencao}).` };
	}

	if (settings.modeloEconomico && ECONOMY_MODEL_INTENTS.includes(triagem.intencao) && triagem.intencaoProbabilidade >= TRIAGE_THRESHOLDS.economicoMinIntencao) {
		return { acao: "MODELO_ECONOMICO", motivo: `Intenção simples (${triagem.intencao}, p=${triagem.intencaoProbabilidade.toFixed(2)}).` };
	}

	return { acao: "TURNO_COMPLETO", motivo: `Intenção ${triagem.intencao} (p=${triagem.intencaoProbabilidade.toFixed(2)}).` };
}
