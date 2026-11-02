import assert from "node:assert/strict";
import test from "node:test";
import {
	AI_SKIP_REASONS,
	GREETING_RESPONSE_DELAY_MS,
	type TAiTriggerMessageFacts,
	type TChatReplyCandidate,
	computeAiResponseDelayMs,
	decideAiResponseValidity,
	isGreetingOnly,
	replyAnswersMessage,
} from "./ai-response-validity";

const at = (time: string) => new Date(`2026-10-30T${time}Z`);

// Linha do tempo do incidente (Famoso Pão, chats 03f52b29 / 6d42d5f5). `inseridaEm` é o nosso
// relógio: a pergunta foi enviada às 19:59:50.000 (timestamp do WhatsApp) e chegou pelo webhook
// depois da resposta à saudação.
const greeting: TAiTriggerMessageFacts = { id: "msg-boa-noite", inseridaEm: at("19:59:38.400") };
const question: TAiTriggerMessageFacts = { id: "msg-pergunta", inseridaEm: at("19:59:52.100") };

const greetingReply: TChatReplyCandidate = {
	id: "msg-resposta-saudacao",
	autorTipo: "AI",
	inseridaEm: at("19:59:51.800"),
	run: { mensagemGatilhoId: greeting.id, mensagemGatilhoInseridaEm: greeting.inseridaEm, inseridaEm: at("19:59:43.500") },
};

test("saudação + pergunta em ~12s: a resposta à saudação não pula a pergunta", () => {
	// A pergunta chegou depois da entrega: o turno dela não pode ver a resposta à saudação como resposta.
	const decision = decideAiResponseValidity({ trigger: question, newerClientMessageId: null, replies: [] });
	assert.deepEqual(decision, { shouldRespond: true });

	// Mesmo se a resposta da saudação tivesse sido gravada depois da pergunta (webhook adiantado),
	// ela veio de uma run disparada por uma mensagem mais antiga — não responde à pergunta.
	const lateGreetingReply = { ...greetingReply, inseridaEm: at("19:59:53.000") };
	assert.equal(replyAnswersMessage(lateGreetingReply, question), false);
	assert.deepEqual(decideAiResponseValidity({ trigger: question, newerClientMessageId: null, replies: [lateGreetingReply] }), {
		shouldRespond: true,
	});
});

test("saudação + pergunta: a run da saudação recua quando a pergunta chega antes da entrega", () => {
	// Checagem pré-entrega (e o vigia durante a geração) da run da saudação.
	const decision = decideAiResponseValidity({ trigger: greeting, newerClientMessageId: question.id, replies: [] });
	assert.deepEqual(decision, { shouldRespond: false, reason: AI_SKIP_REASONS.NEWER_CLIENT_MESSAGE });
});

test("caminho normal: uma mensagem só, sem resposta, responde", () => {
	assert.deepEqual(decideAiResponseValidity({ trigger: greeting, newerClientMessageId: null, replies: [] }), { shouldRespond: true });
});

test("caminho normal: a resposta da run da própria mensagem conta (retry não duplica)", () => {
	assert.equal(replyAnswersMessage(greetingReply, greeting), true);
	assert.deepEqual(decideAiResponseValidity({ trigger: greeting, newerClientMessageId: null, replies: [greetingReply] }), {
		shouldRespond: false,
		reason: AI_SKIP_REASONS.ALREADY_ANSWERED,
	});
});

test("resposta de uma run disparada por mensagem mais nova cobre a antiga", () => {
	const questionReply: TChatReplyCandidate = {
		id: "msg-resposta-pergunta",
		autorTipo: "AI",
		inseridaEm: at("19:59:58.000"),
		run: { mensagemGatilhoId: question.id, mensagemGatilhoInseridaEm: question.inseridaEm, inseridaEm: at("19:59:57.200") },
	};
	assert.equal(replyAnswersMessage(questionReply, greeting), true);
});

test("o próprio gatilho é a mensagem mais recente: não conta como mensagem nova", () => {
	assert.deepEqual(decideAiResponseValidity({ trigger: question, newerClientMessageId: question.id, replies: [] }), { shouldRespond: true });
});

test("resposta humana gravada depois da mensagem responde; antes, não", () => {
	const human = (time: string): TChatReplyCandidate => ({ id: `h-${time}`, autorTipo: "USUÁRIO", inseridaEm: at(time), run: null });
	assert.equal(replyAnswersMessage(human("19:59:53.000"), question), true);
	// O atendente respondeu à saudação antes de a pergunta chegar: a pergunta segue sem resposta.
	assert.equal(replyAnswersMessage(human("19:59:51.000"), question), false);
	// Eco do celular da loja segue a mesma regra.
	assert.equal(replyAnswersMessage({ ...human("19:59:53.000"), autorTipo: "BUSINESS-APP" }, question), true);
});

test("mensagem da IA sem vínculo com run (linha antiga) cai na regra de horário", () => {
	assert.equal(replyAnswersMessage({ id: "legacy", autorTipo: "AI", inseridaEm: at("19:59:53.000"), run: null }, question), true);
});

test("retomada (run sem mensagem gatilho) só responde se abriu depois da mensagem chegar", () => {
	const followUp = (runAt: string): TChatReplyCandidate => ({
		id: `f-${runAt}`,
		autorTipo: "AI",
		inseridaEm: at("19:59:59.000"),
		run: { mensagemGatilhoId: null, mensagemGatilhoInseridaEm: null, inseridaEm: at(runAt) },
	});
	assert.equal(replyAnswersMessage(followUp("19:59:53.000"), question), true);
	assert.equal(replyAnswersMessage(followUp("19:59:50.000"), question), false);
});

test("gatilho apagado: não dá para provar que a run viu a mensagem, responde de novo", () => {
	const reply: TChatReplyCandidate = {
		...greetingReply,
		inseridaEm: at("19:59:59.000"),
		run: { mensagemGatilhoId: "apagada", mensagemGatilhoInseridaEm: null, inseridaEm: at("19:59:55.000") },
	};
	assert.equal(replyAnswersMessage(reply, question), false);
});

test("gatilho não encontrado não responde", () => {
	assert.deepEqual(decideAiResponseValidity({ trigger: null, newerClientMessageId: null, replies: [] }), {
		shouldRespond: false,
		reason: AI_SKIP_REASONS.TRIGGER_NOT_FOUND,
	});
});

test("isGreetingOnly reconhece saudações e recusa perguntas", () => {
	for (const text of ["Boa noite", "boa noite!", "Oi", "oiii", "Olá, tudo bem?", "Bom dia 🙏", "E aí", "oi boa tarde", "OPA"]) {
		assert.equal(isGreetingOnly(text), true, text);
	}
	for (const text of ["Boa noite, vocês têm pão de queijo?", "Qual o horário de funcionamento?", "oi quero fazer um pedido", "", null, undefined]) {
		assert.equal(isGreetingOnly(text), false, String(text));
	}
});

test("debounce: saudação espera mais; o resto segue o configurado", () => {
	const base = { atrasoRespostaMs: 5000, modo: "IMEDIATO", esperaHumanoMs: 180_000 };
	assert.equal(computeAiResponseDelayMs({ ...base, conteudoTexto: "Boa noite" }), GREETING_RESPONSE_DELAY_MS);
	assert.equal(computeAiResponseDelayMs({ ...base, conteudoTexto: "Vocês entregam no centro?" }), 5000);
	assert.equal(computeAiResponseDelayMs({ ...base, conteudoTexto: null }), 5000);
	// Configurado maior que a janela da saudação: vale o configurado.
	assert.equal(computeAiResponseDelayMs({ ...base, atrasoRespostaMs: 30_000, conteudoTexto: "Oi" }), 30_000);
	// RESERVA: a espera pela equipe vence.
	assert.equal(computeAiResponseDelayMs({ ...base, modo: "RESERVA", conteudoTexto: "Oi" }), 180_000);
});
