import assert from "node:assert/strict";
import { mock, test } from "node:test";
import * as ai from "ai";
import { MockLanguageModelV4 } from "ai/test";

const model: MockLanguageModelV4 = new MockLanguageModelV4({
	doGenerate: async () => ({
		content: [{ type: "text", text: model.doGenerateCalls.length % 2 === 1 ? "Pedido 123: R$ 42,00." : "Resumo do pedido 123." }],
		finishReason: { unified: "stop", raw: "stop" },
		usage: {
			inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
			outputTokens: { total: 10, text: 10, reasoning: 0 },
		},
		warnings: [],
	}),
});

mock.module("ai", { namedExports: { ...ai, gateway: () => model } });
const { handleAIDocumentProcessing } = await import("./index.ts");

test("envia os bytes do PDF ao modelo e resume a extração", async () => {
	const bytes = Buffer.from("%PDF-1.7\nconteúdo do documento");
	const result = await handleAIDocumentProcessing(bytes, "application/pdf");
	const content = model.doGenerateCalls[0].prompt[0].content;
	assert.ok(Array.isArray(content));
	const file = content.find((part) => part.type === "file");
	assert.ok(file && file.type === "file");
	assert.equal(file.mediaType, "application/pdf");
	assert.equal(file.data.type, "data");
	assert.ok(file.data.type === "data");
	assert.deepEqual(typeof file.data.data === "string" ? Buffer.from(file.data.data, "base64") : Buffer.from(file.data.data), bytes);
	assert.equal(result.extraction, "Pedido 123: R$ 42,00.");
	assert.equal(result.summary, "Resumo do pedido 123.");
	assert.match(JSON.stringify(model.doGenerateCalls[1].prompt), /Pedido 123: R\$ 42,00/);
});

test("normaliza o MIME do PDF sem converter seus bytes em texto", async () => {
	await handleAIDocumentProcessing(Buffer.from("%PDF-1.7"), "Application/PDF; charset=binary");
	assert.match(JSON.stringify(model.doGenerateCalls[2].prompt), /application\/pdf/);
});

test("preserva o conteúdo de documentos de texto e JSON", async () => {
	for (const mimeType of ["text/plain", "application/json"]) {
		const callIndex = model.doGenerateCalls.length;
		await handleAIDocumentProcessing(Buffer.from('{"pedido":123}'), mimeType);
		assert.match(JSON.stringify(model.doGenerateCalls[callIndex].prompt), /pedido/);
		assert.doesNotMatch(JSON.stringify(model.doGenerateCalls[callIndex].prompt), /"type":"file"/);
	}
});

test("propaga falhas de leitura do modelo sem gerar um resumo de sucesso", async () => {
	const callIndex = model.doGenerateCalls.length;
	const original = model.doGenerate;
	model.doGenerate = async () => {
		throw new Error("PDF inválido");
	};
	try {
		await assert.rejects(handleAIDocumentProcessing(Buffer.from("%PDF-1.7"), "application/pdf"), /PDF inválido/);
		assert.equal(model.doGenerateCalls.length, callIndex);
	} finally {
		model.doGenerate = original;
	}
});
