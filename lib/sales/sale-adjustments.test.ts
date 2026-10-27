import assert from "node:assert/strict";
import test from "node:test";
import {
	applyPercentAdjustments,
	clampAdjustmentPercent,
	resolvePercentAdjustment,
	resolveRoundDownDiscount,
	resolveTargetTotalDiscount,
} from "./sale-adjustments";

const baseState = { descontoGeral: 0, acrescimoGeral: 0, descontoGeralPercentual: null, acrescimoGeralPercentual: null };

test("percentual incide sobre a base e arredonda em centavos", () => {
	assert.equal(resolvePercentAdjustment({ base: 47.83, percentual: 10 }), 4.78);
	assert.equal(resolvePercentAdjustment({ base: 0, percentual: 10 }), 0);
	assert.equal(resolvePercentAdjustment({ base: -5, percentual: 10 }), 0);
});

test("percentual fica entre 0 e 100", () => {
	assert.equal(clampAdjustmentPercent(150), 100);
	assert.equal(clampAdjustmentPercent(-3), 0);
	assert.equal(clampAdjustmentPercent(Number.NaN), 0);
	assert.equal(clampAdjustmentPercent(12.345), 12.35);
});

test("sem percentual ativo devolve o mesmo objeto", () => {
	const state = { ...baseState, descontoGeral: 5, acrescimoGeral: 2 };
	assert.equal(applyPercentAdjustments(state, 100), state);
});

test("percentual ativo deriva o valor e acompanha a base", () => {
	const state = { ...baseState, acrescimoGeralPercentual: 10 };
	assert.equal(applyPercentAdjustments(state, 40).acrescimoGeral, 4);
	// Mais um item bipado depois do "Serviço 10%": os 10% acompanham.
	assert.equal(applyPercentAdjustments(state, 52.5).acrescimoGeral, 5.25);
	assert.equal(applyPercentAdjustments(state, 0).acrescimoGeral, 0);
});

test("percentual ativo ignora o valor em R$ guardado", () => {
	const state = { ...baseState, descontoGeral: 999, descontoGeralPercentual: 5 };
	assert.equal(applyPercentAdjustments(state, 200).descontoGeral, 10);
});

test("valor já em dia devolve o mesmo objeto", () => {
	const state = { ...baseState, descontoGeral: 10, descontoGeralPercentual: 5 };
	assert.equal(applyPercentAdjustments(state, 200), state);
});

test("desconto e acréscimo percentuais convivem sobre a mesma base", () => {
	const result = applyPercentAdjustments({ ...baseState, descontoGeralPercentual: 5, acrescimoGeralPercentual: 10 }, 80);
	assert.equal(result.descontoGeral, 4);
	assert.equal(result.acrescimoGeral, 8);
});

test("fechar em: desconto é o total sem desconto menos o alvo", () => {
	assert.deepEqual(resolveTargetTotalDiscount({ totalWithoutDiscount: 47.8, maxDiscount: 47.8, target: 45 }), { ok: true, discount: 2.8 });
	assert.deepEqual(resolveTargetTotalDiscount({ totalWithoutDiscount: 47.8, maxDiscount: 47.8, target: 47.8 }), { ok: true, discount: 0 });
});

test("fechar em acima do total sem desconto é recusado", () => {
	assert.deepEqual(resolveTargetTotalDiscount({ totalWithoutDiscount: 47.8, maxDiscount: 47.8, target: 50 }), {
		ok: false,
		reason: "ABOVE_TOTAL",
		limit: 47.8,
	});
});

test("fechar em abaixo do mínimo é recusado (acréscimo não é consumido pelo desconto)", () => {
	// 40 de itens + 4 de serviço: o menor total possível é 4.
	assert.deepEqual(resolveTargetTotalDiscount({ totalWithoutDiscount: 44, maxDiscount: 40, target: 3 }), {
		ok: false,
		reason: "BELOW_MINIMUM",
		limit: 4,
	});
	assert.deepEqual(resolveTargetTotalDiscount({ totalWithoutDiscount: 44, maxDiscount: 40, target: 4 }), { ok: true, discount: 40 });
});

test("arredondar tira os centavos somando ao desconto atual", () => {
	assert.deepEqual(resolveRoundDownDiscount({ totalWithoutDiscount: 50.3, maxDiscount: 50.3, currentDiscount: 2.5 }), { discount: 3.3, total: 47 });
});

test("arredondar sem centavos não se aplica", () => {
	assert.equal(resolveRoundDownDiscount({ totalWithoutDiscount: 47, maxDiscount: 47, currentDiscount: 0 }), null);
	assert.equal(resolveRoundDownDiscount({ totalWithoutDiscount: 0, maxDiscount: 0, currentDiscount: 0 }), null);
});

test("arredondar não ultrapassa o desconto máximo", () => {
	// Só sobra acréscimo com centavos: não há item para descontar.
	assert.equal(resolveRoundDownDiscount({ totalWithoutDiscount: 4.5, maxDiscount: 0, currentDiscount: 0 }), null);
});

test("arredondar resiste a erro de ponto flutuante", () => {
	assert.equal(resolveRoundDownDiscount({ totalWithoutDiscount: 0.1 + 0.2 + 46.7, maxDiscount: 47, currentDiscount: 0 }), null);
});
