-- Origem da movimentação de estoque: SISTEMA (gerada por vendas, compras, produções, recontagem,
-- descarte de lote) ou MANUAL (lançada pelo usuário em Movimentações / aba Estoque do produto).
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0134_stock_transaction_origin.sql
-- Idempotente — pode ser reexecutada. Puramente aditiva: linhas existentes ficam como SISTEMA.

DO $$ BEGIN
	CREATE TYPE "public"."stock_movement_origin" AS ENUM ('SISTEMA', 'MANUAL');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ampmais_product_stock_transactions" ADD COLUMN IF NOT EXISTS "origem" "stock_movement_origin" DEFAULT 'SISTEMA' NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_product_stock_transactions_origem" ON "ampmais_product_stock_transactions" ("origem");
