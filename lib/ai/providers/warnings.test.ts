import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { formatAiSdkWarning, isExpectedAiSdkWarning, logAiSdkWarnings } from "./warnings";

describe("logAiSdkWarnings", () => {
	const originalWarn = console.warn;
	afterEach(() => {
		console.warn = originalWarn;
	});

	function captureWarnings() {
		const lines: string[] = [];
		console.warn = (...args: unknown[]) => {
			lines.push(args.map(String).join(" "));
		};
		return lines;
	}

	it("descarta o modo de compatibilidade de JSON schema do gateway", () => {
		const lines = captureWarnings();
		logAiSdkWarnings({
			provider: "gateway",
			model: "deepseek/deepseek-v4-pro",
			warnings: [
				{ type: "compatibility", feature: "responseFormat JSON schema", details: "JSON response schema is injected into the system message." },
			],
		});
		assert.deepEqual(lines, []);
	});

	it("mantém os demais avisos, com o prefixo do módulo e o modelo", () => {
		const lines = captureWarnings();
		logAiSdkWarnings({
			provider: "gateway",
			model: "google/gemini-2.5-flash-lite",
			warnings: [
				{ type: "deprecated", setting: '"image" content part', message: "Use a file part instead." },
				{ type: "unsupported", feature: "topK" },
				{ type: "compatibility", feature: "specificationVersion", details: "Using v2 specification compatibility mode." },
			],
		});
		assert.deepEqual(lines, [
			'[AI_SDK] (gateway / google/gemini-2.5-flash-lite) Uso depreciado de "image" content part. Use a file part instead.',
			'[AI_SDK] (gateway / google/gemini-2.5-flash-lite) Recurso "topK" não suportado pelo modelo.',
			'[AI_SDK] (gateway / google/gemini-2.5-flash-lite) Recurso "specificationVersion" em modo de compatibilidade. Using v2 specification compatibility mode.',
		]);
	});

	it("só considera esperado o aviso exato de compatibilidade de JSON schema", () => {
		assert.equal(isExpectedAiSdkWarning({ type: "compatibility", feature: "responseFormat JSON schema" }), true);
		assert.equal(isExpectedAiSdkWarning({ type: "unsupported", feature: "responseFormat JSON schema" }), false);
		assert.equal(isExpectedAiSdkWarning({ type: "compatibility", feature: "specificationVersion" }), false);
	});

	it("omite o escopo quando não há provider e modelo", () => {
		assert.equal(formatAiSdkWarning({ type: "unsupported", feature: "seed" }, {}), '[AI_SDK] Recurso "seed" não suportado pelo modelo.');
	});
});
