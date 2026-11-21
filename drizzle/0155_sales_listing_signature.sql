-- Assinatura do pedido na listagem do conector (Bling, Cardápio Web). Gerada para aplicação manual
-- pelo responsável, com scripts/apply-sql-migration.ts. Precisa ir ANTES do deploy: o insert de
-- vendas do Drizzle referencia todas as colunas da tabela.
-- Nenhum backfill: vendas sem carimbo são buscadas com detalhe no próximo run e carimbadas ali.
SET LOCAL lock_timeout = '5s';

ALTER TABLE ampmais_sales ADD COLUMN IF NOT EXISTS assinatura_externa_listagem text;
