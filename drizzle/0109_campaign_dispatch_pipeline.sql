-- Pipeline de campanhas (docs/dev-planning/campaigns-interactions-redesign-plan.md, Fases 1-5):
-- ledger de quota por janela (send_counters), journal de disparos (campaign_dispatches +
-- campaign_dispatch_recipients), enums em vez de text+$type, índices faltantes e a limpeza de
-- `interactions` (que volta a ser só o registro do que foi enviado).
--
-- Este arquivo é DOCUMENTAÇÃO do schema aplicado via `npm run db:push` (convenção do repo) e a
-- fonte da verdade das partes que o push NÃO consegue expressar (NULLS NOT DISTINCT, backfill,
-- DELETE de dados). Aplicar em três passos, nesta ordem:
--
--   1. Seções A-D (DDL aditiva + reshape dos contadores). Pode ir por `db:push` (com a ressalva do
--      NULLS NOT DISTINCT abaixo) ou por `npx tsx scripts/apply-sql-migration.ts <este arquivo>`.
--   2. `npx tsx scripts/migrate-pending-interactions-to-dispatches.ts --apply`
--      (converte interações ainda não enviadas em disparos e apaga as BLOQUEADA — precisa das
--      colunas agendamento_* ainda existentes).
--   3. Seção E (drop das colunas de fila de `interactions`).
--
-- Requer PostgreSQL 15+ (UNIQUE NULLS NOT DISTINCT).

-- =====================================================================================
-- A. Enums
-- =====================================================================================
CREATE TYPE "campaign_dispatch_origin" AS ENUM ('AGENDADA', 'RECORRENTE', 'EVENTO');
CREATE TYPE "campaign_dispatch_status" AS ENUM ('PENDENTE', 'RESOLVENDO', 'ENFILEIRADA', 'ENVIANDO', 'CONCLUIDA', 'FALHOU', 'CANCELADA');
CREATE TYPE "campaign_dispatch_recipient_status" AS ENUM ('AGUARDANDO', 'RESERVADA', 'ENVIADA', 'FALHOU', 'PULADA');
CREATE TYPE "campaign_dispatch_skip_reason" AS ENUM (
	'QUOTA_ORG_DIARIO', 'QUOTA_ORG_SEMANAL', 'QUOTA_CAMPANHA_DIARIO', 'QUOTA_CAMPANHA_SEMANAL',
	'SEM_CONTATO', 'COMUNICACAO_PAUSADA', 'FREQUENCIA', 'CAMPANHA_INATIVA'
);
CREATE TYPE "send_counter_window" AS ENUM ('DIARIO', 'SEMANAL');
CREATE TYPE "interaction_delivery_status" AS ENUM ('PENDENTE', 'ENVIADO', 'ENTREGUE', 'LIDO', 'FALHOU');
CREATE TYPE "attribution_model" AS ENUM ('LAST_TOUCH', 'FIRST_TOUCH', 'LINEAR');

-- =====================================================================================
-- B. send_counters: reshape de weekly_send_counters (linhas existentes viram SEMANAL)
-- =====================================================================================
ALTER TABLE "ampmais_weekly_send_counters" RENAME TO "ampmais_send_counters";
ALTER TABLE "ampmais_send_counters" RENAME COLUMN "semana_chave" TO "periodo_chave";
ALTER TABLE "ampmais_send_counters" ADD COLUMN "tipo" "send_counter_window" NOT NULL DEFAULT 'SEMANAL';
ALTER TABLE "ampmais_send_counters" ALTER COLUMN "tipo" DROP DEFAULT;
ALTER TABLE "ampmais_send_counters" DROP CONSTRAINT IF EXISTS "uq_weekly_send_counters_org_campanha_semana";
-- ⚠️  NULLS NOT DISTINCT é a FONTE DA VERDADE. O schema Drizzle declara a constraint SEM o flag
-- (a introspecção do drizzle-kit 0.31.x hardcoda nullsNotDistinct=false e o flag gera drift
-- permanente que aborta todo db:push). Banco novo criado só por push precisa deste ALTER à mão,
-- senão o contador agregado (campanha_id NULL) duplica.
ALTER TABLE "ampmais_send_counters"
	ADD CONSTRAINT "uq_send_counters_org_campanha_tipo_periodo"
	UNIQUE NULLS NOT DISTINCT ("organizacao_id", "campanha_id", "tipo", "periodo_chave");
-- Nomes reais das FKs em produção (truncados a 63 chars pelo Postgres quando a 0041 foi aplicada).
ALTER TABLE "ampmais_send_counters" RENAME CONSTRAINT "ampmais_weekly_send_counters_organizacao_id_ampmais_organizatio" TO "ampmais_send_counters_organizacao_id_ampmais_organizations_id_fk";
ALTER TABLE "ampmais_send_counters" RENAME CONSTRAINT "ampmais_weekly_send_counters_campanha_id_ampmais_campaigns_id_f" TO "ampmais_send_counters_campanha_id_ampmais_campaigns_id_fk";
ALTER TABLE "ampmais_send_counters" RENAME CONSTRAINT "ampmais_weekly_send_counters_pkey" TO "ampmais_send_counters_pkey";

-- =====================================================================================
-- C. Journal de disparos
-- =====================================================================================
CREATE TABLE "ampmais_campaign_dispatches" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organizacao_id" varchar(255) NOT NULL REFERENCES "ampmais_organizations"("id") ON DELETE cascade,
	"campanha_id" varchar(255) NOT NULL REFERENCES "ampmais_campaigns"("id") ON DELETE cascade,
	"origem" "campaign_dispatch_origin" NOT NULL,
	"janela_referencia" text NOT NULL,
	"status" "campaign_dispatch_status" NOT NULL DEFAULT 'PENDENTE',
	"data_agendada" timestamp,
	"total_destinatarios" integer NOT NULL DEFAULT 0,
	"total_enviados" integer NOT NULL DEFAULT 0,
	"total_falhados" integer NOT NULL DEFAULT 0,
	"total_pulados" integer NOT NULL DEFAULT 0,
	"erro" text,
	"data_insercao" timestamp NOT NULL DEFAULT now(),
	"data_atualizacao" timestamp NOT NULL DEFAULT now(),
	"data_conclusao" timestamp,
	CONSTRAINT "uq_campaign_dispatches_campanha_janela" UNIQUE ("campanha_id", "janela_referencia")
);
CREATE INDEX "idx_campaign_dispatches_org_status" ON "ampmais_campaign_dispatches" ("organizacao_id", "status", "data_insercao");
CREATE INDEX "idx_campaign_dispatches_status_agendada" ON "ampmais_campaign_dispatches" ("status", "data_agendada");

CREATE TABLE "ampmais_campaign_dispatch_recipients" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"dispatch_id" varchar(255) NOT NULL REFERENCES "ampmais_campaign_dispatches"("id") ON DELETE cascade,
	"organizacao_id" varchar(255) NOT NULL REFERENCES "ampmais_organizations"("id") ON DELETE cascade,
	"campanha_id" varchar(255) NOT NULL REFERENCES "ampmais_campaigns"("id") ON DELETE cascade,
	"cliente_id" varchar(255) NOT NULL REFERENCES "ampmais_clients"("id") ON DELETE cascade,
	"status" "campaign_dispatch_recipient_status" NOT NULL DEFAULT 'AGUARDANDO',
	"motivo_pulo" "campaign_dispatch_skip_reason",
	"tentativas" integer NOT NULL DEFAULT 0,
	"erro" text,
	"interacao_id" varchar(255) REFERENCES "ampmais_interactions"("id") ON DELETE set null,
	"venda_id" varchar(255) REFERENCES "ampmais_sales"("id") ON DELETE set null,
	"chave_idempotencia" varchar(255) NOT NULL,
	"contexto" jsonb,
	"descricao" text,
	"data_insercao" timestamp NOT NULL DEFAULT now(),
	"data_reserva" timestamp,
	"data_envio" timestamp,
	CONSTRAINT "uq_campaign_dispatch_recipients_dispatch_cliente" UNIQUE ("dispatch_id", "cliente_id")
);
CREATE INDEX "idx_campaign_dispatch_recipients_dispatch_status" ON "ampmais_campaign_dispatch_recipients" ("dispatch_id", "status", "data_insercao");
CREATE INDEX "idx_campaign_dispatch_recipients_org_campanha_cliente" ON "ampmais_campaign_dispatch_recipients" ("organizacao_id", "campanha_id", "cliente_id", "data_insercao");
CREATE INDEX "idx_campaign_dispatch_recipients_org_status_data" ON "ampmais_campaign_dispatch_recipients" ("organizacao_id", "status", "data_insercao");

-- =====================================================================================
-- D. Enums em colunas text + índices faltantes
-- =====================================================================================
ALTER TABLE "ampmais_campaigns"
	ALTER COLUMN "atribuicao_modelo" DROP DEFAULT,
	ALTER COLUMN "atribuicao_modelo" TYPE "attribution_model" USING "atribuicao_modelo"::"attribution_model",
	ALTER COLUMN "atribuicao_modelo" SET DEFAULT 'LAST_TOUCH';
ALTER TABLE "ampmais_campaign_conversions"
	ALTER COLUMN "atribuicao_modelo" DROP DEFAULT,
	ALTER COLUMN "atribuicao_modelo" TYPE "attribution_model" USING "atribuicao_modelo"::"attribution_model",
	ALTER COLUMN "atribuicao_modelo" SET DEFAULT 'LAST_TOUCH';

CREATE INDEX "idx_campaign_conversions_org_campanha_data" ON "ampmais_campaign_conversions" ("organizacao_id", "campanha_id", "data_conversao");
CREATE INDEX "idx_interactions_org_campanha_status_data" ON "ampmais_interactions" ("organizacao_id", "campanha_id", "status_envio", "data_insercao");
CREATE INDEX "idx_interactions_campanha_cliente_data" ON "ampmais_interactions" ("campanha_id", "cliente_id", "data_insercao");
CREATE INDEX "idx_campaigns_titulo_search" ON "ampmais_campaigns" USING gin (to_tsvector('portuguese', "titulo"));
CREATE INDEX "idx_campaigns_org_ativo_gatilho" ON "ampmais_campaigns" ("organizacao_id", "ativo", "gatilho_tipo");
