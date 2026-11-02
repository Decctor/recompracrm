/**
 * Regras puras por trás de `confirmAiResponseStillValid` (lib/chats/ai-trigger.ts): decidir, a
 * partir dos fatos já lidos do banco, se a mensagem que disparou um turno de IA ainda precisa de
 * resposta. Separadas das consultas para serem testáveis sem banco.
 *
 * Incidente que motivou o desenho (Famoso Pão, chats 03f52b29 e 6d42d5f5): o cliente mandou
 * "Boa noite" às 19:59:38 e a pergunta de verdade às 19:59:50.000 (timestamp do WhatsApp). A run
 * do "Boa noite" respondeu às 19:59:51.8 e, quando o turno da pergunta acordou, a regra antiga —
 * "qualquer mensagem de saída com `dataEnvio` posterior à do gatilho já respondeu" — viu a
 * saudação e pulou a pergunta, sem nem abrir uma run. Duas correções:
 *
 * 1. **Uma resposta da IA só responde ao que a run dela viu.** A saída produzida por uma run
 *    disparada por uma mensagem mais antiga foi gerada sem a mensagem nova no contexto; ela não
 *    responde à mensagem nova. Conta só se a run foi disparada pela própria mensagem ou por uma
 *    mais nova (cujo contexto inclui esta).
 * 2. **O relógio é o nosso.** `dataEnvio` de mensagem recebida é o timestamp do WhatsApp, em
 *    segundos inteiros e anterior à chegada do webhook; comparar com o horário de gravação da
 *    resposta não diz nada sobre a ordem dos fatos. Tudo aqui compara `inseridaEm`.
 */

export type TAiTriggerDecision = { shouldRespond: true } | { shouldRespond: false; reason: string };

export const AI_SKIP_REASONS = {
	NEWER_CLIENT_MESSAGE: "Chegou mensagem mais recente do cliente.",
	ALREADY_ANSWERED: "A conversa já foi respondida.",
	TRIGGER_NOT_FOUND: "Mensagem gatilho não encontrada.",
	ATTENDANCE_LOST: "O atendimento deixou de ser da IA.",
} as const;

export type TAiTriggerMessageFacts = {
	id: string;
	/** `coalesce(data_insercao, data_envio)` da mensagem gatilho. */
	inseridaEm: Date;
};

/** Mensagem de saída gravada depois da mensagem gatilho (FALHA já excluída na consulta). */
export type TChatReplyCandidate = {
	id: string;
	autorTipo: "USUÁRIO" | "AI" | "BUSINESS-APP";
	inseridaEm: Date;
	/**
	 * Run que produziu a mensagem (`metadados.aiAgente.runId`). Só para `AI`; `null` quando a
	 * mensagem não tem vínculo (linhas antigas) — aí vale a regra de horário.
	 */
	run: {
		mensagemGatilhoId: string | null;
		/** `coalesce(data_insercao, data_envio)` da mensagem que disparou a run, se houver. */
		mensagemGatilhoInseridaEm: Date | null;
		/** Abertura da run: retomadas não têm mensagem gatilho, e o contexto é montado aqui. */
		inseridaEm: Date;
	} | null;
};

/**
 * A resposta `reply` responde à mensagem `trigger`?
 *
 * - Humano (hub ou celular da loja): sim, se gravada depois da mensagem — quem respondeu já a via.
 * - IA: sim, se a run que a produziu foi disparada pela própria mensagem ou por uma gravada
 *   depois dela (o contexto dessa run incluía esta). Uma run sem mensagem gatilho (retomada)
 *   responde se abriu depois da mensagem chegar. Sem vínculo com run, cai na regra de horário.
 */
export function replyAnswersMessage(reply: TChatReplyCandidate, trigger: TAiTriggerMessageFacts): boolean {
	if (reply.inseridaEm.getTime() <= trigger.inseridaEm.getTime()) return false;
	if (reply.autorTipo !== "AI" || !reply.run) return true;

	const { run } = reply;
	if (run.mensagemGatilhoId === trigger.id) return true;
	if (run.mensagemGatilhoId) {
		// Gatilho apagado (sem horário): não dá para provar que a run viu esta mensagem — o erro
		// seguro é responder de novo, nunca deixar a pergunta sem resposta.
		if (!run.mensagemGatilhoInseridaEm) return false;
		return run.mensagemGatilhoInseridaEm.getTime() >= trigger.inseridaEm.getTime();
	}
	return run.inseridaEm.getTime() >= trigger.inseridaEm.getTime();
}

/**
 * Decisão de "ainda faz sentido responder a esta mensagem", sem a checagem de posse do atendimento
 * (que é uma consulta à parte e roda por último, depois desta passar).
 */
export function decideAiResponseValidity({
	trigger,
	newerClientMessageId,
	replies,
}: {
	trigger: TAiTriggerMessageFacts | null;
	/** Uma mensagem do cliente gravada depois do gatilho, se existir: o turno dela responde. */
	newerClientMessageId: string | null;
	replies: TChatReplyCandidate[];
}): TAiTriggerDecision {
	if (!trigger) return { shouldRespond: false, reason: AI_SKIP_REASONS.TRIGGER_NOT_FOUND };
	if (newerClientMessageId && newerClientMessageId !== trigger.id) {
		return { shouldRespond: false, reason: AI_SKIP_REASONS.NEWER_CLIENT_MESSAGE };
	}
	if (replies.some((reply) => replyAnswersMessage(reply, trigger))) {
		return { shouldRespond: false, reason: AI_SKIP_REASONS.ALREADY_ANSWERED };
	}
	return { shouldRespond: true };
}

// ---------------------------------------------------------------------------------------------
// Debounce estendido para saudação
// ---------------------------------------------------------------------------------------------

/**
 * Espera mínima quando a mensagem é só uma saudação. Quem abre com "Boa noite" costuma mandar a
 * pergunta em seguida (12s no incidente); responder à saudação sozinha gasta uma run e chega
 * junto com a pergunta. Com a janela maior, a pergunta chega dentro do debounce e um turno só
 * responde às duas. A correção de fundo continua sendo `replyAnswersMessage` — isto só economiza
 * a run da saudação no caso comum.
 */
export const GREETING_RESPONSE_DELAY_MS = 15_000;

const GREETING_TEXT_MAX_LENGTH = 60;

const GREETING_PHRASE =
	"(?:oi+e?|ola+|opa+|e\\s*ai+|eae|salve|hello|hi|hey|bom\\s+dia|boa\\s+tarde|boa\\s+noite|tudo\\s+(?:bem|bom|certo|joia|tranquilo|ok)|td\\s+(?:bem|bom|certo)|como\\s+vai|como\\s+voce\\s+esta|blz|beleza|pessoal|gente|amigo|amiga|moco|moca)";
const GREETING_ONLY_PATTERN = new RegExp(`^(?:${GREETING_PHRASE}\\s*)+$`);

/** A mensagem é só uma saudação ("Boa noite", "Oi, tudo bem?", "Olá 👋")? */
export function isGreetingOnly(text: string | null | undefined): boolean {
	if (!text) return false;
	const normalized = text
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		// Pontuação, emoji e afins viram espaço: "oi!!", "boa noite 🙏" e "olá, tudo bem?" contam.
		.replace(/[^a-z\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!normalized || normalized.length > GREETING_TEXT_MAX_LENGTH) return false;
	return GREETING_ONLY_PATTERN.test(normalized);
}

/**
 * Debounce efetivo de um turno. `atrasoRespostaMs` é o configurado; uma saudação sozinha espera
 * pelo menos `GREETING_RESPONSE_DELAY_MS`; no modo RESERVA a espera pela equipe vence se for maior.
 */
export function computeAiResponseDelayMs({
	atrasoRespostaMs,
	modo,
	esperaHumanoMs,
	conteudoTexto,
}: {
	atrasoRespostaMs: number;
	modo: string;
	esperaHumanoMs: number;
	conteudoTexto?: string | null;
}): number {
	const debounce = isGreetingOnly(conteudoTexto) ? Math.max(atrasoRespostaMs, GREETING_RESPONSE_DELAY_MS) : atrasoRespostaMs;
	if (modo !== "RESERVA") return debounce;
	return Math.max(debounce, esperaHumanoMs);
}
