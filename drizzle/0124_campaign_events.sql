CREATE TYPE "public"."campaign_event_status" AS ENUM ('PENDENTE', 'PROCESSADA', 'DESCARTADA');
CREATE TABLE "ampmais_campaign_events" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "organizacao_id" varchar(255) NOT NULL REFERENCES "ampmais_organizations"("id") ON DELETE CASCADE,
  "fonte_tipo" text NOT NULL,
  "fonte_id" varchar(255) NOT NULL,
  "cliente_id" varchar(255) REFERENCES "ampmais_clients"("id") ON DELETE CASCADE,
  "publicacao_permitida" boolean DEFAULT true NOT NULL,
  "sequencia" bigserial NOT NULL,
  "tipo" text NOT NULL,
  "versao" integer NOT NULL,
  "chave_idempotencia" text NOT NULL,
  "status" "campaign_event_status" DEFAULT 'PENDENTE' NOT NULL,
  "contexto" jsonb NOT NULL,
  "data_evento" timestamp NOT NULL,
  "data_insercao" timestamp DEFAULT now() NOT NULL,
  "data_processamento" timestamp,
  "proxima_tentativa" timestamp DEFAULT now() NOT NULL,
  "tentativas" integer DEFAULT 0 NOT NULL,
  "erro" text
);
CREATE UNIQUE INDEX "idx_campaign_events_key" ON "ampmais_campaign_events" ("organizacao_id", "tipo", "chave_idempotencia");
CREATE INDEX "idx_campaign_events_pending" ON "ampmais_campaign_events" ("status", "proxima_tentativa");
CREATE INDEX "idx_campaign_events_source" ON "ampmais_campaign_events" ("organizacao_id", "fonte_tipo", "fonte_id");
CREATE INDEX "idx_campaign_events_client" ON "ampmais_campaign_events" ("cliente_id");
CREATE INDEX "idx_campaign_events_order" ON "ampmais_campaign_events" ("organizacao_id", "cliente_id", "status", "sequencia");
ALTER TYPE "public"."campaign_dispatch_skip_reason" ADD VALUE IF NOT EXISTS 'VENDA_INVALIDA';
ALTER TYPE "public"."campaign_dispatch_skip_reason" ADD VALUE IF NOT EXISTS 'EVENTO_EXPIRADO';
ALTER TABLE "ampmais_campaign_dispatch_recipients" ADD COLUMN "campanha_evento_id" varchar(255) REFERENCES "ampmais_campaign_events"("id") ON DELETE CASCADE;
CREATE INDEX "idx_campaign_dispatch_recipients_campanha_evento_id" ON "ampmais_campaign_dispatch_recipients" ("campanha_evento_id");
ALTER TYPE "public"."campaign_dispatch_skip_reason" ADD VALUE IF NOT EXISTS 'EVENTO_INVALIDO';
ALTER TABLE "ampmais_campaign_dispatches" ADD COLUMN "campanha_evento_id" varchar(255) REFERENCES "ampmais_campaign_events"("id") ON DELETE CASCADE;
CREATE INDEX "idx_campaign_dispatches_event" ON "ampmais_campaign_dispatches" ("campanha_evento_id");
