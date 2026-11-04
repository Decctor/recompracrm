import assert from "node:assert/strict";
import test from "node:test";

import {
	describeIbptEmissionImpact,
	getIbptRetryDelayMs,
	getIbptUsableVigenciaFimFloor,
	parseIbptApiPayload,
	refreshIbptUf,
	resolveIbptInstalledTableStatus,
} from "./ibpt-rates";

function buildItem(index: number) {
	return {
		codigo: String(index).padStart(8, "0"),
		tipo: 0,
		descricao: `NCM ${index}`,
		nacionalfederal: "15,65",
		importadosfederal: 27.41,
		estadual: 18,
		municipal: 0,
		vigenciainicio: "2026-08-20",
		vigenciafim: "2026-09-30",
		versao: "26.2.A",
		fonte: "IBPT",
	};
}

test("normaliza a tabela e mantém o último dia de vigência inteiro", () => {
	const snapshot = parseIbptApiPayload({ uf: "MG", versao: "26.2.A", ncm: [buildItem(1), buildItem(2)] }, "MG", {
		minimumRows: 2,
		now: new Date("2026-09-04T00:00:00.000Z"),
	});

	assert.equal(snapshot.rows.length, 2);
	assert.equal(snapshot.rows[0].ncm, "00000001");
	assert.equal(snapshot.rows[0].aliqNacionalFederal, 15.65);
	assert.equal(snapshot.vigenciaInicio.toISOString(), "2026-08-20T00:00:00.000Z");
	assert.equal(snapshot.vigenciaFim.toISOString(), "2026-09-30T23:59:59.999Z");
});

test("recusa resposta incompleta antes de substituir a tabela instalada", () => {
	assert.throws(
		() => parseIbptApiPayload({ uf: "MG", versao: "26.2.A", ncm: [buildItem(1)] }, "MG", { minimumRows: 2, now: new Date("2026-09-04T00:00:00.000Z") }),
		/Tabela IBPT de MG incompleta/,
	);
});

test("recusa resposta de outra UF", () => {
	assert.throws(
		() => parseIbptApiPayload({ uf: "PR", versao: "26.2.A", ncm: [buildItem(1)] }, "MG", { minimumRows: 1, now: new Date("2026-09-04T00:00:00.000Z") }),
		/retornou a UF PR ao consultar MG/,
	);
});

test("recusa tabela remota vencida", () => {
	assert.throws(
		() => parseIbptApiPayload({ uf: "MG", versao: "26.2.A", ncm: [buildItem(1)] }, "MG", { minimumRows: 1, now: new Date("2026-10-01T00:00:00.000Z") }),
		/tabela vencida/,
	);
});

const expiredOn = new Date("2026-10-31T23:59:59.999Z");

test("a emissão aceita tabela vencida dentro da folga e recusa depois dela", () => {
	assert.ok(expiredOn >= getIbptUsableVigenciaFimFloor(new Date("2026-11-04T12:00:00.000Z")));
	assert.ok(expiredOn >= getIbptUsableVigenciaFimFloor(new Date("2026-12-30T23:59:59.999Z")));
	assert.ok(expiredOn < getIbptUsableVigenciaFimFloor(new Date("2026-12-31T00:00:00.000Z")));
});

test("situação da tabela instalada acompanha a folga da emissão", () => {
	const installed = { uf: "MG" as const, versao: "26.2.B", vigenciaFim: expiredOn };

	assert.equal(resolveIbptInstalledTableStatus(installed, new Date("2026-10-31T12:00:00.000Z")).status, "VIGENTE");

	const inGrace = resolveIbptInstalledTableStatus(installed, new Date("2026-11-04T12:00:00.000Z"));
	assert.equal(inGrace.status, "VENCIDA_EM_USO");
	if (inGrace.status === "VENCIDA_EM_USO") assert.equal(inGrace.usoAte.toISOString(), "2026-12-30T23:59:59.999Z");

	assert.equal(resolveIbptInstalledTableStatus(installed, new Date("2026-12-31T00:00:00.000Z")).status, "INDISPONIVEL");
	assert.equal(resolveIbptInstalledTableStatus(null, new Date("2026-11-04T12:00:00.000Z")).status, "INDISPONIVEL");
});

test("o alerta diz o que a emissão está fazendo, não só que a tabela foi preservada", () => {
	const installed = { uf: "MG" as const, versao: "26.2.B", vigenciaFim: expiredOn };
	assert.equal(
		describeIbptEmissionImpact("MG", resolveIbptInstalledTableStatus(installed, new Date("2026-11-04T12:00:00.000Z"))),
		"MG: a tabela instalada (versão 26.2.B) venceu em 31/10/2026 e segue em uso na emissão até 30/12/2026. Depois disso, as notas sairão sem os tributos aproximados (Lei 12.741).",
	);
	assert.match(
		describeIbptEmissionImpact("MG", resolveIbptInstalledTableStatus(installed, new Date("2027-01-15T12:00:00.000Z"))),
		/não há tabela IBPT utilizável; a última instalada \(versão 26.2.B\) venceu em 31\/10\/2026\. As notas estão saindo sem/,
	);
	assert.match(describeIbptEmissionImpact("PR", resolveIbptInstalledTableStatus(null, new Date())), /^PR: não há tabela IBPT utilizável\. As notas/);
});

test("backoff é exponencial", () => {
	assert.deepEqual([1, 2, 3].map(getIbptRetryDelayMs), [1_000, 2_000, 4_000]);
});

test("a atualização faz até três retentativas com backoff e se recupera na quarta chamada", async () => {
	let calls = 0;
	const waits: number[] = [];
	const payload = { uf: "MG", versao: "26.2.A", ncm: Array.from({ length: 10_000 }, (_, index) => buildItem(index)) };
	const fetcher = (async () => {
		calls += 1;
		if (calls < 4) throw new Error("indisponível");
		return { ok: true, json: async () => payload } as Response;
	}) as typeof fetch;

	const result = await refreshIbptUf({
		uf: "MG",
		apply: false,
		fetcher,
		now: new Date("2026-09-04T00:00:00.000Z"),
		sleepFn: async (ms) => {
			waits.push(ms);
		},
	});

	assert.equal(result.status, "VALIDADA");
	assert.equal(result.tentativas, 4);
	assert.equal(calls, 4);
	assert.deepEqual(waits, [1_000, 2_000, 4_000]);
});

test("a atualização devolve falha depois da chamada inicial e três retentativas", async () => {
	let calls = 0;
	const fetcher = (async () => {
		calls += 1;
		throw new Error("API fora do ar");
	}) as typeof fetch;

	const result = await refreshIbptUf({
		uf: "MG",
		apply: false,
		fetcher,
		now: new Date("2026-09-04T00:00:00.000Z"),
		sleepFn: async () => undefined,
	});

	assert.equal(result.status, "FALHA");
	assert.equal(result.tentativas, 4);
	assert.equal(calls, 4);
	if (result.status === "FALHA") assert.match(result.erro, /API fora do ar/);
});
