import assert from "node:assert/strict";
import test from "node:test";
import { parseSpedySyncCooldown, parseSpedySyncDate } from "./sync-response";

test("timestamps sem offset mantêm horário de Brasília em qualquer TZ do servidor", () => {
	const original = process.env.TZ;
	try {
		for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
			process.env.TZ = tz;
			assert.equal(parseSpedySyncDate("2026-11-16T15:45:49.340255")?.toISOString(), "2026-11-16T18:45:49.340Z");
		}
	} finally {
		if (original === undefined) delete process.env.TZ;
		else process.env.TZ = original;
	}
});

test("preserva offsets explícitos e rejeita datas inválidas", () => {
	assert.equal(parseSpedySyncDate("2026-11-16T18:45:49Z")?.toISOString(), "2026-11-16T18:45:49.000Z");
	assert.equal(parseSpedySyncDate("2026-11-16T15:45:49-03:00")?.toISOString(), "2026-11-16T18:45:49.000Z");
	for (const value of [null, "", "invalido", "2026-11-16"]) assert.equal(parseSpedySyncDate(value), null);
});

test("Retry-After tem preferência sobre timestamp e duração do corpo", () => {
	const now = Date.parse("2026-11-16T18:00:00Z");
	const result = parseSpedySyncCooldown({ retryAfterSeconds: 90, nextAllowedSyncAt: "2026-11-16T22:00:00Z" }, "120", now);
	assert.equal(result.retryAfterSeconds, 120);
	assert.equal(result.nextAllowedSyncAt?.getTime(), now + 120_000);
});

test("aceita HTTP-date, duração do corpo ou timestamp sem cabeçalho", () => {
	const now = Date.parse("2026-11-16T18:00:00Z");
	assert.equal(parseSpedySyncCooldown(null, "Mon, 16 Nov 2026 18:01:00 GMT", now).retryAfterSeconds, 60);
	assert.equal(parseSpedySyncCooldown({ retryAfterSeconds: 30 }, undefined, now).nextAllowedSyncAt?.getTime(), now + 30_000);
	assert.equal(
		parseSpedySyncCooldown({ nextAllowedSyncAt: "2026-11-16T15:45:00" }, undefined, now).nextAllowedSyncAt?.toISOString(),
		"2026-11-16T18:45:00.000Z",
	);
	assert.deepEqual(parseSpedySyncCooldown({}, undefined, now), { retryAfterSeconds: null, nextAllowedSyncAt: null });
	assert.equal(parseSpedySyncCooldown({ retryAfterSeconds: -1 }, "invalid", now).retryAfterSeconds, null);
});
