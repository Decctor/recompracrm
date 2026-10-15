-- Estacoes de preparo (roteamento do TICKET_PREPARO por impressora). Ver docs/dev-planning/preparation-stations-plan.md.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0129_preparation_stations.sql
-- Idempotente — pode ser reexecutada apos falha parcial. Puramente aditiva.

CREATE TABLE IF NOT EXISTS "ampmais_preparation_stations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organizacao_id" varchar(255) NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"escopo_ticket" varchar(30) DEFAULT 'PEDIDO' NOT NULL,
	"data_insercao" timestamp DEFAULT now() NOT NULL,
	"data_atualizacao" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ampmais_preparation_stations_organizacao_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "ampmais_organizations"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "idx_preparation_stations_organizacao_id" ON "ampmais_preparation_stations" ("organizacao_id");

-- O sujeito da regra e sempre o item; canal/modalidade/horario pertencem a estacao, nao a regra.
-- Sem FK em valor->produtoId e sem unicidade: ver o plano.
CREATE TABLE IF NOT EXISTS "ampmais_preparation_station_rules" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organizacao_id" varchar(255) NOT NULL,
	"estacao_id" varchar(255) NOT NULL,
	"criterio" varchar(30) NOT NULL,
	"valor" jsonb NOT NULL,
	"data_insercao" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ampmais_preparation_station_rules_organizacao_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "ampmais_organizations"("id") ON DELETE cascade,
	CONSTRAINT "ampmais_preparation_station_rules_estacao_id_fk" FOREIGN KEY ("estacao_id") REFERENCES "ampmais_preparation_stations"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "idx_preparation_station_rules_organizacao_id" ON "ampmais_preparation_station_rules" ("organizacao_id");
CREATE INDEX IF NOT EXISTS "idx_preparation_station_rules_org_estacao" ON "ampmais_preparation_station_rules" ("organizacao_id", "estacao_id");
CREATE INDEX IF NOT EXISTS "idx_preparation_station_rules_org_criterio" ON "ampmais_preparation_station_rules" ("organizacao_id", "criterio");

-- Impressora: quais estacoes atende. Vazio atende SO jobs sem estacao (mesmo contrato de finalidades).
ALTER TABLE "ampmais_agent_printers" ADD COLUMN IF NOT EXISTS "estacoes_preparo" jsonb DEFAULT '[]'::jsonb NOT NULL;

-- Job: estacao do ticket (null = job sem estacao).
ALTER TABLE "ampmais_print_jobs" ADD COLUMN IF NOT EXISTS "estacao_preparo_id" varchar(255);

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_print_jobs_estacao_preparo_id_fk') THEN
		ALTER TABLE "ampmais_print_jobs"
			ADD CONSTRAINT "ampmais_print_jobs_estacao_preparo_id_fk" FOREIGN KEY ("estacao_preparo_id") REFERENCES "ampmais_preparation_stations"("id") ON DELETE set null;
	END IF;
END $$;
