import assert from "node:assert/strict";
import test from "node:test";
import { createIntervalLimiter, createKeyedIntervalLimiter, parseRetryAfterHeader, withRateLimitRetry } from "./rate-limit";

function createFakeClock() {
	let now = 0;
	const sleeps: number[] = [];
	// Horário em que cada espera termina: o relógio falso avança na hora, então a duração de uma
	// espera posterior é medida a partir do fim da anterior.
	const wakeUps: number[] = [];
	return {
		sleeps,
		wakeUps,
		clock: {
			now: () => now,
			sleep: async (ms: number) => {
				sleeps.push(ms);
				now += ms;
				wakeUps.push(now);
			},
		},
	};
}

test("o limitador espaça chamadas concorrentes pelo intervalo", async () => {
	const { clock, wakeUps } = createFakeClock();
	const limiter = createIntervalLimiter({ ratePerSecond: 5, clock });
	// Horários 0, 200 e 400: a primeira sai na hora, as outras esperam a vez.
	await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
	assert.deepEqual(wakeUps, [200, 400]);
});

test("chaves diferentes não dividem o ritmo", async () => {
	const { clock, sleeps } = createFakeClock();
	const limiter = createKeyedIntervalLimiter({ ratePerSecond: 1, clock });
	await Promise.all([limiter.acquire("a"), limiter.acquire("b")]);
	assert.deepEqual(sleeps, []);
});

test("repete o limite de taxa e devolve o sucesso", async () => {
	const { clock, sleeps } = createFakeClock();
	let calls = 0;
	const result = await withRateLimitRetry({
		run: async () => {
			calls++;
			if (calls < 3) throw Object.assign(new Error("429"), { rateLimited: true });
			return "ok";
		},
		classify: (outcome) => ({ retry: "error" in outcome && (outcome.error as { rateLimited?: boolean }).rateLimited === true }),
		clock,
		random: () => 0.5,
	});
	assert.equal(result, "ok");
	assert.equal(calls, 3);
	assert.deepEqual(sleeps, [1000, 2000]);
});

test("respeita o retry-after do provedor e relança ao esgotar as tentativas", async () => {
	const { clock, sleeps } = createFakeClock();
	let calls = 0;
	await assert.rejects(
		withRateLimitRetry({
			run: async () => {
				calls++;
				throw new Error("429");
			},
			classify: () => ({ retry: true, retryAfterMs: 1500 }),
			maxAttempts: 2,
			clock,
		}),
		/429/,
	);
	assert.equal(calls, 2);
	assert.deepEqual(sleeps, [1500]);
});

test("erro que não é limite de taxa não é repetido", async () => {
	const { clock } = createFakeClock();
	let calls = 0;
	await assert.rejects(
		withRateLimitRetry({
			run: async () => {
				calls++;
				throw new Error("pagamento");
			},
			classify: () => ({ retry: false }),
			clock,
		}),
	);
	assert.equal(calls, 1);
});

test("resultado com limite de taxa (sem exceção) também é repetido", async () => {
	const { clock } = createFakeClock();
	let calls = 0;
	const result = await withRateLimitRetry({
		run: async () => ({ error: ++calls < 2 ? "rate_limit_exceeded" : null }),
		classify: (outcome) => ({ retry: "result" in outcome && outcome.result.error === "rate_limit_exceeded" }),
		clock,
	});
	assert.equal(result.error, null);
	assert.equal(calls, 2);
});

test("retry-after em segundos ou data", () => {
	assert.equal(parseRetryAfterHeader("2"), 2000);
	assert.equal(parseRetryAfterHeader(new Date(10_000).toUTCString(), 4_000), 6000);
	assert.equal(parseRetryAfterHeader(null), null);
	assert.equal(parseRetryAfterHeader("abc"), null);
});
