-- Fase 3 da entrada fiscal de compras (ADR-0002, decisao 3): natureza do produto e destinacao do item.
-- Aplicar: npx tsx ./scripts/apply-sql-migration.ts drizzle/0139_purchase_acquisition_nature.sql
-- DDL aditivo e idempotente. Aplicar ANTES do deploy: toda gravacao de item passa a enviar `destinacao`.
--
--   products.natureza                     o que o produto e para a organizacao (default REVENDA)
--   purchase_items.destinacao             para que esta aquisicao serve (default REVENDA)
--   supplier_product_mappings.destinacao  ultima destinacao usada por codigo do fornecedor
--
-- Classificacao inicial: todo produto e REVENDA, exceto os nao vendaveis usados como insumo em
-- ficha tecnica, que viram INSUMO. E o que o sistema ja assumia; a organizacao revisa no cadastro.

DO $$ BEGIN
	CREATE TYPE "acquisition_nature" AS ENUM ('REVENDA', 'INSUMO', 'USO_CONSUMO', 'ATIVO_IMOBILIZADO');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ampmais_products" ADD COLUMN IF NOT EXISTS "natureza" "acquisition_nature" DEFAULT 'REVENDA' NOT NULL;
ALTER TABLE "ampmais_purchase_items" ADD COLUMN IF NOT EXISTS "destinacao" "acquisition_nature" DEFAULT 'REVENDA' NOT NULL;
ALTER TABLE "ampmais_supplier_product_mappings" ADD COLUMN IF NOT EXISTS "destinacao" "acquisition_nature";

-- So mexe em quem ainda esta no default: rodar de novo nao desfaz uma revisao manual.
UPDATE "ampmais_products" p
SET "natureza" = 'INSUMO'
WHERE p."natureza" = 'REVENDA'
	AND p."vendavel" = false
	AND EXISTS (SELECT 1 FROM "ampmais_production_recipe_inputs" i WHERE i."produto_id" = p."id");
