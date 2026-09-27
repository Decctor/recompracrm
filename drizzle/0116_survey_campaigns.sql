-- Campanhas de pesquisa (docs/dev-planning/survey-campaigns-plan.md): gatilho PESQUISA e as
-- colunas de configuração. As respostas NÃO ganham tabela: vivem em
-- interactions.metadados.pesquisaRespostas (jsonb), ao lado do rastreio de entrega do envio.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0116_survey_campaigns.sql
-- (ou `npm run db:push`). Idempotente.

ALTER TYPE "campaign_trigger_type" ADD VALUE IF NOT EXISTS 'PESQUISA';

ALTER TABLE "ampmais_campaigns"
  ADD COLUMN IF NOT EXISTS "gatilho_pesquisa_data_referencia" text,
  ADD COLUMN IF NOT EXISTS "gatilho_pesquisa_campo_id" varchar(255);

DO $$ BEGIN
  ALTER TABLE "ampmais_campaigns"
    ADD CONSTRAINT "ampmais_campaigns_gatilho_pesquisa_campo_id_ampmais_custom_fields_id_fk"
    FOREIGN KEY ("gatilho_pesquisa_campo_id") REFERENCES "ampmais_custom_fields"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
