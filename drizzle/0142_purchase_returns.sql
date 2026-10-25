-- Fase 8 da entrada fiscal de compras (ADR-0002): devolucao ao fornecedor.
-- Aplicar: npx tsx ./scripts/apply-sql-migration.ts drizzle/0142_purchase_returns.sql
-- DDL aditivo e idempotente.
--
--   purchases.devolucoes   snapshot JSONB das devolucoes (itens, quantidades, valores, lancamento,
--                          chave da NF-e de origem para a NF-e de devolucao). Nenhuma tabela nova:
--                          estoque sai por product_stock_transactions, o credito com o fornecedor e
--                          um lancamento contabil (compra:{id}:DEVOLUCAO:{ref}).

ALTER TABLE "ampmais_purchases" ADD COLUMN IF NOT EXISTS "devolucoes" jsonb;
