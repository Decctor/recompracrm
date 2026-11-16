import assert from "node:assert/strict";
import test from "node:test";
import { INBOUND_SYNC_RESERVATION_MS, requestSyncWithCooldown, type TInboundSyncDependencies } from "./sync-cooldown";
import type { TInboundSyncStatus } from "./types";

const NOW = Date.parse("2026-11-16T17:00:00Z");
const future = new Date(NOW + 3_600_000);
function setup(initial: Date | null = null) {
	let nextAllowedSyncAt = initial;
	let requests = 0;
	let statusCalls = 0;
	let persistedStatus: TInboundSyncStatus | null = null;
	const deps: TInboundSyncDependencies = {
		now: () => NOW,
		reserve: async (until) => {
			if (nextAllowedSyncAt && nextAllowedSyncAt.getTime() > NOW) return { acquired: false, nextAllowedSyncAt };
			nextAllowedSyncAt = until;
			return { acquired: true, nextAllowedSyncAt };
		},
		persist: async (until, status) => {
			nextAllowedSyncAt = until;
			persistedStatus = status;
		},
		getStatus: async () => {
			statusCalls++;
			return null;
		},
		request: async () => {
			requests++;
			return { accepted: true };
		},
		onStatusError: () => {},
	};
	return { deps, state: () => ({ nextAllowedSyncAt, requests, statusCalls, persistedStatus }) };
}

test("cooldown salvo evita inclusive chamadas de status ao provedor", async () => {
	const { deps, state } = setup(future);
	assert.deepEqual(await requestSyncWithCooldown(deps), { accepted: false, nextAllowedSyncAt: future });
	assert.equal(state().requests, 0);
	assert.equal(state().statusCalls, 0);
});

test("cooldown expirado consulta status e usa nova janela após o aceite", async () => {
	const { deps, state } = setup(new Date(NOW));
	let calls = 0;
	deps.getStatus = async () => ({
		lastSyncAt: new Date(NOW),
		nextAllowedSyncAt: ++calls === 1 ? null : future,
		outcome: "synchronized",
		mensagem: "Documento localizado",
	});
	assert.deepEqual(await requestSyncWithCooldown(deps), { accepted: true, nextAllowedSyncAt: future });
	assert.equal(state().requests, 1);
	assert.equal(state().persistedStatus?.outcome, "synchronized");
});

test("status atualizado impede POST quando consulta externa já iniciou cooldown", async () => {
	const { deps, state } = setup();
	deps.getStatus = async () => ({ lastSyncAt: null, nextAllowedSyncAt: future, outcome: null, mensagem: null });
	assert.equal((await requestSyncWithCooldown(deps)).accepted, false);
	assert.equal(state().requests, 0);
	assert.equal(state().nextAllowedSyncAt, future);
});

test("cliques concorrentes e cron compartilham uma única solicitação", async () => {
	const { deps, state } = setup();
	const results = await Promise.all([requestSyncWithCooldown(deps), requestSyncWithCooldown(deps), requestSyncWithCooldown(deps)]);
	assert.equal(state().requests, 1);
	assert.equal(results.filter((result) => result.accepted).length, 1);
});

test("429 persiste Retry-After e não repete POST", async () => {
	const { deps, state } = setup();
	let requests = 0;
	deps.request = async () => {
		requests++;
		return { accepted: false, retryAfterSeconds: 3600 };
	};
	assert.deepEqual(await requestSyncWithCooldown(deps), { accepted: false, nextAllowedSyncAt: future });
	await requestSyncWithCooldown(deps);
	assert.equal(requests, 1);
	assert.deepEqual(state().nextAllowedSyncAt, future);
});

test("aceite com status atrasado ou indisponível mantém reserva curta", async () => {
	for (const failing of [false, true]) {
		const { deps, state } = setup();
		let calls = 0;
		deps.getStatus = async () => {
			if (++calls === 2 && failing) throw new Error("status indisponível");
			return null;
		};
		const result = await requestSyncWithCooldown(deps);
		assert.equal(result.accepted, true);
		assert.equal(state().nextAllowedSyncAt?.getTime(), NOW + INBOUND_SYNC_RESERVATION_MS);
	}
});

test("falha de rede mantém reserva para resultado possivelmente aceito", async () => {
	const { deps, state } = setup();
	deps.request = async () => {
		throw new Error("timeout");
	};
	await assert.rejects(requestSyncWithCooldown(deps), /timeout/);
	assert.equal(state().nextAllowedSyncAt?.getTime(), NOW + INBOUND_SYNC_RESERVATION_MS);
	assert.equal((await requestSyncWithCooldown(deps)).accepted, false);
});
