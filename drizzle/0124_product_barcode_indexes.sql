-- Índices para a leitura de código de barras no PDV (GET /api/pos/products/barcode).
-- A resolução é exata e por organização: variante.codigo_barras → produto.codigo_barras →
-- codigo (SKU impresso em Code 128). `idx_products_codigo` já cobre a última etapa.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0124_product_barcode_indexes.sql
-- Idempotente — pode ser reexecutada após falha parcial.

CREATE INDEX IF NOT EXISTS "idx_products_organizacao_codigo_barras" ON "ampmais_products" ("organizacao_id", "codigo_barras");
CREATE INDEX IF NOT EXISTS "idx_variantes_organizacao_codigo_barras" ON "ampmais_product_variants" ("organizacao_id", "codigo_barras");
