-- Índices para os relatórios de estoque (Estoque › Relatórios e aba Estoque do produto): toda agregação
-- por período filtra a organização (ou o produto) e o intervalo de `data_insercao`.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0135_stock_transactions_analytics_indexes.sql
-- Idempotente — pode ser reexecutada. Puramente aditiva.

CREATE INDEX IF NOT EXISTS "idx_product_stock_transactions_org_data" ON "ampmais_product_stock_transactions" ("organizacao_id", "data_insercao");
CREATE INDEX IF NOT EXISTS "idx_product_stock_transactions_produto_data" ON "ampmais_product_stock_transactions" ("produto_id", "data_insercao");
