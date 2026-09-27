-- Fase 2 da matriz de canais (docs/catalog-channels-matrix-design.md §4.1): um item do iFood
-- pertence a no maximo UM vinculo ATIVO por loja. A versao anterior do indice parcial contava as
-- linhas DESVINCULADO, que preservam `externo_item_id` para permitir "revincular" — o efeito era
-- que um item desvinculado nunca mais podia ser vinculado a OUTRO produto.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0114_catalog_links_externo_item_active.sql
-- Idempotente (DROP IF EXISTS / CREATE IF NOT EXISTS).

DROP INDEX IF EXISTS "unq_catalog_links_externo_item";
CREATE UNIQUE INDEX IF NOT EXISTS "unq_catalog_links_externo_item" ON "ampmais_catalog_links"
  ("organizacao_id", "provider", "merchant_id", "externo_item_id")
  WHERE "externo_item_id" IS NOT NULL AND "status" <> 'DESVINCULADO';
