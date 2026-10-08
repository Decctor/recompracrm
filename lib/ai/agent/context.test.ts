import assert from "node:assert/strict";
import test from "node:test";
import type { TChatRunContext } from "./context";
import { formatChatRunContext } from "./context";

function contextAt(agora: string, conversa: TChatRunContext["conversa"] = []): TChatRunContext {
	return {
		chatId: "chat-1",
		cliente: {
			id: "cliente-1",
			nome: "Lucas",
			telefone: null,
			email: null,
			cidade: null,
			estado: null,
			aniversario: null,
		},
		conversa,
		atendimento: null,
		tempo: {
			agora,
			fusoHorario: "America/Sao_Paulo (BRT, UTC-03:00)",
			janelaWhatsapp: { aberta: true, expiraEm: null },
			ultimaMensagemDoClienteEm: null,
			ultimaMensagemEnviadaEm: null,
		},
	};
}

test("expõe horário local de São Paulo e período do dia sem exigir conversão do modelo", () => {
	const prompt = formatChatRunContext(contextAt("2026-08-31T20:14:00.000Z"));

	assert.match(prompt, /Agora em São Paulo: segunda-feira, 31\/08\/2026, 17:14 \(tarde\)/);
	assert.doesNotMatch(prompt, /Agora: 2026-08-31T20:14/);
});

test("classifica o início da noite no horário de São Paulo", () => {
	const prompt = formatChatRunContext(contextAt("2026-08-31T21:00:00.000Z"));

	assert.match(prompt, /18:00 \(noite\)/);
});

test("escreve o dia da semana de São Paulo, não o do UTC", () => {
	// 01h UTC de terça ainda é segunda à noite em São Paulo.
	const prompt = formatChatRunContext(contextAt("2026-09-01T01:30:00.000Z"));

	assert.match(prompt, /Agora em São Paulo: segunda-feira, 31\/08\/2026, 22:30 \(noite\)/);
});

test("agrupa a conversa por dia, com a distância até hoje", () => {
	const prompt = formatChatRunContext(
		contextAt("2026-10-08T17:30:00.000Z", [
			{ autor: "Cliente", texto: "Quero orçamento para um evento", dataEnvio: new Date("2026-09-10T22:30:00.000Z") },
			{ autor: "Você (assistente)", texto: "Para quantas pessoas?", dataEnvio: new Date("2026-09-10T22:31:00.000Z") },
			{ autor: "Cliente", texto: "Pode separar 2 pães?", dataEnvio: new Date("2026-10-07T12:00:00.000Z") },
			{ autor: "Cliente", texto: "Oi", dataEnvio: new Date("2026-10-08T17:17:00.000Z") },
		]),
	);

	assert.ok(
		prompt.includes(
			[
				"--- quinta-feira, 10/09/2026 (há 28 dias) ---",
				"Cliente: Quero orçamento para um evento",
				"Você (assistente): Para quantas pessoas?",
				"--- quarta-feira, 07/10/2026 (ontem) ---",
				"Cliente: Pode separar 2 pães?",
				"--- quinta-feira, 08/10/2026 (hoje) ---",
				"Cliente: Oi",
			].join("\n"),
		),
	);
});

test("aceita a data de envio em string, como volta do snapshot da run", () => {
	const prompt = formatChatRunContext(
		contextAt("2026-10-08T17:30:00.000Z", [{ autor: "Cliente", texto: "Oi", dataEnvio: "2026-10-08T17:17:00.000Z" as unknown as Date }]),
	);

	assert.ok(prompt.includes("--- quinta-feira, 08/10/2026 (hoje) ---\nCliente: Oi"));
});
