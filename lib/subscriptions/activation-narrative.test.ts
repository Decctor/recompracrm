import assert from "node:assert/strict";
import test from "node:test";

import { resolveBuiltSummary, resolveTrialNarrative, type TTrialNarrativeInput } from "./activation-narrative";

const trialEnd = new Date("2026-11-30T15:00:00Z");
const connect = {
	chave: "conectar-whatsapp",
	rotulo: "Conectar o WhatsApp oficial",
	descricao: "1.284 clientes já estão na sua base.",
	href: "/dashboard/settings?view=meta-oauth",
};

const input = (overrides: Partial<TTrialNarrativeInput> = {}): TTrialNarrativeInput => ({
	reason: "TRIAL",
	daysRemaining: 5,
	trialEnd,
	activation: { segmento: "CRM_INTEGRACAO", ativado: false, proximaAcao: connect },
	...overrides,
});

test("ativada: nenhuma narrativa, vale o texto de cobrança de sempre", () => {
	assert.equal(resolveTrialNarrative(input({ activation: { segmento: "CRM_INTEGRACAO", ativado: true, proximaAcao: null } })), null);
});

test("teste em curso sem ativação: o selo é o próximo passo e leva até ele", () => {
	const narrative = resolveTrialNarrative(input());
	assert.equal(narrative?.status, "Conectar o WhatsApp oficial");
	assert.match(narrative?.mensagem ?? "", /^1\.284 clientes já estão na sua base\. Seu teste vai até 30\/11\.$/);
	assert.deepEqual(narrative?.proximoPasso, { rotulo: "Conectar o WhatsApp oficial", href: connect.href });
});

test("passo esperando a Meta: diz isso e oferece conversa, sem link de ação", () => {
	const narrative = resolveTrialNarrative(
		input({
			activation: {
				segmento: "CRM_INTEGRACAO",
				ativado: false,
				proximaAcao: { ...connect, rotulo: "Aguardando a Meta", descricao: "A Meta está analisando.", href: null },
			},
		}),
	);
	assert.equal(narrative?.status, "Aguardando a Meta");
	assert.match(narrative?.mensagem ?? "", /fale com a gente/);
	assert.equal(narrative?.proximoPasso, null);
});

test("carência sem ativação: o teste acabou antes do marco do segmento, o acesso tem prazo", () => {
	const crm = resolveTrialNarrative(input({ reason: "TRIAL_GRACE", daysRemaining: 1 }));
	assert.equal(crm?.status, "Teste encerrado");
	assert.match(crm?.mensagem ?? "", /antes de a primeira campanha sair\. Próximo passo: conectar o WhatsApp oficial\. O acesso continua por 1 dia;/);
	const erp = resolveTrialNarrative(
		input({ reason: "TRIAL_GRACE", daysRemaining: 9, activation: { segmento: "ERP", ativado: false, proximaAcao: connect } }),
	);
	assert.match(erp?.mensagem ?? "", /as vendas pelo sistema firmarem.*9 dias/);
});

test("o que a loja construiu: números exatos, sem zeros, vendas do canal do segmento", () => {
	const counts = {
		clientes: 1284,
		campanhasAtivas: 3,
		mensagensEntregues: 0,
		recomprasAtribuidas: 1,
		clientesComCashback: 57,
		vendasBalcao: 40,
		vendasErp: 0,
	};
	assert.deepEqual(
		resolveBuiltSummary({ segmento: "CRM_BALCAO", counts, maximo: 10 }).map((item) => `${item.valor} ${item.rotulo}`),
		[
			"1.284 clientes na base",
			"1 compra de quem recebeu campanha",
			"40 vendas registradas no balcão",
			"57 clientes com cashback para usar",
			"3 campanhas ligadas",
		],
	);
	assert.equal(resolveBuiltSummary({ segmento: "CRM_BALCAO", counts }).length, 3);
	assert.equal(
		resolveBuiltSummary({ segmento: "CRM_INTEGRACAO", counts }).some((item) => item.rotulo.includes("balcão")),
		false,
	);
	assert.deepEqual(
		resolveBuiltSummary({
			segmento: "SEM_FONTE",
			counts: { ...counts, clientes: 0, campanhasAtivas: 0, recomprasAtribuidas: 0, clientesComCashback: 0 },
		}),
		[],
	);
});
