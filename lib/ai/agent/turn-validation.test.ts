import assert from "node:assert/strict";
import test from "node:test";
import { hasDeferredActionPromise, shouldRetryDeferredAction } from "./turn-validation";

test("detecta promessa futura sem confundir pergunta ao cliente", () => {
	assert.equal(hasDeferredActionPromise("Vou criar o orçamento agora."), true);
	assert.equal(hasDeferredActionPromise("Um momento que já te envio."), true);
	assert.equal(hasDeferredActionPromise("Quer que eu crie um orçamento?"), false);
});

test("detecta as promessas que escaparam nos testes de julho/2026", () => {
	for (const message of [
		"Beleza! Deixa eu ver quais modelos de 5500W se encaixam no seu orçamento de até R$500.",
		"Um momento só, vou confirmar os dados aqui no sistema e já te mando o orçamento!",
		"Vou dar uma olhada no catálogo e te respondo.",
		"Só um segundo, estou verificando o estoque.",
	]) {
		assert.equal(hasDeferredActionPromise(message), true, message);
	}
});

test("não confunde resposta pronta com promessa", () => {
	for (const message of [
		"Temos o Maxi Ducha 127V 5500W por R$ 87,30 e o Loren Shower por R$ 149,90. Qual prefere?",
		"Seu orçamento foi criado: R$ 197,00 no total.",
		"Quer que eu veja outras cores?",
	]) {
		assert.equal(hasDeferredActionPromise(message), false, message);
	}
});

test("só pede retry quando a ferramenta prometida não rodou", () => {
	const check = (mensagem: string | null, calledTools: string[], resumoAtendimento = "") =>
		shouldRetryDeferredAction({ mensagem, resumoAtendimento, calledTools });

	assert.equal(check("Vou consultar agora.", []), true);
	assert.equal(check("Vou consultar agora.", ["produtos_consultar"]), false);
	assert.equal(check("Vou criar o orçamento agora.", ["produtos_consultar"]), true);
	assert.equal(check("Vou criar o orçamento agora.", ["orcamentos_criar"]), false);
});

test("trata turno sem mensagem e sem ferramenta como turno morto", () => {
	const check = (mensagem: string | null, calledTools: string[], resumoAtendimento = "") =>
		shouldRetryDeferredAction({ mensagem, resumoAtendimento, calledTools });

	assert.equal(check(null, []), true);
	assert.equal(check("   ", []), true);
	// Silêncio legítimo: o humano assumiu e qualquer texto do agente seria ruído.
	assert.equal(check(null, ["atendimento_transferir_para_humano"]), false);
});

test("trata o anexo como entrega, igual a uma ferramenta", () => {
	const anexo = { url: "https://exemplo.com/cardapio.pdf", tipo: "DOCUMENTO" as const, nomeArquivo: "cardapio.pdf" };

	// O arquivo é a resposta inteira: sem texto e sem ferramenta, mas não é turno morto.
	assert.equal(shouldRetryDeferredAction({ mensagem: null, resumoAtendimento: "", calledTools: [], anexo }), false);
	assert.equal(shouldRetryDeferredAction({ mensagem: null, resumoAtendimento: "", calledTools: [], anexo: null }), true);

	// "Já te mando" cumprido na mesma mensagem, porque o PDF vai junto como legenda.
	assert.equal(shouldRetryDeferredAction({ mensagem: "Já te mando o cardápio!", resumoAtendimento: "", calledTools: [], anexo }), false);
	assert.equal(shouldRetryDeferredAction({ mensagem: "Já te mando o cardápio!", resumoAtendimento: "", calledTools: [] }), true);

	// Orçamento continua exigindo a ferramenta: anexar arquivo não cria venda nenhuma.
	assert.equal(shouldRetryDeferredAction({ mensagem: "Vou criar o orçamento agora.", resumoAtendimento: "", calledTools: [], anexo }), true);
});

test("pega a promessa que ficou só no resumo interno", () => {
	assert.equal(
		shouldRetryDeferredAction({
			mensagem: "Perfeito, 1 unidade da Maxi Ducha 127V 5500W.",
			resumoAtendimento: "Vou consultar o catálogo para confirmar o ID antes de criar o orçamento.",
			calledTools: [],
		}),
		true,
	);
	assert.equal(
		shouldRetryDeferredAction({
			mensagem: "Perfeito, 1 unidade da Maxi Ducha 127V 5500W. Já montei seu orçamento: R$ 87,30.",
			resumoAtendimento: "Orçamento criado com 1 unidade.",
			calledTools: ["orcamentos_criar"],
		}),
		false,
	);
});
