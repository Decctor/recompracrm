import assert from "node:assert/strict";
import test from "node:test";
import type { TCanonicalImportBatch } from "@/lib/data-connectors";
import {
	createEmptyRunSummary,
	groupIntegrationsByOrganization,
	isEmptyCanonicalBatch,
	mapWithConcurrency,
	resolveIntegrationStatusUpdate,
	runFetchThenPersistByOrganization,
} from "./run-plan";

function makeBatch(overrides: Partial<TCanonicalImportBatch> = {}): TCanonicalImportBatch {
	return {
		source: "IFOOD",
		organizationId: "org-1",
		integrationId: "int-1",
		window: { startDate: new Date("2026-09-25T00:00:00Z"), endDate: new Date("2026-09-25T23:59:59Z") },
		policies: { saleItemRewritePolicy: "REPLACE_ON_EVERY_SYNC", clientResolutionStrategy: "EXTERNAL_ID_THEN_PHONE" },
		sales: [],
		products: [],
		sellers: [],
		partners: [],
		productAddOns: [],
		productAddOnOptions: [],
		...overrides,
	} as TCanonicalImportBatch;
}

test("lote sem entidades e sem postProcess é vazio", () => {
	assert.equal(isEmptyCanonicalBatch(makeBatch()), true);
});

test("qualquer entidade ou um postProcess tornam o lote não vazio", () => {
	assert.equal(isEmptyCanonicalBatch(makeBatch({ sales: [{} as TCanonicalImportBatch["sales"][number]] })), false);
	assert.equal(isEmptyCanonicalBatch(makeBatch({ products: [{} as TCanonicalImportBatch["products"][number]] })), false);
	assert.equal(isEmptyCanonicalBatch(makeBatch({ sellers: [{} as TCanonicalImportBatch["sellers"][number]] })), false);
	assert.equal(isEmptyCanonicalBatch(makeBatch({ postProcess: async () => {} })), false);
});

test("resumo vazio zera todos os contadores e preserva a identidade do lote", () => {
	const summary = createEmptyRunSummary({ organizationId: "org-1", integrationId: "int-1", source: "IFOOD" });
	assert.equal(summary.organizationId, "org-1");
	assert.equal(summary.integrationId, "int-1");
	assert.equal(summary.source, "IFOOD");
	for (const [key, value] of Object.entries(summary)) {
		if (key === "organizationId" || key === "integrationId" || key === "source") continue;
		assert.equal(value, 0, `${key} deveria ser 0`);
	}
});

test("agrupa por organização preservando a ordem de chegada", () => {
	const groups = groupIntegrationsByOrganization([
		{ id: "a", organizacaoId: "org-1" },
		{ id: "b", organizacaoId: "org-2" },
		{ id: "c", organizacaoId: "org-1" },
	]);
	assert.deepEqual(
		groups.map((group) => group.map((integration) => integration.id)),
		[["a", "c"], ["b"]],
	);
});

test("mapWithConcurrency respeita o limite e devolve na ordem de entrada", async () => {
	let running = 0;
	let peak = 0;
	const results = await mapWithConcurrency([30, 10, 20, 5], 2, async (delay, index) => {
		running += 1;
		peak = Math.max(peak, running);
		await new Promise((resolve) => setTimeout(resolve, delay));
		running -= 1;
		return `${index}:${delay}`;
	});
	assert.deepEqual(results, ["0:30", "1:10", "2:20", "3:5"]);
	assert.equal(peak, 2);
});

test("mapWithConcurrency com lista vazia resolve sem chamar o mapper", async () => {
	let calls = 0;
	const results = await mapWithConcurrency([], 4, async () => {
		calls += 1;
		return null;
	});
	assert.deepEqual(results, []);
	assert.equal(calls, 0);
});

const now = new Date("2026-09-25T12:00:00Z");
const connected = { status: "CONECTADO" as const, ultimoErro: null, dataUltimaSincronizacao: new Date("2026-09-25T11:59:00Z") };
const nothingImported = { importedSalesCount: 0, saleIdCollisionsCount: 0 };

test("run vazio numa conexão saudável recém-sincronizada não grava nada", () => {
	assert.equal(resolveIntegrationStatusUpdate({ integration: connected, summary: nothingImported, now }), null);
});

test("run vazio grava quando a última sincronização envelheceu", () => {
	const stale = { ...connected, dataUltimaSincronizacao: new Date("2026-09-25T11:54:00Z") };
	const update = resolveIntegrationStatusUpdate({ integration: stale, summary: nothingImported, now });
	assert.deepEqual(update, { dataUltimaSincronizacao: now, status: "CONECTADO", ultimoErro: null });
});

test("run vazio grava quando a conexão nunca sincronizou", () => {
	const never = { ...connected, dataUltimaSincronizacao: null };
	assert.notEqual(resolveIntegrationStatusUpdate({ integration: never, summary: nothingImported, now }), null);
});

test("vendas importadas sempre gravam, mesmo com sincronização recente", () => {
	const update = resolveIntegrationStatusUpdate({ integration: connected, summary: { importedSalesCount: 1, saleIdCollisionsCount: 0 }, now });
	assert.notEqual(update, null);
});

test("status ERRO ou EXPIRADO volta para CONECTADO no primeiro run limpo", () => {
	for (const status of ["ERRO", "EXPIRADO"] as const) {
		const update = resolveIntegrationStatusUpdate({ integration: { ...connected, status, ultimoErro: "x" }, summary: nothingImported, now });
		assert.equal(update?.status, "CONECTADO");
		assert.equal(update?.ultimoErro, null);
	}
});

test("colisões de idExterno gravam e limpam o erro no run seguinte", () => {
	const withCollisions = resolveIntegrationStatusUpdate({ integration: connected, summary: { importedSalesCount: 0, saleIdCollisionsCount: 2 }, now });
	assert.match(withCollisions?.ultimoErro ?? "", /2 colisão/);

	const cleared = resolveIntegrationStatusUpdate({
		integration: { ...connected, ultimoErro: withCollisions?.ultimoErro ?? null },
		summary: nothingImported,
		now,
	});
	assert.equal(cleared?.ultimoErro, null);
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("busca de todas as integrações começa já, inclusive as da mesma organização", async () => {
	const items = [
		{ id: "a1", organizacaoId: "org-a" },
		{ id: "a2", organizacaoId: "org-a" },
		{ id: "b1", organizacaoId: "org-b" },
	];
	const fetches = new Map(items.map((item) => [item.id, deferred<string>()]));
	const started: string[] = [];
	const run = runFetchThenPersistByOrganization({
		items,
		fetchConcurrency: 10,
		organizationConcurrency: 1,
		fetch: (item) => {
			started.push(item.id);
			return fetches.get(item.id)!.promise;
		},
		persist: async (item, fetched) => (fetched.ok ? fetched.value : "erro"),
	});
	await flush();
	assert.deepEqual(started, ["a1", "a2", "b1"]);
	for (const item of items) fetches.get(item.id)!.resolve(`lote-${item.id}`);
	const outcomes = await run;
	assert.deepEqual(
		items.map((item) => outcomes.get(item)),
		["lote-a1", "lote-a2", "lote-b1"],
	);
});

test("gravação da mesma organização é em série e na ordem de entrada, mesmo se o segundo lote chegar antes", async () => {
	const items = [
		{ id: "a1", organizacaoId: "org-a" },
		{ id: "a2", organizacaoId: "org-a" },
	];
	const fetches = new Map(items.map((item) => [item.id, deferred<string>()]));
	const events: string[] = [];
	let activePersists = 0;
	let maxActivePersists = 0;
	const run = runFetchThenPersistByOrganization({
		items,
		fetchConcurrency: 10,
		organizationConcurrency: 4,
		fetch: (item) => fetches.get(item.id)!.promise,
		persist: async (item) => {
			activePersists += 1;
			maxActivePersists = Math.max(maxActivePersists, activePersists);
			events.push(`start-${item.id}`);
			await flush();
			events.push(`end-${item.id}`);
			activePersists -= 1;
			return item.id;
		},
	});
	fetches.get("a2")!.resolve("a2");
	await flush();
	assert.deepEqual(events, []);
	fetches.get("a1")!.resolve("a1");
	await run;
	assert.deepEqual(events, ["start-a1", "end-a1", "start-a2", "end-a2"]);
	assert.equal(maxActivePersists, 1);
});

test("organizações distintas gravam em paralelo até o teto", async () => {
	const items = ["a", "b", "c"].map((org) => ({ id: org, organizacaoId: `org-${org}` }));
	let activePersists = 0;
	let maxActivePersists = 0;
	await runFetchThenPersistByOrganization({
		items,
		fetchConcurrency: 10,
		organizationConcurrency: 2,
		fetch: async (item) => item.id,
		persist: async () => {
			activePersists += 1;
			maxActivePersists = Math.max(maxActivePersists, activePersists);
			await flush();
			activePersists -= 1;
		},
	});
	assert.equal(maxActivePersists, 2);
});

test("buscas respeitam o teto de concorrência", async () => {
	const items = Array.from({ length: 5 }, (_, index) => ({ id: `i${index}`, organizacaoId: `org-${index}` }));
	let activeFetches = 0;
	let maxActiveFetches = 0;
	await runFetchThenPersistByOrganization({
		items,
		fetchConcurrency: 2,
		organizationConcurrency: 5,
		fetch: async (item) => {
			activeFetches += 1;
			maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
			await flush();
			activeFetches -= 1;
			return item.id;
		},
		persist: async () => undefined,
	});
	assert.equal(maxActiveFetches, 2);
});

test("busca que falha chega ao persist como erro, na vez da integração, sem derrubar as outras", async () => {
	const items = [
		{ id: "a1", organizacaoId: "org-a" },
		{ id: "a2", organizacaoId: "org-a" },
	];
	let clock = 0;
	const outcomes = await runFetchThenPersistByOrganization({
		items,
		fetchConcurrency: 10,
		organizationConcurrency: 1,
		now: () => (clock += 10),
		fetch: async (item) => {
			if (item.id === "a1") throw new Error("ERP fora do ar");
			return "lote-a2";
		},
		persist: async (_item, fetched) => (fetched.ok ? fetched.value : (fetched.error as Error).message),
	});
	assert.equal(outcomes.get(items[0]), "ERP fora do ar");
	assert.equal(outcomes.get(items[1]), "lote-a2");
});
