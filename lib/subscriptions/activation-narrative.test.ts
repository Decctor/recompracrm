import assert from "node:assert/strict";
import test from "node:test";

import { resolveBuiltSummary, resolvePlanSuggestion, resolveTrialNarrative, type TTrialNarrativeInput } from "./activation-narrative";

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
		conversasHub: 0,
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

test("o Hub entra no resumo de quem o usou, no último lugar, sem passar de três", () => {
	const counts = {
		clientes: 1284,
		campanhasAtivas: 3,
		mensagensEntregues: 900,
		recomprasAtribuidas: 12,
		clientesComCashback: 0,
		vendasBalcao: 0,
		vendasErp: 0,
		conversasHub: 48,
	};
	assert.deepEqual(
		resolveBuiltSummary({ segmento: "CRM_INTEGRACAO", counts }).map((item) => `${item.valor} ${item.rotulo}`),
		["1.284 clientes na base", "12 compras de quem recebeu campanha", "48 conversas respondidas no Hub de atendimentos"],
	);
	// Com pouco a mostrar, o Hub não fica sozinho no fim: vem logo depois do que houver.
	assert.deepEqual(
		resolveBuiltSummary({
			segmento: "SEM_FONTE",
			counts: { ...counts, clientes: 0, campanhasAtivas: 0, mensagensEntregues: 0, recomprasAtribuidas: 0, conversasHub: 1 },
		}).map((item) => `${item.valor} ${item.rotulo}`),
		["1 conversa respondida no Hub de atendimentos"],
	);
});

const noErpSales = { BALCAO: 0, CATALOGO: 0, MESAS: 0 };

test("sugestão do checkout: CRM para quem não usou o ERP, sem motivo a explicar", () => {
	for (const segmento of ["CRM_INTEGRACAO", "CRM_BALCAO", "SEM_FONTE"] as const) {
		assert.deepEqual(resolvePlanSuggestion({ segmento, vendasErp: noErpSales, conversasHub: 0 }), { planoBase: "CRM", motivo: null, adicionais: [] });
	}
});

test("sugestão do checkout: CRM + ERP pelo canal que mais vendeu, ou pela jornada escolhida", () => {
	assert.deepEqual(resolvePlanSuggestion({ segmento: "ERP", vendasErp: { BALCAO: 3, CATALOGO: 41, MESAS: 0 }, conversasHub: 0 }), {
		planoBase: "CRM_ERP",
		motivo: "Sugerido porque sua loja vende pelo catálogo digital.",
		adicionais: [],
	});
	assert.equal(
		resolvePlanSuggestion({ segmento: "CRM_ERP", vendasErp: { BALCAO: 120, CATALOGO: 0, MESAS: 0 }, conversasHub: 0 }).motivo,
		"Sugerido porque sua loja vende pelo PDV.",
	);
	assert.equal(
		resolvePlanSuggestion({ segmento: "ERP", vendasErp: noErpSales, conversasHub: 0 }).motivo,
		"Sugerido porque você começou pelo ERP no cadastro.",
	);
});

test("sugestão do checkout: o Hub vem marcado só para quem respondeu conversas nele", () => {
	assert.deepEqual(resolvePlanSuggestion({ segmento: "CRM_INTEGRACAO", vendasErp: noErpSales, conversasHub: 1 }).adicionais, [
		{ chave: "HUB_ATENDIMENTOS", motivo: "Sua equipe já respondeu 1 conversa pelo Hub." },
	]);
	assert.equal(
		resolvePlanSuggestion({ segmento: "CRM_INTEGRACAO", vendasErp: noErpSales, conversasHub: 1530 }).adicionais[0]?.motivo,
		"Sua equipe já respondeu 1.530 conversas pelo Hub.",
	);
});
