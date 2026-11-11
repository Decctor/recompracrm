import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAccessKeyNumber, resolveInboundRegistrationStatus } from "./registration-status";

describe("resolveInboundRegistrationStatus", () => {
	const base = { situacao: "AUTORIZADA" as const, manifestacaoAtual: null, compra: null };

	it("treats a note without purchase or rejection as pending", () => {
		assert.equal(resolveInboundRegistrationStatus(base), "A_REGISTRAR");
		assert.equal(resolveInboundRegistrationStatus({ ...base, manifestacaoAtual: "CIENCIA" }), "A_REGISTRAR");
	});

	it("a live purchase registers the note; a cancelled one gives it back", () => {
		assert.equal(resolveInboundRegistrationStatus({ ...base, compra: { status: "RECEBIDA" } }), "REGISTRADA");
		assert.equal(resolveInboundRegistrationStatus({ ...base, compra: { status: "CANCELADA" } }), "A_REGISTRAR");
	});

	it("rejections and SEFAZ cancellation win in that order", () => {
		assert.equal(resolveInboundRegistrationStatus({ ...base, manifestacaoAtual: "DESCONHECIMENTO" }), "DESCONSIDERADA");
		assert.equal(resolveInboundRegistrationStatus({ ...base, manifestacaoAtual: "NAO_REALIZADA" }), "DESCONSIDERADA");
		assert.equal(resolveInboundRegistrationStatus({ ...base, situacao: "CANCELADA", compra: { status: "RECEBIDA" } }), "CANCELADA");
		assert.equal(resolveInboundRegistrationStatus({ ...base, situacao: "DENEGADA" }), "CANCELADA");
	});
});

describe("parseAccessKeyNumber", () => {
	it("reads série and número from the fixed positions", () => {
		// cUF 35, AAMM 2611, CNPJ 12345678000190, mod 55, série 001, nNF 000004521, tpEmis 1, cNF 01234567, cDV 8
		assert.deepEqual(parseAccessKeyNumber("35261112345678000190550010000045211012345678"), { numero: "4521", serie: "1" });
	});

	it("ignores keys that are not 44 digits", () => {
		assert.deepEqual(parseAccessKeyNumber("123"), { numero: null, serie: null });
	});
});
