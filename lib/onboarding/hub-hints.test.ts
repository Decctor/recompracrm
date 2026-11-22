import assert from "node:assert/strict";
import test from "node:test";

import type { TActivation, TActivationMilestone } from "./activation";
import { resolveHubEmptyHints } from "./hub-hints";

const step = (chave: string, estado: TActivationMilestone["estado"], href: string | null = `/${chave}`): TActivationMilestone => ({
	chave,
	rotulo: chave,
	estado,
	detalhe: null,
	acao: estado === "FEITO" ? null : { chave, rotulo: `Ação ${chave}`, descricao: `Descrição ${chave}`, href },
});

function activation(segmento: TActivation["segmento"], marcos: TActivationMilestone[], ativado = false): TActivation {
	return {
		segmento,
		canalErp: null,
		marcos,
		progresso: { feitos: 0, total: marcos.length },
		proximaAcao: null,
		ativado,
		regressao: null,
		visivel: !ativado,
	};
}

test("sem ativação carregada, ou já ativada: nenhuma dica", () => {
	assert.deepEqual(resolveHubEmptyHints(null), { vendas: null, segmentos: null, campanhas: null });
	assert.deepEqual(resolveHubEmptyHints(activation("CRM_INTEGRACAO", [step("whatsapp", "PENDENTE")], true)), {
		vendas: null,
		segmentos: null,
		campanhas: null,
	});
});

test("balcão sem venda: vendas e segmentos apontam para a primeira venda; campanhas para o WhatsApp", () => {
	const hints = resolveHubEmptyHints(
		activation("CRM_BALCAO", [step("conta", "FEITO"), step("fonte", "FEITO"), step("primeira-venda-balcao", "PENDENTE"), step("whatsapp", "PENDENTE")]),
	);
	assert.equal(hints.vendas?.acao?.href, "/primeira-venda-balcao");
	assert.equal(hints.segmentos?.acao?.href, "/primeira-venda-balcao");
	assert.equal(hints.campanhas?.acao?.href, "/whatsapp");
});

test("integração com a base chegando: texto sem botão", () => {
	const hints = resolveHubEmptyHints(
		activation("CRM_INTEGRACAO", [
			step("fonte", "FEITO"),
			step("base", "EM_ANDAMENTO", null),
			step("whatsapp", "FEITO"),
			step("primeira-entrega", "PENDENTE"),
		]),
	);
	assert.equal(hints.segmentos?.acao, null);
	assert.match(hints.segmentos?.texto ?? "", /base está chegando/);
	assert.equal(hints.campanhas?.texto, "Descrição primeira-entrega");
});

test("sem fonte: tudo aponta para definir a fonte", () => {
	const hints = resolveHubEmptyHints(activation("SEM_FONTE", [step("conta", "FEITO"), step("fonte", "PENDENTE")]));
	assert.equal(hints.vendas?.acao?.href, "/fonte");
	assert.equal(hints.segmentos?.acao?.href, "/fonte");
});

test("ação que espera a Meta vira texto sem botão", () => {
	const hints = resolveHubEmptyHints(activation("CRM_INTEGRACAO", [step("whatsapp", "FEITO"), step("primeira-entrega", "EM_ANDAMENTO", null)]));
	assert.equal(hints.campanhas?.acao, null);
});
