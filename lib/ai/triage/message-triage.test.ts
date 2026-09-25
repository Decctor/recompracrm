import assert from "node:assert/strict";
import test from "node:test";
import { Experimental_EvaluationMockModelV4 } from "ai/test";
import { decideTriageAction, type TMessageTriage, triageIncomingMessage } from "./message-triage";

const settings = { habilitada: true, pularSemResposta: true, handoffDireto: true, modeloEconomico: true };

const base: TMessageTriage = {
	intencao: "PRECO_OU_PRODUTO",
	intencaoProbabilidade: 0.9,
	precisaResposta: 0.95,
	exigeHumano: 0.05,
	tokensEntrada: 800,
	custoUsd: 0.0000336,
	modelo: "typesafe-ai/jev",
};

test("sem triagem ou desabilitada: turno completo", () => {
	assert.equal(decideTriageAction({ triagem: null, settings, agenteTemHandoff: true }).acao, "TURNO_COMPLETO");
	assert.equal(decideTriageAction({ triagem: base, settings: { ...settings, habilitada: false }, agenteTemHandoff: true }).acao, "TURNO_COMPLETO");
});

test("encerramento sem pergunta e com alta confiança: pula a resposta", () => {
	const triagem: TMessageTriage = { ...base, intencao: "ENCERRAMENTO_OU_RECONHECIMENTO", intencaoProbabilidade: 0.93, precisaResposta: 0.05 };
	assert.equal(decideTriageAction({ triagem, settings, agenteTemHandoff: true }).acao, "PULAR");
	// Confiança abaixo do limiar: responde mesmo assim — não responder é o pior erro daqui.
	assert.equal(decideTriageAction({ triagem: { ...triagem, intencaoProbabilidade: 0.7 }, settings, agenteTemHandoff: true }).acao, "TURNO_COMPLETO");
	assert.equal(decideTriageAction({ triagem: { ...triagem, precisaResposta: 0.4 }, settings, agenteTemHandoff: true }).acao, "TURNO_COMPLETO");
	assert.equal(decideTriageAction({ triagem, settings: { ...settings, pularSemResposta: false }, agenteTemHandoff: true }).acao, "TURNO_COMPLETO");
});

test("exige humano com quase certeza: handoff direto, só se o agente pode transferir", () => {
	const triagem: TMessageTriage = { ...base, intencao: "RECLAMACAO", exigeHumano: 0.95 };
	assert.equal(decideTriageAction({ triagem, settings, agenteTemHandoff: true }).acao, "HANDOFF");
	assert.equal(decideTriageAction({ triagem, settings, agenteTemHandoff: false }).acao, "TURNO_COMPLETO");
	assert.equal(decideTriageAction({ triagem: { ...triagem, exigeHumano: 0.8 }, settings, agenteTemHandoff: true }).acao, "TURNO_COMPLETO");
});

test("intenção simples com confiança: modelo econômico; preço e orçamento ficam no modelo configurado", () => {
	assert.equal(decideTriageAction({ triagem: { ...base, intencao: "STATUS_OU_ENTREGA", intencaoProbabilidade: 0.8 }, settings, agenteTemHandoff: true }).acao, "MODELO_ECONOMICO");
	assert.equal(decideTriageAction({ triagem: { ...base, intencao: "STATUS_OU_ENTREGA", intencaoProbabilidade: 0.6 }, settings, agenteTemHandoff: true }).acao, "TURNO_COMPLETO");
	assert.equal(decideTriageAction({ triagem: { ...base, intencao: "ORCAMENTO_OU_PEDIDO", intencaoProbabilidade: 0.99 }, settings, agenteTemHandoff: true }).acao, "TURNO_COMPLETO");
	assert.equal(
		decideTriageAction({ triagem: { ...base, intencao: "SAUDACAO_OU_INICIO" }, settings: { ...settings, modeloEconomico: false }, agenteTemHandoff: true }).acao,
		"TURNO_COMPLETO",
	);
});

test("triageIncomingMessage mapeia respostas, probabilidade da escolha e custo", async () => {
	const model = new Experimental_EvaluationMockModelV4({
		provider: "typesafe-ai",
		modelId: "jev",
		supportedQuestionTypes: ["choice", "boolean"],
		doEvaluate: async () => ({
			answers: {
				// Jev devolve a distribuição completa; o SDK a valida (soma 1, todas as opções).
				intencao: {
					type: "choice",
					choice: "PRECO_OU_PRODUTO",
					probabilities: {
						PRECO_OU_PRODUTO: 0.91,
						ORCAMENTO_OU_PEDIDO: 0.03,
						STATUS_OU_ENTREGA: 0.01,
						CASHBACK_OU_CUPOM: 0.01,
						RECLAMACAO: 0.01,
						DIRIGIDA_A_PESSOA: 0.01,
						SAUDACAO_OU_INICIO: 0.01,
						ENCERRAMENTO_OU_RECONHECIMENTO: 0.0,
						OUTRO: 0.01,
					},
				},
				precisaResposta: { type: "boolean", probability: 0.97 },
				exigeHumano: { type: "boolean", probability: 0.03 },
			},
			usage: { inputTokens: 1000, outputTokens: 0 },
			warnings: [],
		}),
	});

	const triagem = await triageIncomingMessage(
		{ mensagens: [{ autor: "Cliente", texto: "quanto custa o cabo 2,5mm?" }], resumo: null },
		{ model },
	);
	assert.ok(triagem);
	assert.equal(triagem.intencao, "PRECO_OU_PRODUTO");
	assert.equal(triagem.intencaoProbabilidade, 0.91);
	assert.equal(triagem.precisaResposta, 0.97);
	assert.equal(triagem.exigeHumano, 0.03);
	assert.equal(triagem.tokensEntrada, 1000);
	assert.equal(triagem.custoUsd, 0.000042);
});

test("falha do modelo devolve null: o runner segue com o turno completo", async () => {
	const model = new Experimental_EvaluationMockModelV4({
		supportedQuestionTypes: ["choice", "boolean"],
		doEvaluate: async () => {
			throw new Error("gateway indisponível");
		},
	});
	assert.equal(await triageIncomingMessage({ mensagens: [{ autor: "Cliente", texto: "oi" }], resumo: null }, { model }), null);
	assert.equal(await triageIncomingMessage({ mensagens: [], resumo: null }, { model }), null);
});
