import assert from "node:assert/strict";
import test from "node:test";
import { inferEntryTaxRegime, resolveEntryTaxTreatment } from "./presets";

test("Simples Nacional keeps every tax in cost", () => {
	for (const chave of ["IMPOSTOS_ICMS", "IMPOSTOS_PIS", "IMPOSTOS_IPI", "IMPOSTOS_ICMS_ST"] as const) {
		const result = resolveEntryTaxTreatment({ regime: "SIMPLES_NACIONAL", destinacao: "REVENDA", chave, contrapartida: "INCLUSO_NO_VALOR" });
		assert.equal(result.tratamento, "CUSTO_ESTOQUE", chave);
		assert.equal(result.origem, "PRESET");
	}
});

test("Lucro Presumido credits ICMS on resale and inputs, never PIS/COFINS, IPI only for IPI taxpayers", () => {
	const icms = resolveEntryTaxTreatment({
		regime: "LUCRO_PRESUMIDO",
		destinacao: "REVENDA",
		chave: "IMPOSTOS_ICMS",
		contrapartida: "INCLUSO_NO_VALOR",
	});
	assert.equal(icms.tratamento, "CREDITO_TRIBUTARIO");
	const pis = resolveEntryTaxTreatment({ regime: "LUCRO_PRESUMIDO", destinacao: "REVENDA", chave: "IMPOSTOS_PIS", contrapartida: "INCLUSO_NO_VALOR" });
	assert.equal(pis.tratamento, "CUSTO_ESTOQUE");
	const ipiNo = resolveEntryTaxTreatment({ regime: "LUCRO_PRESUMIDO", destinacao: "INSUMO", chave: "IMPOSTOS_IPI", contrapartida: "FORNECEDOR" });
	assert.equal(ipiNo.tratamento, "CUSTO_ESTOQUE");
	const ipiYes = resolveEntryTaxTreatment({
		regime: "LUCRO_PRESUMIDO",
		contribuinteIpi: true,
		destinacao: "INSUMO",
		chave: "IMPOSTOS_IPI",
		contrapartida: "FORNECEDOR",
	});
	assert.equal(ipiYes.tratamento, "CREDITO_TRIBUTARIO");
});

test("Lucro Real credits PIS/COFINS on resale, but uso e consumo gets no ICMS credit", () => {
	assert.equal(
		resolveEntryTaxTreatment({ regime: "LUCRO_REAL", destinacao: "REVENDA", chave: "IMPOSTOS_COFINS", contrapartida: "INCLUSO_NO_VALOR" }).tratamento,
		"CREDITO_TRIBUTARIO",
	);
	assert.equal(
		resolveEntryTaxTreatment({ regime: "LUCRO_REAL", destinacao: "USO_CONSUMO", chave: "IMPOSTOS_ICMS", contrapartida: "INCLUSO_NO_VALOR" }).tratamento,
		"CUSTO_ESTOQUE",
	);
	assert.equal(
		resolveEntryTaxTreatment({ regime: "LUCRO_REAL", destinacao: "REVENDA", chave: "IMPOSTOS_ICMS_ST", contrapartida: "FORNECEDOR" }).tratamento,
		"CUSTO_ESTOQUE",
	);
});

test("a Simples issuer transfers only the presumed ICMS credit", () => {
	const icms = resolveEntryTaxTreatment({
		regime: "LUCRO_REAL",
		destinacao: "REVENDA",
		chave: "IMPOSTOS_ICMS",
		contrapartida: "INCLUSO_NO_VALOR",
		crtEmitente: 1,
	});
	assert.equal(icms.tratamento, "CUSTO_ESTOQUE");
	const sn = resolveEntryTaxTreatment({
		regime: "LUCRO_REAL",
		destinacao: "REVENDA",
		chave: "IMPOSTOS_ICMS_SN",
		contrapartida: "INCLUSO_NO_VALOR",
		crtEmitente: 1,
	});
	assert.equal(sn.tratamento, "CREDITO_TRIBUTARIO");
});

test("organization overrides beat the preset; no regime leaves the tax pending", () => {
	const override = resolveEntryTaxTreatment({
		regime: "SIMPLES_NACIONAL",
		overrides: { REVENDA: { IMPOSTOS_IPI: "DESPESA_PERIODO" } },
		destinacao: "REVENDA",
		chave: "IMPOSTOS_IPI",
		contrapartida: "FORNECEDOR",
	});
	assert.equal(override.tratamento, "DESPESA_PERIODO");
	assert.equal(override.origem, "CONFIGURACAO");
	const pending = resolveEntryTaxTreatment({ regime: null, destinacao: "REVENDA", chave: "IMPOSTOS_IPI", contrapartida: "FORNECEDOR" });
	assert.equal(pending.tratamento, null);
	assert.equal(pending.origem, null);
});

test("CRT 1, 2 and 4 infer Simples; CRT 3 stays undecided", () => {
	assert.equal(inferEntryTaxRegime(1), "SIMPLES_NACIONAL");
	assert.equal(inferEntryTaxRegime(4), "SIMPLES_NACIONAL");
	assert.equal(inferEntryTaxRegime(3), null);
	assert.equal(inferEntryTaxRegime(null), null);
});
