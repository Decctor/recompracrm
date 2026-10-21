import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScalePlu, parseScaleBarcodeMask, readScaleBarcode, resolveScaleItemQuantity, type TScaleBarcodeConfig } from "./scale-barcode";

const config: TScaleBarcodeConfig = { habilitado: true, mascara: "2PPPPPVVVVVVD", tipoValor: "PRECO", casasDecimais: 2 };

test("etiquetas reais de pão de queijo: PLU 10, R$ 8,09 e R$ 3,09", () => {
	assert.deepEqual(readScaleBarcode("2000100008096", config), { plu: "00010", tipoValor: "PRECO", valor: 8.09 });
	assert.deepEqual(readScaleBarcode(" 2000100003091 ", config), { plu: "00010", tipoValor: "PRECO", valor: 3.09 });
});

test("quantidade pelo preço do sistema reproduz o peso impresso e fecha o total", () => {
	const first = resolveScaleItemQuantity({ reading: { plu: "00010", tipoValor: "PRECO", valor: 8.09 }, precoUnitario: 32.9 });
	assert.deepEqual(first, { quantidade: 0.2459, valorTotal: 8.09 });
	const second = resolveScaleItemQuantity({ reading: { plu: "00010", tipoValor: "PRECO", valor: 3.09 }, precoUnitario: 32.9 });
	assert.deepEqual(second, { quantidade: 0.0939, valorTotal: 3.09 });
});

test("preço do sistema diferente do da balança muda o peso, não o valor cobrado", () => {
	const result = resolveScaleItemQuantity({ reading: { plu: "1", tipoValor: "PRECO", valor: 8.09 }, precoUnitario: 35 });
	assert.deepEqual(result, { quantidade: 0.2311, valorTotal: 8.09 });
});

test("total cobrado fica a no máximo um centavo da etiqueta até R$ 200/kg", () => {
	for (let cents = 1; cents <= 20000; cents += 37) {
		const valor = cents / 100;
		const result = resolveScaleItemQuantity({ reading: { plu: "1", tipoValor: "PRECO", valor }, precoUnitario: 199.9 });
		if (!result) continue;
		assert.ok(Math.abs(result.valorTotal - valor) <= 0.01 + 1e-9, `R$ ${valor}: ${result.valorTotal}`);
	}
});

test("produto sem preço não tem como virar quantidade numa etiqueta de preço", () => {
	assert.equal(resolveScaleItemQuantity({ reading: { plu: "1", tipoValor: "PRECO", valor: 8.09 }, precoUnitario: 0 }), null);
});

test("etiqueta de peso: quantidade é o peso e o total vem do preço do sistema", () => {
	const reading = readScaleBarcode("2000100002469", { ...config, tipoValor: "PESO", casasDecimais: 3 });
	assert.deepEqual(reading, { plu: "00010", tipoValor: "PESO", valor: 0.246 });
	assert.deepEqual(resolveScaleItemQuantity({ reading: reading!, precoUnitario: 32.9 }), { quantidade: 0.246, valorTotal: 8.09 });
});

test("código fora da máscara segue a busca normal", () => {
	assert.equal(readScaleBarcode("7891234567895", config), null); // prefixo não bate
	assert.equal(readScaleBarcode("2000100008097", config), null); // verificador errado
	assert.equal(readScaleBarcode("200010000809", config), null); // truncado
	assert.equal(readScaleBarcode("2000100008096", { ...config, habilitado: false }), null);
	assert.equal(readScaleBarcode("2000100000005", config), null); // valor zero
});

test("literais do meio da máscara precisam bater", () => {
	const withLiteral = { ...config, mascara: "2PPPP0VVVVVVD" };
	assert.deepEqual(readScaleBarcode("2000100008096", withLiteral), { plu: "0001", tipoValor: "PRECO", valor: 8.09 });
	assert.equal(readScaleBarcode("2000110008095", withLiteral), null);
});

test("validação da máscara", () => {
	assert.equal(parseScaleBarcodeMask("2PPPPPVVVVVVD").ok, true);
	assert.equal(parseScaleBarcodeMask("2ppppp0vvvvvd").ok, true);
	assert.equal(parseScaleBarcodeMask("2PPPPPVVVVVV").ok, false); // 12 caracteres
	assert.equal(parseScaleBarcodeMask("PPPPPPVVVVVVD").ok, false); // sem prefixo
	assert.equal(parseScaleBarcodeMask("2PPVPPVVVVVVD").ok, false); // blocos partidos
	assert.equal(parseScaleBarcodeMask("2PPPPPVVVVVV0").ok, false); // sem verificador no fim
	assert.equal(parseScaleBarcodeMask("2PPPPPPPVVVVD").ok, false); // PLU longo demais
	assert.equal(parseScaleBarcodeMask("2PPPPPPPPPVVD").ok, false); // valor curto demais
});

test("PLU ignora zeros à esquerda", () => {
	assert.equal(normalizeScalePlu("00010"), "10");
	assert.equal(normalizeScalePlu("10"), "10");
	assert.equal(normalizeScalePlu("00000"), null);
	assert.equal(normalizeScalePlu("SKU-10"), null);
});
