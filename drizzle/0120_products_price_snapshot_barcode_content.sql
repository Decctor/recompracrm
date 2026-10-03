-- Preço anterior, código de barras e conteúdo da embalagem em produtos e variantes.
-- `preco_venda_anterior` + `data_alteracao_preco_venda` são o snapshot do preço de venda anterior
-- (promoção = anterior > atual, dentro de 30 dias). Escritos pela aplicação, em todo update de
-- `preco_venda`, via `buildPrecoVendaUpdate` (lib/products/price-snapshot.ts) — sem trigger.
-- `codigo_barras` é o GTIN validado; `codigo` segue como chave de identidade das integrações.
-- `conteudo_quantidade` + `conteudo_unidade` alimentam o preço por unidade de medida nas etiquetas;
-- a variante só sobrescreve a quantidade (a unidade é sempre a do produto).
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0120_products_price_snapshot_barcode_content.sql
-- Idempotente — pode ser reexecutada após falha parcial.

DO $$ BEGIN
	CREATE TYPE "product_content_unit" AS ENUM ('ML', 'L', 'G', 'KG', 'UN', 'COMPRIMIDO', 'CAPSULA', 'METRO');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ampmais_products" ADD COLUMN IF NOT EXISTS "preco_venda_anterior" double precision;
ALTER TABLE "ampmais_products" ADD COLUMN IF NOT EXISTS "data_alteracao_preco_venda" timestamp;
ALTER TABLE "ampmais_products" ADD COLUMN IF NOT EXISTS "codigo_barras" text;
ALTER TABLE "ampmais_products" ADD COLUMN IF NOT EXISTS "conteudo_quantidade" double precision;
ALTER TABLE "ampmais_products" ADD COLUMN IF NOT EXISTS "conteudo_unidade" "product_content_unit";

ALTER TABLE "ampmais_product_variants" ADD COLUMN IF NOT EXISTS "preco_venda_anterior" double precision;
ALTER TABLE "ampmais_product_variants" ADD COLUMN IF NOT EXISTS "data_alteracao_preco_venda" timestamp;
ALTER TABLE "ampmais_product_variants" ADD COLUMN IF NOT EXISTS "codigo_barras" text;
ALTER TABLE "ampmais_product_variants" ADD COLUMN IF NOT EXISTS "conteudo_quantidade" double precision;
