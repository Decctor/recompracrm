import assert from "node:assert";
import { describe, it } from "node:test";
import { attendanceStatusValues, attendanceStatusValuesIfChanged } from "./attendance";

describe("attendanceStatusValues", () => {
	it("carimba o momento da etapa junto com o status", () => {
		const at = new Date("2026-09-10T15:14:00Z");
		assert.deepEqual(attendanceStatusValues("ENTREGUE", { at }), { statusAtendimento: "ENTREGUE", statusAtendimentoData: at });
	});

	it("sem `at`, carimba o instante da escrita", () => {
		const before = Date.now();
		const values = attendanceStatusValues("EM_PREPARO");
		assert.equal(values.statusAtendimento, "EM_PREPARO");
		assert.ok(values.statusAtendimentoData.getTime() >= before);
	});
});

describe("attendanceStatusValuesIfChanged", () => {
	it("nao carimba quando o status e reafirmado", () => {
		// A garantia que sustenta a janela de concluidos do quadro: o sync reafirma o status a cada
		// execucao, e carimbar ali faria um re-sync ressuscitar vendas antigas como recem-entregues.
		const values = attendanceStatusValuesIfChanged("ENTREGUE", "ENTREGUE");
		assert.deepEqual(values, { statusAtendimento: "ENTREGUE" });
		assert.ok(!("statusAtendimentoData" in values));
	});

	it("carimba quando o status muda de fato", () => {
		const at = new Date("2026-09-10T15:14:00Z");
		assert.deepEqual(attendanceStatusValuesIfChanged("EM_ENTREGA", "ENTREGUE", { at }), {
			statusAtendimento: "ENTREGUE",
			statusAtendimentoData: at,
		});
	});

	it("trata venda sem status anterior como mudanca", () => {
		const values = attendanceStatusValuesIfChanged(null, "NAO_INICIADO");
		assert.ok("statusAtendimentoData" in values);
	});
});
