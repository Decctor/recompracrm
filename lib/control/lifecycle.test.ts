import assert from "node:assert/strict";
import test from "node:test";

import {
	buildControlCustomFields,
	CONTROL_SUCCESS_MILESTONES,
	controlOrganizationReference,
	planControlLifecycleSync,
	shouldBackfillSilently,
	shouldMoveSuccessStage,
	type TControlLifecycleSnapshot,
} from "./lifecycle";

const NOW = new Date("2026-11-21T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ALL_STAGES = [...CONTROL_SUCCESS_MILESTONES.map((milestone) => milestone.estagio), "Coleta de NPS", "Acompanhamento de sucesso do cliente"];

function snapshot(overrides: Partial<TControlLifecycleSnapshot> = {}): TControlLifecycleSnapshot {
	return {
		organizacaoCriadaEm: new Date(NOW.getTime() - 2 * DAY),
		onboardingConcluidoEm: null,
		cashbackConfigurado: false,
		campanhasPreparadas: 0,
		fonteDadosDefinida: false,
		whatsappOficialConectado: false,
		primeiraVendaEm: null,
		primeiroEnvioCampanhaEm: null,
		primeiroResgateEm: null,
		enviosCampanhaUltimos14Dias: 0,
		now: NOW,
		...overrides,
	};
}

test("a referência da organização no Control é prefixada", () => {
	assert.equal(controlOrganizationReference("abc"), "recompracrm:org_abc");
});

test("organização recém-criada: só boas-vindas", () => {
	const plan = planControlLifecycleSync({ snapshot: snapshot(), marcosEnviados: [], estagiosDoQuadro: ALL_STAGES });
	assert.deepEqual(
		plan.novosMarcos.map((milestone) => milestone.chave),
		["boas_vindas"],
	);
	assert.equal(plan.estagioAlvo, "Boas vindas");
});

test("o alvo é o marco mais adiantado, mesmo fora de ordem", () => {
	// Vendeu antes de configurar cashback: o cartão vai para "Primeira venda".
	const plan = planControlLifecycleSync({
		snapshot: snapshot({ onboardingConcluidoEm: NOW, fonteDadosDefinida: true, primeiraVendaEm: NOW }),
		marcosEnviados: ["boas_vindas"],
		estagiosDoQuadro: ALL_STAGES,
	});
	assert.equal(plan.estagioAlvo, "Primeira venda");
	assert.deepEqual(
		plan.novosMarcos.map((milestone) => milestone.chave),
		["onboarding_concluido", "fonte_dados_definida", "primeira_venda"],
	);
});

test("marcos já entregues não voltam", () => {
	const plan = planControlLifecycleSync({
		snapshot: snapshot({ onboardingConcluidoEm: NOW }),
		marcosEnviados: ["boas_vindas", "onboarding_concluido"],
		estagiosDoQuadro: ALL_STAGES,
	});
	assert.equal(plan.novosMarcos.length, 0);
});

test("marco sem estágio no quadro não vira alvo — cai no anterior que existe", () => {
	const withoutWhatsappStage = ALL_STAGES.filter((stage) => stage !== "WhatsApp oficial conectado");
	const plan = planControlLifecycleSync({
		snapshot: snapshot({ onboardingConcluidoEm: NOW, fonteDadosDefinida: true, whatsappOficialConectado: true }),
		marcosEnviados: [],
		estagiosDoQuadro: withoutWhatsappStage,
	});
	assert.equal(plan.estagioAlvo, "Onboarding: Integração ERP ou Tablet/QRcode/PDV");
	// O evento do marco continua indo: o workflow pode reagir a ele mesmo sem estágio.
	assert.ok(plan.novosMarcos.some((milestone) => milestone.chave === "whatsapp_conectado"));
});

test("estágios comparados sem diferenciar caixa e espaços (o quadro real tem 'Primeira venda ')", () => {
	const plan = planControlLifecycleSync({
		snapshot: snapshot({ primeiraVendaEm: NOW }),
		marcosEnviados: [],
		estagiosDoQuadro: ["Boas vindas", "Primeira venda "],
	});
	assert.equal(plan.estagioAlvo, "Primeira venda");
});

test("primeiro mês exige 30 dias e campanha enviando nas duas últimas semanas", () => {
	const old = new Date(NOW.getTime() - 31 * DAY);
	const reached = (s: TControlLifecycleSnapshot) =>
		planControlLifecycleSync({ snapshot: s, marcosEnviados: [], estagiosDoQuadro: ALL_STAGES }).novosMarcos.some((m) => m.chave === "primeiro_mes");
	assert.equal(reached(snapshot({ organizacaoCriadaEm: old, enviosCampanhaUltimos14Dias: 3 })), true);
	assert.equal(reached(snapshot({ organizacaoCriadaEm: old, enviosCampanhaUltimos14Dias: 0 })), false);
	assert.equal(reached(snapshot({ enviosCampanhaUltimos14Dias: 3 })), false);
});

test("o cartão só avança", () => {
	assert.equal(shouldMoveSuccessStage({ estagioAtual: null, estagioAlvo: "Boas vindas" }), true);
	assert.equal(shouldMoveSuccessStage({ estagioAtual: "Boas vindas", estagioAlvo: "Primeira venda" }), true);
	assert.equal(shouldMoveSuccessStage({ estagioAtual: "Primeira venda", estagioAlvo: "Boas vindas" }), false);
	assert.equal(shouldMoveSuccessStage({ estagioAtual: "Primeira venda", estagioAlvo: "Primeira venda" }), false);
	assert.equal(shouldMoveSuccessStage({ estagioAtual: "primeira venda ", estagioAlvo: "Primeira Campanha realizada" }), true);
});

test("estágios manuais e desconhecidos não são tocados", () => {
	assert.equal(shouldMoveSuccessStage({ estagioAtual: "Coleta de NPS", estagioAlvo: "Primeiro mês de Uso" }), false);
	assert.equal(shouldMoveSuccessStage({ estagioAtual: "Algo que o time criou", estagioAlvo: "Primeira venda" }), false);
	assert.equal(shouldMoveSuccessStage({ estagioAtual: null, estagioAlvo: null }), false);
});

test("campos personalizados: só as chaves que existem no Control, sem nulos nem textos vazios", () => {
	assert.deepEqual(
		buildControlCustomFields({
			valores: { plano: "ESCALA", segmento: null, assinatura_status: "  ", fonte_de_dados: "", campanhas_ativas: 3, inexistente: "x" },
			chavesDisponiveis: ["plano", "segmento", "assinatura_status", "fonte_de_dados", "campanhas_ativas"],
		}),
		{ plano: "ESCALA", campanhas_ativas: 3 },
	);
});

test("aviso de fim do teste: só nos últimos 3 dias, sem assinatura paga, uma chave por data", async () => {
	const { resolveTrialEndingNotice } = await import("./lifecycle");
	const end = new Date(NOW.getTime() + 2 * DAY);
	assert.deepEqual(resolveTrialEndingNotice({ periodoTesteFim: end, stripeSubscriptionStatus: null, now: NOW }), {
		chave: `teste_terminando:${end.toISOString().slice(0, 10)}`,
		evento: "teste_terminando",
		fimDoTeste: end.toISOString().slice(0, 10),
	});
	assert.equal(resolveTrialEndingNotice({ periodoTesteFim: new Date(NOW.getTime() + 4 * DAY), stripeSubscriptionStatus: null, now: NOW }), null);
	assert.equal(resolveTrialEndingNotice({ periodoTesteFim: new Date(NOW.getTime() - DAY), stripeSubscriptionStatus: null, now: NOW }), null);
	assert.equal(resolveTrialEndingNotice({ periodoTesteFim: end, stripeSubscriptionStatus: "active", now: NOW }), null);
	assert.notEqual(resolveTrialEndingNotice({ periodoTesteFim: end, stripeSubscriptionStatus: "canceled", now: NOW }), null);
	assert.equal(resolveTrialEndingNotice({ periodoTesteFim: null, stripeSubscriptionStatus: null, now: NOW }), null);
});

test("backfill silencioso: só antes do primeiro marco registrado, mesmo com uma tentativa que falhou", () => {
	const old = new Date(NOW.getTime() - 10 * DAY);
	// Primeira tentativa falhou: a linha existe, mas nenhum marco foi registrado.
	assert.equal(shouldBackfillSilently({ marcosEnviados: [], organizacaoCriadaEm: old, now: NOW }), true);
	// O aviso de fim do teste não é marco: não encerra o backfill.
	assert.equal(shouldBackfillSilently({ marcosEnviados: ["teste_terminando:2026-11-23"], organizacaoCriadaEm: old, now: NOW }), true);
	assert.equal(shouldBackfillSilently({ marcosEnviados: ["boas_vindas"], organizacaoCriadaEm: old, now: NOW }), false);
	// Organização nova: os marcos viram eventos desde o começo.
	assert.equal(shouldBackfillSilently({ marcosEnviados: [], organizacaoCriadaEm: new Date(NOW.getTime() - DAY), now: NOW }), false);
});

test("avisos de parado: pelo estado atual, só para conta viva, sem campanha antes do WhatsApp", async () => {
	const { resolveStuckNotices } = await import("./lifecycle");
	const trial = new Date(NOW.getTime() + 10 * DAY);
	const keys = (overrides: Partial<TControlLifecycleSnapshot>, periodoTesteFim: Date | null = trial, stripeSubscriptionStatus: string | null = null) =>
		resolveStuckNotices({ snapshot: snapshot(overrides), periodoTesteFim, stripeSubscriptionStatus }).map((n) => n.evento);

	// O caso da trezz: onboarding feito há 5 dias, vendendo, sem WhatsApp oficial.
	const trezz = {
		onboardingConcluidoEm: new Date(NOW.getTime() - 5 * DAY),
		primeiraVendaEm: new Date(NOW.getTime() - 4 * DAY),
		campanhasPreparadas: 3,
	};
	assert.deepEqual(keys(trezz), ["whatsapp_pendente"]);
	// Já entrega campanhas por outra conexão (não oficial): tem canal, nada de aviso.
	assert.deepEqual(keys({ ...trezz, primeiroEnvioCampanhaEm: new Date(NOW.getTime() - 30 * DAY) }, null, "active"), []);
	// Sem campanha preparada, a mensagem ("só falta o WhatsApp") não se aplica.
	assert.deepEqual(keys({ ...trezz, campanhasPreparadas: 0 }), []);
	// Onboarding de hoje: ainda não é "parado".
	assert.deepEqual(keys({ onboardingConcluidoEm: NOW }), []);
	// Com WhatsApp, vendendo há 5 dias sem campanha entregue.
	assert.deepEqual(keys({ ...trezz, primeiraVendaEm: new Date(NOW.getTime() - 5 * DAY), whatsappOficialConectado: true }), ["vendendo_sem_campanha"]);
	assert.deepEqual(keys({ ...trezz, whatsappOficialConectado: true, primeiroEnvioCampanhaEm: NOW }), []);
	// Teste vencido e sem assinatura: nenhum empurrão. Pagante: sim.
	assert.deepEqual(keys(trezz, new Date(NOW.getTime() - DAY)), []);
	assert.deepEqual(keys(trezz, new Date(NOW.getTime() - DAY), "active"), ["whatsapp_pendente"]);
});
