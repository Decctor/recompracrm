-- Reconcilia "ampmais_fiscal_inbound_documents" com o schema atual sem o drop/recreate de 0076.
-- Em produção 0076 nunca rodou (ver 0130): a tabela ainda tem o formato original (nsu NOT NULL,
-- situacao varchar) e faltam as colunas do redesign, então todo SELECT do módulo falha.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0134_reconcile_fiscal_inbound_documents.sql
-- Idempotente — pode ser reexecutada. Preserva as notas existentes; a próxima sincronização
-- preenche provedor/provedor_documento_id das linhas legadas (upsert por chave de acesso).

DO $$ BEGIN
	CREATE TYPE "public"."fiscal_inbound_situacao" AS ENUM('AUTORIZADA', 'DENEGADA', 'CANCELADA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ampmais_fiscal_inbound_documents"
	ADD COLUMN IF NOT EXISTS "provedor" "fiscal_provider" NOT NULL DEFAULT 'MANUAL',
	ADD COLUMN IF NOT EXISTS "provedor_documento_id" varchar(255),
	ADD COLUMN IF NOT EXISTS "manifestacao_protocolo" varchar(60),
	ADD COLUMN IF NOT EXISTS "manifestacao_data" timestamp,
	ADD COLUMN IF NOT EXISTS "manifestacao_justificativa" varchar(255),
	ADD COLUMN IF NOT EXISTS "pdf_storage_path" varchar(500),
	ADD COLUMN IF NOT EXISTS "eventos_payload" text,
	ADD COLUMN IF NOT EXISTS "data_atualizacao" timestamp NOT NULL DEFAULT now();

-- nsu saiu do schema: o insert atual não o envia, então o NOT NULL legado quebraria toda nota nova.
DO $$ BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'ampmais_fiscal_inbound_documents' AND column_name = 'nsu'
	) THEN
		ALTER TABLE "ampmais_fiscal_inbound_documents" ALTER COLUMN "nsu" DROP NOT NULL;
	END IF;
END $$;

-- situacao legada era texto livre; converte o que for reconhecível e zera o resto
-- (a próxima sincronização reaplica a situação vinda do provedor).
DO $$ BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'ampmais_fiscal_inbound_documents' AND column_name = 'situacao' AND udt_name <> 'fiscal_inbound_situacao'
	) THEN
		ALTER TABLE "ampmais_fiscal_inbound_documents"
			ALTER COLUMN "situacao" TYPE "fiscal_inbound_situacao"
			USING (
				CASE
					WHEN upper(trim("situacao")) IN ('AUTORIZADA', 'AUTORIZADO', '1') THEN 'AUTORIZADA'
					WHEN upper(trim("situacao")) IN ('DENEGADA', 'DENEGADO', '2') THEN 'DENEGADA'
					WHEN upper(trim("situacao")) IN ('CANCELADA', 'CANCELADO', '3') THEN 'CANCELADA'
					ELSE NULL
				END
			)::"fiscal_inbound_situacao";
	END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_fiscal_inbound_documents_organizacao_provedor_doc"
	ON "ampmais_fiscal_inbound_documents" ("organizacao_id", "provedor_documento_id")
	WHERE "provedor_documento_id" IS NOT NULL;
