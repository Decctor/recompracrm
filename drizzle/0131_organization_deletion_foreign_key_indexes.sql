-- Executar fora de transação: CONCURRENTLY evita bloquear escritas durante a criação.
-- Não usar scripts/apply-sql-migration.ts (ele envolve o arquivo em BEGIN).
-- Índices das FKs consultadas pelo PostgreSQL a cada venda/item excluído.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_poi_transaction_requests_venda_id"
	ON "ampmais_poi_transaction_requests" ("venda_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_productions_venda_id"
	ON "ampmais_productions" ("venda_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_productions_venda_item_id"
	ON "ampmais_productions" ("venda_item_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_product_stock_transactions_venda_item_id"
	ON "ampmais_product_stock_transactions" ("venda_item_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_campaign_dispatch_recipients_venda_id"
	ON "ampmais_campaign_dispatch_recipients" ("venda_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sale_item_modifiers_item_venda_id"
	ON "ampmais_sale_item_modifiers" ("item_venda_id");
