-- Fase 5 da matriz de canais (docs/catalog-channels-matrix-design.md §10): um optionGroup e uma
-- option do iFood pertencem a no maximo UM vinculo ATIVO por loja, como ja vale para itens (0114).
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0115_catalog_links_add_on_indexes.sql
-- Idempotente (CREATE IF NOT EXISTS).

CREATE UNIQUE INDEX IF NOT EXISTS "unq_catalog_links_externo_option_group" ON "ampmais_catalog_links"
  ("organizacao_id", "provider", "merchant_id", "externo_option_group_id")
  WHERE "externo_option_group_id" IS NOT NULL AND "status" <> 'DESVINCULADO';
CREATE UNIQUE INDEX IF NOT EXISTS "unq_catalog_links_externo_option" ON "ampmais_catalog_links"
  ("organizacao_id", "provider", "merchant_id", "externo_option_id")
  WHERE "externo_option_id" IS NOT NULL AND "status" <> 'DESVINCULADO';
