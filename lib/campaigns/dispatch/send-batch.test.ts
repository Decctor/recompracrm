import assert from "node:assert/strict";
import test from "node:test";
import { CampaignDispatchSendMessageSchema, planCampaignDispatchSendBatches, resolveCampaignDispatchSendMessageIds } from "./queue";
import { runCampaignDispatchSendBatch } from "./send-batch";

const ids = (count: number) => Array.from({ length: count }, (_, index) => `d${index}`);

test("uma falha não interrompe os outros disparos do lote", async () => {
	const ran: string[] = [];
	const result = await runCampaignDispatchSendBatch({
		dispatchIds: ids(5),
		runOne: async ({ dispatchId }) => {
			ran.push(dispatchId);
			if (dispatchId === "d1") throw new Error("meta fora do ar");
		},
		publishContinuation: async () => assert.fail("sem continuação"),
	});
	assert.deepEqual([...ran].sort(), ids(5));
	assert.deepEqual(
		result.failed.map((failure) => failure.dispatchId),
		["d1"],
	);
	assert.equal(result.completed.length, 4);
	assert.deepEqual(result.continued, []);
});

test("perto do fim do orçamento, os disparos não iniciados seguem em continuação", async () => {
	let clock = 0;
	const continued: string[][] = [];
	const result = await runCampaignDispatchSendBatch({
		dispatchIds: ids(6),
		now: () => clock,
		budgetMs: 100_000,
		concurrency: 1,
		runOne: async () => {
			clock += 30_000;
		},
		publishContinuation: async (remaining) => {
			continued.push(remaining);
		},
	});
	// 0s, 30s e 60s começam; aos 90s faltam 10s (< margem de 30s) e o resto vai para a continuação.
	assert.deepEqual(result.completed, ["d0", "d1", "d2"]);
	assert.deepEqual(result.continued, ["d3", "d4", "d5"]);
	assert.deepEqual(continued, [["d3", "d4", "d5"]]);
});

test("cada disparo recebe o prazo do lote", async () => {
	const deadlines = new Set<number>();
	await runCampaignDispatchSendBatch({
		dispatchIds: ids(3),
		now: () => 1_000,
		budgetMs: 240_000,
		runOne: async ({ deadlineAt }) => {
			deadlines.add(deadlineAt);
		},
		publishContinuation: async () => {},
	});
	assert.deepEqual([...deadlines], [241_000]);
});

test("um disparo sozinho sempre roda, mesmo sem orçamento", async () => {
	const result = await runCampaignDispatchSendBatch({
		dispatchIds: ["solo"],
		budgetMs: 0,
		runOne: async () => {},
		publishContinuation: async () => assert.fail("sem continuação"),
	});
	assert.deepEqual(result.completed, ["solo"]);
});

test("a continuação que falha sobe, para a fila reentregar o lote", async () => {
	let clock = 0;
	await assert.rejects(
		runCampaignDispatchSendBatch({
			dispatchIds: ids(3),
			now: () => clock,
			budgetMs: 40_000,
			concurrency: 1,
			runOne: async () => {
				clock += 20_000;
			},
			publishContinuation: async () => {
				throw new Error("fila indisponível");
			},
		}),
		/fila indisponível/,
	);
});

test("lotes de 25, espaçados, com chave derivada do conteúdo", () => {
	const plans = planCampaignDispatchSendBatches({ dispatchIds: [...ids(60), "d0"], generation: "clock" });
	assert.deepEqual(
		plans.map((plan) => plan.dispatchIds.length),
		[25, 25, 10],
	);
	assert.deepEqual(
		plans.map((plan) => plan.delaySeconds),
		[0, 0, 0],
	);
	assert.equal(new Set(plans.map((plan) => plan.idempotencyKey)).size, 3);
	// Mesmo conjunto, mesma chave: republicar o mesmo estado é deduplicado na fila.
	assert.deepEqual(
		planCampaignDispatchSendBatches({ dispatchIds: ids(60), generation: "clock" }).map((plan) => plan.idempotencyKey),
		plans.map((plan) => plan.idempotencyKey),
	);
	assert.deepEqual(
		planCampaignDispatchSendBatches({ dispatchIds: ids(1), generation: "clock", firstDelayIndex: 8 }).map((plan) => plan.delaySeconds),
		[2],
	);
});

test("a mensagem aceita um disparo (formato antigo) ou um lote", () => {
	assert.deepEqual(resolveCampaignDispatchSendMessageIds(CampaignDispatchSendMessageSchema.parse({ dispatchId: "a", worker: 2 })), ["a"]);
	assert.deepEqual(resolveCampaignDispatchSendMessageIds(CampaignDispatchSendMessageSchema.parse({ dispatchIds: ["a", "b", "a"] })), ["a", "b"]);
	assert.throws(() => CampaignDispatchSendMessageSchema.parse({ worker: 1 }));
});
