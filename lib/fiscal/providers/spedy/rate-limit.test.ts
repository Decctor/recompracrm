import assert from "node:assert/strict";
import test from "node:test";
import axios, { AxiosError, type AxiosAdapter } from "axios";
import {
	attachSpedyRateLimit,
	parseSpedyRetryDelayMs,
	reserveSpedyRequestSlot,
	resetSpedyRateLimitForTests,
	SPEDY_REQUEST_INTERVAL_MS,
} from "./rate-limit";

test("espaca requisicoes consecutivas da mesma chave", () => {
	resetSpedyRateLimitForTests();
	assert.equal(reserveSpedyRequestSlot("key-a", 1_000), 0);
	assert.equal(reserveSpedyRequestSlot("key-a", 1_000), SPEDY_REQUEST_INTERVAL_MS);
	assert.equal(reserveSpedyRequestSlot("key-a", 1_500), SPEDY_REQUEST_INTERVAL_MS * 2 - 500);
});

test("mantem limites independentes por chave", () => {
	resetSpedyRateLimitForTests();
	assert.equal(reserveSpedyRequestSlot("key-a", 1_000), 0);
	assert.equal(reserveSpedyRequestSlot("key-b", 1_000), 0);
});

test("interpreta Retry-After em segundos", () => {
	assert.equal(parseSpedyRetryDelayMs("3", 1_000), 3_000);
});

test("interpreta x-rate-limit-reset como epoch em segundos", () => {
	assert.equal(parseSpedyRetryDelayMs("2000000000", 1_999_999_998_000), 2_000);
});

test("interpreta data absoluta e rejeita valor invalido", () => {
	assert.equal(parseSpedyRetryDelayMs("Thu, 01 Jan 2026 00:00:05 GMT", Date.parse("2026-01-01T00:00:00Z")), 5_000);
	assert.equal(parseSpedyRetryDelayMs("invalido"), null);
});

test("nao retenta 429 de requisicao marcada com spedySkip429Retry", async () => {
	resetSpedyRateLimitForTests();
	let calls = 0;
	const adapter: AxiosAdapter = async (config) => {
		calls++;
		const response = { data: { retryAfterSeconds: 600 }, status: 429, statusText: "Too Many Requests", headers: {}, config };
		throw new AxiosError("429", AxiosError.ERR_BAD_REQUEST, config, null, response);
	};
	const client = attachSpedyRateLimit(axios.create({ adapter }), "key-skip");
	await assert.rejects(client.post("/v1/inbound-product-invoices/sync", undefined, { spedySkip429Retry: true }), (error: AxiosError) => {
		assert.equal(error.response?.status, 429);
		return true;
	});
	assert.equal(calls, 1);
});
