-- Comandas fixas (cartao fisico reutilizavel com QR proprio). Ver docs/tabs/service-cards.md.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0128_service_cards.sql
-- Idempotente — pode ser reexecutada apos falha parcial. Puramente aditiva.

CREATE TABLE IF NOT EXISTS "ampmais_service_cards" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organizacao_id" varchar(255) NOT NULL,
	"codigo" text NOT NULL,
	"codigo_normalizado" text NOT NULL,
	"token_publico" varchar(64) NOT NULL,
	"token_publico_hash" varchar(64) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"metadados" jsonb,
	"data_insercao" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ampmais_service_cards_organizacao_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "ampmais_organizations"("id") ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_service_cards_org_codigo" ON "ampmais_service_cards" ("organizacao_id", "codigo_normalizado");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_service_cards_token_publico_hash" ON "ampmais_service_cards" ("token_publico_hash");
CREATE INDEX IF NOT EXISTS "idx_service_cards_org_ativo" ON "ampmais_service_cards" ("organizacao_id", "ativo");

ALTER TABLE "ampmais_tabs" ADD COLUMN IF NOT EXISTS "service_card_id" varchar(255);

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_tabs_service_card_id_fk') THEN
		ALTER TABLE "ampmais_tabs"
			ADD CONSTRAINT "ampmais_tabs_service_card_id_fk" FOREIGN KEY ("service_card_id") REFERENCES "ampmais_service_cards"("id") ON DELETE set null;
	END IF;
END $$;

-- Um cartao hospeda no maximo uma conta aberta.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tabs_org_service_card_aberta" ON "ampmais_tabs" ("organizacao_id", "service_card_id")
	WHERE status = 'ABERTA' AND service_card_id IS NOT NULL;
