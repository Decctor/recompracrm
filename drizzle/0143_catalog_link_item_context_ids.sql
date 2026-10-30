-- Apply with scripts/apply-sql-migration.ts, following this repository's numbered SQL workflow.
-- iFood orders identify an item by its catalog-context id (`contextModifiers[].itemContextId`),
-- not by the catalog item id stored in `externo_item_id`. Links keep every context id of the item
-- so order ingestion can resolve through the link instead of falling back to `externalCode`.
-- Filled by publish/push/link/import from now on; existing links: `npm run backfill:ifood-item-context-ids`.
ALTER TABLE "ampmais_catalog_links"
  ADD COLUMN IF NOT EXISTS "externo_item_contexto_ids" text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS "idx_catalog_links_externo_item_contexto_ids"
  ON "ampmais_catalog_links" USING gin ("externo_item_contexto_ids");
