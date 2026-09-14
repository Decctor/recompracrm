import assert from "node:assert/strict";
import { test } from "node:test";
import { bucketStoreCreditByAging, getStoreCreditAgingDueDateRange, getStoreCreditDaysOverdue, resolveStoreCreditAgingBucket } from "./aging";

/**
 * Datas construídas no fuso local de propósito: `dataPrevisao` é um `timestamp` sem fuso no banco e
 * a loja raciocina no próprio dia. Um literal ISO com `Z` desloca o dia em UTC-3 e faria o teste
 * passar ou falhar conforme a máquina que roda.
 */
const HOJE = new Date(2026, 8, 14, 10, 0, 0);
const emDiaLocal = (ano: number, mesIndex: number, dia: number) => new Date(ano, mesIndex, dia);

test("previsão futura não conta como atraso", () => {
	assert.equal(getStoreCreditDaysOverdue(emDiaLocal(2026, 8, 20), HOJE), -6);
	assert.equal(resolveStoreCreditAgingBucket(emDiaLocal(2026, 8, 20), HOJE), "A_VENCER");
});

test("vencer hoje ainda é A_VENCER — o dia do vencimento é do cliente", () => {
	assert.equal(getStoreCreditDaysOverdue(new Date(2026, 8, 14, 23, 0, 0), HOJE), 0);
	assert.equal(resolveStoreCreditAgingBucket(new Date(2026, 8, 14, 23, 0, 0), HOJE), "A_VENCER");
});

test("as bordas de cada faixa caem no balde certo", () => {
	assert.equal(resolveStoreCreditAgingBucket(emDiaLocal(2026, 8, 13), HOJE), "VENCIDO_1_15");
	assert.equal(resolveStoreCreditAgingBucket(emDiaLocal(2026, 7, 30), HOJE), "VENCIDO_1_15");
	assert.equal(resolveStoreCreditAgingBucket(emDiaLocal(2026, 7, 29), HOJE), "VENCIDO_16_30");
	assert.equal(resolveStoreCreditAgingBucket(emDiaLocal(2026, 7, 15), HOJE), "VENCIDO_16_30");
	assert.equal(resolveStoreCreditAgingBucket(emDiaLocal(2026, 7, 14), HOJE), "VENCIDO_30_MAIS");
});

test("título sem previsão não some da conta — cai em A_VENCER", () => {
	assert.equal(resolveStoreCreditAgingBucket(null, HOJE), "A_VENCER");
});

test("distribuição acumula valor e contagem por faixa, preservando a ordem dos baldes", () => {
	const faixas = bucketStoreCreditByAging(
		[
			{ valor: 100, dataPrevisao: emDiaLocal(2026, 8, 20) },
			{ valor: 50, dataPrevisao: emDiaLocal(2026, 8, 10) },
			{ valor: 25, dataPrevisao: emDiaLocal(2026, 8, 5) },
			{ valor: 400, dataPrevisao: emDiaLocal(2026, 5, 1) },
		],
		HOJE,
	);

	assert.deepEqual(
		faixas.map((faixa) => faixa.chave),
		["A_VENCER", "VENCIDO_1_15", "VENCIDO_16_30", "VENCIDO_30_MAIS"],
	);
	assert.equal(faixas[0].valor, 100);
	assert.equal(faixas[1].valor, 75);
	assert.equal(faixas[1].titulos, 2);
	assert.equal(faixas[3].valor, 400);
});

test("a janela de previsão de cada faixa reproduz exatamente o balde calculado em JS", () => {
	for (const chave of ["A_VENCER", "VENCIDO_1_15", "VENCIDO_16_30", "VENCIDO_30_MAIS"] as const) {
		const { from, to } = getStoreCreditAgingDueDateRange(chave, HOJE);
		// Varre 60 dias em torno de hoje: toda previsão dentro da janela precisa cair na faixa, e
		// toda previsão fora dela, não. É o teste que impede o filtro SQL de divergir do rótulo.
		for (let offset = -30; offset <= 30; offset++) {
			const previsao = new Date(2026, 8, 14 + offset, 12, 0, 0);
			const dentroDaJanela = (!from || previsao >= from) && (!to || previsao <= to);
			assert.equal(dentroDaJanela, resolveStoreCreditAgingBucket(previsao, HOJE) === chave, `${chave} divergiu em ${previsao.toISOString()}`);
		}
	}
});
