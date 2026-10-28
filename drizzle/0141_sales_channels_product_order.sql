-- Ordem relativa de produtos por canal, dentro do grupo atual.
-- Aplicar: npx tsx ./scripts/apply-sql-migration.ts drizzle/0141_sales_channels_product_order.sql
ALTER TABLE "ampmais_sales_channels"
	ADD COLUMN IF NOT EXISTS "ordem_produtos" text[] DEFAULT '{}'::text[] NOT NULL;
