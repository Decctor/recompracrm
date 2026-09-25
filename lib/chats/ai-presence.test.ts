import assert from "node:assert/strict";
import test from "node:test";
import { resolveAiPresence, type TResolveAiPresenceInput } from "./ai-presence";

const now = new Date("2026-09-25T15:00:00.000Z");
const base: TResolveAiPresenceInput = {
	atendimento: { responsavelTipo: "AGENTE" },
	atendimentoIa: { disponivel: true, motivo: null },
	ultimaEntradaEm: new Date(now.getTime() - 2_000),
	ultimaSaidaEm: new Date(now.getTime() - 60_000),
	capacidades: { modo: "IMEDIATO", atrasoRespostaMs: 5000, esperaHumanoMs: 180_000 },
	run: null,
	now,
};

test("run ativa vence qualquer outro fato", () => {
	const presence = resolveAiPresence({
		...base,
		atendimento: { responsavelTipo: "USUARIO" },
		run: { id: "run-1", status: "RODANDO", erro: null, dataInicio: new Date(now.getTime() - 1000), dataFim: null, dataInsercao: now },
	});
	assert.equal(presence.estado, "respondendo");
	assert.equal(presence.estado === "respondendo" && presence.runId, "run-1");
});

test("humano ou telefone no comando: ausente", () => {
	assert.equal(resolveAiPresence({ ...base, atendimento: { responsavelTipo: "USUARIO" } }).estado, "ausente");
	assert.equal(resolveAiPresence({ ...base, atendimento: { responsavelTipo: "EXTERNO" } }).estado, "ausente");
});

test("última run falhou depois da última entrada e a pendência segue: falhou", () => {
	const presence = resolveAiPresence({
		...base,
		run: { id: "run-2", status: "FALHA", erro: "Limite diário", dataInicio: null, dataFim: new Date(now.getTime() - 500), dataInsercao: now },
	});
	assert.equal(presence.estado, "falhou");
	assert.equal(presence.estado === "falhou" && presence.erro, "Limite diário");
});

test("run falha anterior à última entrada não conta: a nova mensagem abre outro ciclo", () => {
	const presence = resolveAiPresence({
		...base,
		run: { id: "run-2", status: "FALHA", erro: "x", dataInicio: null, dataFim: new Date(now.getTime() - 10_000), dataInsercao: now },
	});
	assert.equal(presence.estado, "aguardando");
});

test("limite de créditos aparece como estado próprio; outros bloqueios viram ausente", () => {
	assert.equal(resolveAiPresence({ ...base, atendimentoIa: { disponivel: false, motivo: "LIMITE_CREDITOS" } }).estado, "limite");
	assert.equal(resolveAiPresence({ ...base, atendimentoIa: { disponivel: false, motivo: "AGENTE_PAUSADO" } }).estado, "ausente");
});

test("pendência sem run: aguardando com previsão pelo debounce (ou pela espera no modo RESERVA)", () => {
	const imediato = resolveAiPresence(base);
	assert.equal(imediato.estado, "aguardando");
	assert.equal(imediato.estado === "aguardando" && imediato.motivo, "debounce");
	assert.equal(imediato.estado === "aguardando" && imediato.previstoEm.getTime(), now.getTime() + 3000);

	const reserva = resolveAiPresence({ ...base, capacidades: { modo: "RESERVA", atrasoRespostaMs: 5000, esperaHumanoMs: 180_000 } });
	assert.equal(reserva.estado === "aguardando" && reserva.motivo, "reserva");
	assert.equal(reserva.estado === "aguardando" && reserva.previstoEm.getTime(), now.getTime() - 2_000 + 180_000);
});

test("sem responsável mas com IA disponível também é aguardando (ela reivindica após o debounce)", () => {
	assert.equal(resolveAiPresence({ ...base, atendimento: null }).estado, "aguardando");
});

test("previsão passada há mais de um minuto sem run: ausente", () => {
	const presence = resolveAiPresence({
		...base,
		ultimaEntradaEm: new Date(now.getTime() - 70_000),
		ultimaSaidaEm: new Date(now.getTime() - 3_600_000),
	});
	assert.equal(presence.estado, "ausente");
});

test("sem pendência do cliente não há o que esperar", () => {
	assert.equal(resolveAiPresence({ ...base, ultimaSaidaEm: now }).estado, "ausente");
});
