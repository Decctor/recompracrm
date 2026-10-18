import assert from "node:assert/strict";
import test from "node:test";
import { ManualStockMovementTypeEnum } from "@/schemas/enums";
import { getManualStockMovementSignedQuantity, isManualStockInflow, MANUAL_STOCK_MOVEMENT_DIRECTION } from "./manual-stock-movements";

test("todo tipo manual tem direção definida", () => {
	for (const type of ManualStockMovementTypeEnum.options) {
		assert.ok(MANUAL_STOCK_MOVEMENT_DIRECTION[type]);
	}
});

test("AJUSTE não pode ser lançado manualmente", () => {
	assert.ok(!ManualStockMovementTypeEnum.safeParse("AJUSTE").success);
});

test("entradas somam e saídas subtraem, independente do sinal informado", () => {
	assert.equal(getManualStockMovementSignedQuantity({ type: "ENTRADA_AQUISICAO", quantity: 5 }), 5);
	assert.equal(getManualStockMovementSignedQuantity({ type: "ENTRADA_DEVOLUCAO", quantity: -5 }), 5);
	assert.equal(getManualStockMovementSignedQuantity({ type: "SAIDA", quantity: 3 }), -3);
	assert.equal(getManualStockMovementSignedQuantity({ type: "DESCARTE", quantity: 2.5 }), -2.5);
	assert.equal(isManualStockInflow("SAIDA_PRODUCAO"), false);
	assert.equal(isManualStockInflow("ENTRADA_PRODUCAO"), true);
});
