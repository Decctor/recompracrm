-- Fase 1 da entrada fiscal de compras (ADR-0002, docs/dev-planning/purchase-fiscal-entry-plan.md).
-- Aplicar: npx tsx ./scripts/apply-sql-migration.ts drizzle/0138_purchase_fiscal_entry_documents.sql
-- DDL aditivo e idempotente. Aplicar ANTES do deploy: o import grava `documento_ref`/`documento_item`
-- em todo item e `xml_arquivo_id` em toda nota recebida.
--
--   fiscal_inbound_documents.modelo          NF-e ou CT-e; todo XML com chave vira linha aqui.
--   fiscal_inbound_documents.xml/pdf_arquivo_id  arquivo no catalogo `files`; os *_storage_path
--                                            viram sombra ate scripts/backfill-purchase-fiscal-files.ts.
--   purchase_items.documento_ref/_item       ponteiro para o `det` do XML; fatos fiscais nao sao copiados.

DO $$ BEGIN
	CREATE TYPE "fiscal_inbound_document_model" AS ENUM ('NFE', 'CTE');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ampmais_fiscal_inbound_documents"
	ADD COLUMN IF NOT EXISTS "modelo" "fiscal_inbound_document_model" DEFAULT 'NFE' NOT NULL,
	ADD COLUMN IF NOT EXISTS "xml_arquivo_id" varchar(255),
	ADD COLUMN IF NOT EXISTS "pdf_arquivo_id" varchar(255);

DO $$ BEGIN
	ALTER TABLE "ampmais_fiscal_inbound_documents"
		ADD CONSTRAINT "ampmais_fiscal_inbound_documents_xml_arquivo_id_ampmais_files_id_fk"
		FOREIGN KEY ("xml_arquivo_id") REFERENCES "ampmais_files"("id") ON DELETE SET NULL;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	ALTER TABLE "ampmais_fiscal_inbound_documents"
		ADD CONSTRAINT "ampmais_fiscal_inbound_documents_pdf_arquivo_id_ampmais_files_id_fk"
		FOREIGN KEY ("pdf_arquivo_id") REFERENCES "ampmais_files"("id") ON DELETE SET NULL;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ampmais_purchase_items"
	ADD COLUMN IF NOT EXISTS "documento_ref" varchar(255),
	ADD COLUMN IF NOT EXISTS "documento_item" integer;
