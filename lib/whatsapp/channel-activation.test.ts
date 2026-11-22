import assert from "node:assert/strict";
import test from "node:test";

import {
	describeMessagingLimit,
	mapMetaPhoneFields,
	resolveConnectionTestUpdate,
	resolveWhatsappChannelSteps,
	type TChannelActivationInput,
} from "./channel-activation";

const NOW = new Date("2026-11-22T12:00:00Z");

function input(overrides: Partial<TChannelActivationInput> = {}): TChannelActivationInput {
	return {
		numero: "CONECTADO",
		saudeFalha: null,
		meta: { nomeStatus: "APPROVED", qualidade: "GREEN", limiteEnvio: "TIER_2K", verificadoEm: NOW.toISOString() },
		pagamento: "DESCONHECIDO",
		teste: null,
		modelos: { total: 4, aprovados: 4, rejeitados: 0 },
		...overrides,
	};
}

test("sem número: só o primeiro passo, com a ação de conectar", () => {
	const steps = resolveWhatsappChannelSteps(input({ numero: "NENHUM" }));
	assert.equal(steps.passos.length, 1);
	assert.deepEqual(steps.proximo?.acao, { tipo: "CONECTAR" });
	assert.equal(steps.pronto, false);
});

test("acesso perdido pede reconexão, mesmo com o token dentro da validade", () => {
	const steps = resolveWhatsappChannelSteps(input({ saudeFalha: "Token revogado." }));
	assert.equal(steps.passos[0].tom, "falhou");
	assert.deepEqual(steps.proximo?.acao, { tipo: "RECONECTAR" });
});

test("o próximo passo é o primeiro problema; pagamento não confirmado leva ao cadastro na Meta", () => {
	const steps = resolveWhatsappChannelSteps(input());
	assert.equal(steps.proximo?.chave, "pagamento");
	assert.equal(steps.proximo?.acao?.tipo, "LINK");
	assert.equal(steps.concluidos, 3);
});

test("teste entregue verifica pagamento e entrega: canal pronto", () => {
	const steps = resolveWhatsappChannelSteps(input({ teste: { status: "ENTREGUE", atualizadoEm: NOW.toISOString(), destino: "+55 34 99999-0000" } }));
	assert.equal(steps.pronto, true);
	assert.equal(steps.concluidos, 5);
});

test("recusa por pagamento aparece no passo de pagamento e na entrega", () => {
	const steps = resolveWhatsappChannelSteps(input({ teste: { status: "RECUSADO_PAGAMENTO", atualizadoEm: NOW.toISOString(), erroCodigo: 131042 } }));
	const byKey = Object.fromEntries(steps.passos.map((step) => [step.chave, step]));
	assert.equal(byKey.pagamento.tom, "falhou");
	assert.equal(byKey.entrega.tom, "falhou");
	assert.equal(steps.proximo?.chave, "pagamento");
});

test("nome de exibição recusado leva ao Gerenciador do WhatsApp", () => {
	const steps = resolveWhatsappChannelSteps(
		input({ meta: { nomeStatus: "DECLINED", qualidade: null, limiteEnvio: null, verificadoEm: NOW.toISOString() } }),
	);
	assert.equal(steps.proximo?.chave, "nome");
	assert.equal(steps.proximo?.tom, "falhou");
});

test("teste: entrega vence 'sent' atrasado; 131042 vira recusa por pagamento", () => {
	assert.equal(resolveConnectionTestUpdate({ current: "ENVIADO", status: "delivered" })?.status, "ENTREGUE");
	assert.equal(resolveConnectionTestUpdate({ current: "ENTREGUE", status: "sent" }), null);
	assert.deepEqual(
		resolveConnectionTestUpdate({ current: "ENVIADO", status: "failed", errors: [{ code: 131042, title: "Business eligibility payment issue" }] }),
		{
			status: "RECUSADO_PAGAMENTO",
			erroCodigo: 131042,
			erroMensagem: "Business eligibility payment issue",
		},
	);
	assert.equal(resolveConnectionTestUpdate({ current: "RECUSADO_PAGAMENTO", status: "delivered" })?.status, "ENTREGUE");
});

test("campos da Meta: valores desconhecidos viram null; o limite novo vence o nome antigo", () => {
	assert.deepEqual(
		mapMetaPhoneFields(
			{
				name_status: "PENDING_REVIEW",
				quality_rating: "WHATEVER",
				whatsapp_business_manager_messaging_limit: "TIER_2K",
				messaging_limit_tier: "TIER_250",
			},
			NOW,
		),
		{ nomeStatus: "PENDING_REVIEW", qualidade: null, limiteEnvio: "TIER_2K", verificadoEm: NOW.toISOString() },
	);
	assert.equal(mapMetaPhoneFields({ messaging_limit_tier: "TIER_250" }, NOW).limiteEnvio, "TIER_250");
	assert.equal(mapMetaPhoneFields({ quality_rating: "NA" }, NOW).qualidade, "NA");
	assert.equal(describeMessagingLimit("TIER_2K"), "2.000 clientes por dia");
	assert.equal(describeMessagingLimit("TIER_250"), "250 clientes por dia");
	assert.equal(describeMessagingLimit("TIER_UNLIMITED"), "Sem limite diário");
	assert.equal(describeMessagingLimit("UNTIERED"), null);
});
