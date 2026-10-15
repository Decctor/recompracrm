import assert from "node:assert/strict";
import { test } from "node:test";
import { compareAuditSaleHeaders, isInAuditWindow, isInternalPOIAuditSale, toAuditCents, type TAuditSaleHeader } from "./cardapio-web-sales-audit";

const sale: TAuditSaleHeader = {
	valorTotal: 10.1,
	descontosTotal: 0,
	acrescimosTotal: 0,
	natureza: "SN01",
	situacao: "SN01",
	statusVenda: "CONFIRMADA",
	dataVenda: "2026-08-31T23:59:59.999-03:00",
};
test("interpreta timestamp sem fuso do PostgreSQL em UTC e rótulo legado FECHADO", () => {
	assert.deepEqual(compareAuditSaleHeaders({ ...sale, situacao: "FECHADO", dataVenda: "2026-09-01 02:59:59.999" }, sale), []);
});
test("separa vendas do POI de pedidos importados", () => {
	assert.equal(isInternalPOIAuditSale({ modelo: "DV", idExterno: "POI-1769532683457-aotg02" }), true);
	assert.equal(isInternalPOIAuditSale({ modelo: "CARDAPIO-WEB", idExterno: "169217903" }), false);
	assert.equal(isInternalPOIAuditSale({ modelo: "DV", idExterno: "169217903" }), false);
});
test("compara centavos e o mesmo instante em fusos diferentes", () => {
	assert.deepEqual(
		compareAuditSaleHeaders({ ...sale, valorTotal: 10.10000000001, descontosTotal: null, dataVenda: "2026-09-01T02:59:59.999Z" }, sale),
		[],
	);
	assert.equal(toAuditCents(966204.499999997), 96620450);
});
test("detecta cancelamento mesmo quando o valor continua igual", () => {
	assert.deepEqual(compareAuditSaleHeaders(sale, { ...sale, natureza: "CANCELADO", situacao: "CANCELADO", statusVenda: "CANCELADA" }), [
		"natureza",
		"situacao",
		"statusVenda",
	]);
});
test("detecta valor, modificadores e data divergentes", () => {
	assert.deepEqual(compareAuditSaleHeaders({ ...sale, valorTotal: 10.11, descontosTotal: 1, acrescimosTotal: 2, dataVenda: null }, sale), [
		"valorTotal",
		"descontosTotal",
		"acrescimosTotal",
		"dataVenda",
	]);
	assert.throws(() => toAuditCents(Number.NaN));
});
test("inclui todo 31/08 em São Paulo e exclui 01/09", () => {
	const start = "2026-01-01T00:00:00-03:00";
	const end = "2026-09-01T00:00:00-03:00";
	assert.equal(isInAuditWindow(start, start, end), true);
	assert.equal(isInAuditWindow("2026-01-01T02:59:59.999Z", start, end), false);
	assert.equal(isInAuditWindow(sale.dataVenda, start, end), true);
	assert.equal(isInAuditWindow(end, start, end), false);
	assert.equal(isInAuditWindow(null, start, end), false);
});
