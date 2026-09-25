import assert from "node:assert/strict";
import test from "node:test";
import type { TCanonicalImportBatch } from "@/lib/data-connectors";
import {
	createEmptyRunSummary,
	groupIntegrationsByOrganization,
	isEmptyCanonicalBatch,
	mapWithConcurrency,
	resolveIntegrationStatusUpdate,
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
