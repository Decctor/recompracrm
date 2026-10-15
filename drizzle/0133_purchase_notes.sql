-- Anotações livres da compra, editadas na página da compra (aba Cadastro).
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0133_purchase_notes.sql
-- Idempotente — pode ser reexecutada. Puramente aditiva.

ALTER TABLE "ampmais_purchases" ADD COLUMN IF NOT EXISTS "anotacoes" text;
