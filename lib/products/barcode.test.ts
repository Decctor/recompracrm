import assert from "node:assert/strict";
import test from "node:test";
import { ProductSchema, ProductVariantSchema } from "@/schemas/products";
import { normalizeProductBarcode } from "./barcode";

test("schema de produto e variante preserva código interno, GTIN formatado e campo omitido", () => {
	for (const schema of [ProductSchema.shape.codigoBarras, ProductVariantSchema.shape.codigoBarras]) {
		assert.equal(schema.parse("1215416471"), "1215416471");
		assert.equal(schema.parse("001234567"), "001234567");
		assert.equal(schema.parse("SKU-01"), "SKU-01");
		assert.equal(schema.parse("4006.3813.3393-1"), "4006381333931");
		assert.equal(schema.parse(undefined), undefined);
		assert.equal(schema.parse(null), null);
		assert.equal(schema.parse("  "), null);
		assert.ok(!schema.safeParse("AÇÃO").success);
		assert.ok(!schema.safeParse("ABC\n123").success);
	}
});

test("normalização de códigos internos preserva sua identidade", () => {
	assert.equal(normalizeProductBarcode(" SKU-01 "), " SKU-01 ");
	assert.equal(normalizeProductBarcode("4006381333932"), "4006381333932");
	assert.equal(normalizeProductBarcode("\x7f"), null);
});
