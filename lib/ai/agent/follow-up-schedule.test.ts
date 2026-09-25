import assert from "node:assert/strict";
import test from "node:test";
import { clampToBusinessHours, resolveFollowUpSchedule } from "./follow-up-schedule";

const settings = { habilitadas: true, maxPorAtendimento: 1, horarioInicio: "08:00", horarioFim: "20:00", maxAguardarHoras: 24 };
// 25/09/2026 14:00 em São Paulo (UTC-3) = 17:00Z.
const now = new Date("2026-09-25T17:00:00.000Z");

test("dentro do horário comercial a data não muda", () => {
	assert.equal(clampToBusinessHours(now, settings).toISOString(), now.toISOString());
});

test("antes da abertura adia para a abertura do mesmo dia; depois do fechamento, para o dia seguinte", () => {
	const madrugada = new Date("2026-09-26T06:30:00.000Z"); // 03:30 local
	assert.equal(clampToBusinessHours(madrugada, settings).toISOString(), "2026-09-26T11:00:00.000Z"); // 08:00 local
	const noite = new Date("2026-09-25T23:30:00.000Z"); // 20:30 local
	assert.equal(clampToBusinessHours(noite, settings).toISOString(), "2026-09-26T11:00:00.000Z"); // 08:00 do dia seguinte
});

test("gateway interno: sem janela, respeita só o teto de horas e o horário", () => {
	const result = resolveFollowUpSchedule({ now, aguardarHoras: 4, settings, canal: { tipoConexao: "INTERNAL_GATEWAY", janelaExpiracao: null } });
	assert.equal(result.agendavel, true);
	if (!result.agendavel) return;
	assert.equal(result.agendadaPara.toISOString(), "2026-09-25T21:00:00.000Z"); // 18:00 local
	assert.equal(result.antecipadaPelaJanela, false);
});

test("teto de horas da organização clampa o pedido do agente", () => {
	const result = resolveFollowUpSchedule({
		now,
		aguardarHoras: 60,
		settings: { ...settings, maxAguardarHoras: 6 },
		canal: { tipoConexao: "INTERNAL_GATEWAY", janelaExpiracao: null },
	});
	assert.equal(result.agendavel && result.solicitadaPara.toISOString(), "2026-09-25T23:00:00.000Z");
});

test("Cloud API: pedido além da janela é antecipado para a janela menos a margem", () => {
	const janela = new Date(now.getTime() + 10 * 60 * 60 * 1000); // expira em 10h (00:00 local)
	const result = resolveFollowUpSchedule({ now, aguardarHoras: 20, settings, canal: { tipoConexao: "META_CLOUD_API", janelaExpiracao: janela } });
	assert.equal(result.agendavel, true);
	if (!result.agendavel) return;
	assert.equal(result.antecipadaPelaJanela, true);
	// Limite = 23:00 local; fora do horário, a abertura seguinte (08:00 do dia seguinte) passa do
	// limite, então sai no próprio limite.
	assert.equal(result.agendadaPara.toISOString(), new Date(janela.getTime() - 60 * 60 * 1000).toISOString());
});

test("Cloud API: pedido dentro da janela e do horário fica como pedido", () => {
	const janela = new Date(now.getTime() + 23 * 60 * 60 * 1000);
	const result = resolveFollowUpSchedule({ now, aguardarHoras: 3, settings, canal: { tipoConexao: "META_CLOUD_API", janelaExpiracao: janela } });
	assert.equal(result.agendavel && result.agendadaPara.toISOString(), "2026-09-25T20:00:00.000Z");
	assert.equal(result.agendavel && result.antecipadaPelaJanela, false);
});

test("Cloud API sem janela, ou com janela prestes a fechar, não agenda", () => {
	assert.deepEqual(resolveFollowUpSchedule({ now, aguardarHoras: 2, settings, canal: { tipoConexao: "META_CLOUD_API", janelaExpiracao: null } }), {
		agendavel: false,
		motivo: "JANELA_FECHADA",
	});
	const quaseFechada = new Date(now.getTime() + 30 * 60 * 1000);
	assert.equal(
		resolveFollowUpSchedule({ now, aguardarHoras: 2, settings, canal: { tipoConexao: "META_CLOUD_API", janelaExpiracao: quaseFechada } }).agendavel,
		false,
	);
});
