-- Fase 5 da entrada fiscal de compras (ADR-0002, decisoes 5 e 6): lancamento por credor e contraparte.
-- Aplicar: npx tsx ./scripts/apply-sql-migration.ts drizzle/0140_accounting_entry_counterparty_and_purchase_tax.sql
-- DDL aditivo e idempotente. Aplicar ANTES do deploy; rodar depois:
--   npx tsx ./scripts/backfill-accounting-entry-counterparties.ts
--
--   accounting_entries.compra_id                     compra que originou o lancamento (fornecedor ou fisco)
--   accounting_entries.cliente_id / fornecedor_id    contraparte do titulo; no maximo uma (check)
--   financial_recurring_rules.cliente_id/fornecedor_id  herdados pelos lancamentos gerados
--   financial_transactions.*_arquivo_id              boleto/guia e comprovante no catalogo `files`
--   accounting_entry_origin_type + TRIBUTO_COMPRA    divida com o fisco nascida de compra

ALTER TYPE "accounting_entry_origin_type" ADD VALUE IF NOT EXISTS 'TRIBUTO_COMPRA';

ALTER TABLE "ampmais_accounting_entries"
	ADD COLUMN IF NOT EXISTS "compra_id" varchar(255),
	ADD COLUMN IF NOT EXISTS "cliente_id" varchar(255),
	ADD COLUMN IF NOT EXISTS "fornecedor_id" varchar(255);

DO $$ BEGIN
	ALTER TABLE "ampmais_accounting_entries"
		ADD CONSTRAINT "ampmais_accounting_entries_compra_id_ampmais_purchases_id_fk"
		FOREIGN KEY ("compra_id") REFERENCES "ampmais_purchases"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	ALTER TABLE "ampmais_accounting_entries"
		ADD CONSTRAINT "ampmais_accounting_entries_cliente_id_ampmais_clients_id_fk"
		FOREIGN KEY ("cliente_id") REFERENCES "ampmais_clients"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	ALTER TABLE "ampmais_accounting_entries"
		ADD CONSTRAINT "ampmais_accounting_entries_fornecedor_id_ampmais_suppliers_id_fk"
		FOREIGN KEY ("fornecedor_id") REFERENCES "ampmais_suppliers"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	ALTER TABLE "ampmais_accounting_entries"
		ADD CONSTRAINT "ampmais_accounting_entries_single_counterparty_check"
		CHECK ("cliente_id" IS NULL OR "fornecedor_id" IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "idx_accounting_entries_compra_id" ON "ampmais_accounting_entries" ("compra_id");
CREATE INDEX IF NOT EXISTS "idx_accounting_entries_cliente_id" ON "ampmais_accounting_entries" ("cliente_id");
CREATE INDEX IF NOT EXISTS "idx_accounting_entries_fornecedor_id" ON "ampmais_accounting_entries" ("fornecedor_id");

ALTER TABLE "ampmais_financial_recurring_rules"
	ADD COLUMN IF NOT EXISTS "cliente_id" varchar(255),
	ADD COLUMN IF NOT EXISTS "fornecedor_id" varchar(255);
DO $$ BEGIN
	ALTER TABLE "ampmais_financial_recurring_rules"
		ADD CONSTRAINT "ampmais_financial_recurring_rules_cliente_id_ampmais_clients_id_fk"
		FOREIGN KEY ("cliente_id") REFERENCES "ampmais_clients"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	ALTER TABLE "ampmais_financial_recurring_rules"
		ADD CONSTRAINT "ampmais_financial_recurring_rules_fornecedor_id_ampmais_suppliers_id_fk"
		FOREIGN KEY ("fornecedor_id") REFERENCES "ampmais_suppliers"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "ampmais_financial_transactions"
	ADD COLUMN IF NOT EXISTS "documento_cobranca_arquivo_id" varchar(255),
	ADD COLUMN IF NOT EXISTS "comprovante_arquivo_id" varchar(255);
DO $$ BEGIN
	ALTER TABLE "ampmais_financial_transactions"
		ADD CONSTRAINT "ampmais_financial_transactions_documento_cobranca_arquivo_id_ampmais_files_id_fk"
		FOREIGN KEY ("documento_cobranca_arquivo_id") REFERENCES "ampmais_files"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	ALTER TABLE "ampmais_financial_transactions"
		ADD CONSTRAINT "ampmais_financial_transactions_comprovante_arquivo_id_ampmais_files_id_fk"
		FOREIGN KEY ("comprovante_arquivo_id") REFERENCES "ampmais_files"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
