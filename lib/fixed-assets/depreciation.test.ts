import assert from "node:assert/strict";
import test from "node:test";
import {
	getAccumulatedDepreciationCents,
	getBookValueCents,
	getCiapInstallmentCents,
	getMonthKey,
	getMonthlyDepreciationCents,
	getMonthsInUse,
	splitAssetValues,
} from "./depreciation";

const asset = {
	valorAquisicao: 12000,
	valorResidual: 0,
	depreciacaoAcumuladaInicial: 0,
	vidaUtilMeses: 120,
	dataInicioUso: new Date("2026-03-15T12:00:00Z"),
	dataBaixa: null,
	creditoIcmsCiap: 1440,
};

test("counts months in use from the start month and stops before the write-off month", () => {
	assert.equal(getMonthsInUse(asset, "2026-02"), 0);
	assert.equal(getMonthsInUse(asset, "2026-03"), 1);
	assert.equal(getMonthsInUse(asset, "2027-02"), 12);
	assert.equal(getMonthsInUse({ ...asset, dataBaixa: new Date("2027-11-10T00:00:00Z") }, "2028-06"), 20);
});

test("linear depreciation accumulates monthly and caps at the depreciable value", () => {
	// 12.000 / 120 = 100 por mês.
	assert.equal(getAccumulatedDepreciationCents(asset, "2026-03"), 10000);
	assert.equal(getMonthlyDepreciationCents(asset, "2026-04"), 10000);
	assert.equal(getAccumulatedDepreciationCents(asset, "2036-02"), 1200000);
	assert.equal(getMonthlyDepreciationCents(asset, "2036-03"), 0);
	assert.equal(getBookValueCents(asset, "2031-02"), 1200000 - 10000 * 60);
});

test("a residual value and an initial accumulated depreciation shorten what is left to depreciate", () => {
	const used = { ...asset, valorResidual: 2000, depreciacaoAcumuladaInicial: 5000 };
	// Depreciável 10.000; 5.000 já consumidos = 60 dos 120 meses; restam 5.000 em 60 meses = 83,33.
	assert.equal(getAccumulatedDepreciationCents(used, "2026-02"), 500000);
	assert.equal(getMonthlyDepreciationCents(used, "2026-03"), 8333);
	assert.equal(getAccumulatedDepreciationCents(used, "2031-02"), 1000000);
	assert.equal(getMonthlyDepreciationCents(used, "2031-02"), 1000000 - (500000 + 8333 * 59));
});

test("CIAP appropriates 1/48 per month, the last one absorbing the remainder, and stops at the write-off", () => {
	// 1.440 / 48 = 30 por mês.
	assert.equal(getCiapInstallmentCents(asset, "2026-02"), 0);
	assert.equal(getCiapInstallmentCents(asset, "2026-03"), 3000);
	assert.equal(getCiapInstallmentCents(asset, "2030-02"), 3000); // mês 48
	assert.equal(getCiapInstallmentCents(asset, "2030-03"), 0); // mês 49
	assert.equal(getCiapInstallmentCents(asset, "2026-05", 0.5), 1500);
	const odd = { ...asset, creditoIcmsCiap: 100.01 };
	const total = Array.from({ length: 48 }, (_, index) => {
		const month = 3 + index;
		const year = 2026 + Math.floor((month - 1) / 12);
		return getCiapInstallmentCents(odd, `${year}-${String(((month - 1) % 12) + 1).padStart(2, "0")}`);
	}).reduce((sum, cents) => sum + cents, 0);
	assert.equal(total, 10001);
	// Baixa no mês 20: só 20 parcelas.
	const writtenOff = { ...asset, dataBaixa: new Date("2027-11-01T00:00:00Z") };
	assert.equal(getCiapInstallmentCents(writtenOff, "2027-10"), 3000);
	assert.equal(getCiapInstallmentCents(writtenOff, "2027-11"), 0);
});

test("splitting keeps totals and leaves the rounding remainder on the original record", () => {
	const group = { ...asset, quantidade: 3, valorAquisicao: 100, creditoIcmsCiap: 10 };
	const { restante, separado } = splitAssetValues(group, 1);
	assert.equal(separado.quantidade, 1);
	assert.equal(restante.quantidade, 2);
	assert.equal(separado.valorAquisicao, 33.33);
	assert.equal(restante.valorAquisicao, 66.67);
	assert.equal(separado.creditoIcmsCiap, 3.33);
	assert.equal(restante.creditoIcmsCiap, 6.67);
	assert.throws(() => splitAssetValues(group, 3), /menor que a quantidade/);
});

test("month keys are computed in UTC", () => {
	assert.equal(getMonthKey(new Date("2026-12-31T23:30:00Z")), "2026-12");
	assert.equal(getMonthKey(new Date("2026-01-01T00:00:00Z")), "2026-01");
});
