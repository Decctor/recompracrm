import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMainSupplierCandidate } from "./main-supplier-shared";

const baseRow = {
	fornecedorId: "f1",
	fornecedorNome: "Distribuidora A",
	fornecedorCpfCnpj: "12345678000190",
	fornecedorAtivo: true,
	comprasRecentes: "3",
	comprasTotal: "4",
	quantidadeTotal: "120.5",
	valorTotal: "980.40",
	dataUltimaCompra: "2026-09-01 12:00:00",
	comprasTotalProduto: "8",
	posicao: "1",
};

test("normaliza as agregações que o Postgres devolve como string", () => {
	const candidate = formatMainSupplierCandidate(baseRow);
	assert.equal(candidate.comprasRecentes, 3);
	assert.equal(candidate.comprasTotal, 4);
	assert.equal(candidate.quantidadeTotal, 120.5);
	assert.equal(candidate.valorTotal, 980.4);
	assert.ok(candidate.dataUltimaCompra instanceof Date);
	assert.deepEqual(candidate.fornecedor, { id: "f1", nome: "Distribuidora A", cpfCnpj: "12345678000190", ativo: true });
});

test("participação é a fração das compras do produto feitas com o fornecedor", () => {
	assert.equal(formatMainSupplierCandidate(baseRow).participacao, 0.5);
	assert.equal(formatMainSupplierCandidate({ ...baseRow, comprasTotalProduto: "0" }).participacao, 0);
});

test("só a primeira posição do ranking é a sugerida", () => {
	assert.equal(formatMainSupplierCandidate(baseRow).sugerido, true);
	assert.equal(formatMainSupplierCandidate({ ...baseRow, posicao: "2" }).sugerido, false);
});

test("sem data de compra não inventa uma", () => {
	assert.equal(formatMainSupplierCandidate({ ...baseRow, dataUltimaCompra: null }).dataUltimaCompra, null);
});
