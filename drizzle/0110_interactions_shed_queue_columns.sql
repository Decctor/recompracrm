-- Passo 3 do cutover do pipeline de campanhas (ver drizzle/0109_campaign_dispatch_pipeline.sql).
-- Rodar SÓ depois de `npm run migrate:pending-interactions-to-dispatches -- --apply`: o cast de
-- status_envio falha (de propósito) enquanto existirem linhas BLOQUEADA, e as colunas de fila só
-- podem cair depois que as pendências viraram disparos.
--
-- Este arquivo é DOCUMENTAÇÃO do schema aplicado via `npm run db:push` (convenção do repo);
-- `npx tsx scripts/apply-sql-migration.ts drizzle/0110_interactions_shed_queue_columns.sql`.

-- interactions.status_envio vira enum: BLOQUEADA deixa de existir (bloqueios vivem em
-- campaign_dispatch_recipients); FALHOU permanece para falhas reportadas pelo provedor após o envio.
ALTER TABLE "ampmais_interactions"
	ALTER COLUMN "status_envio" TYPE "interaction_delivery_status" USING "status_envio"::"interaction_delivery_status";

-- interactions deixa de ser fila: a agenda vive em campaign_dispatches.data_agendada.
DROP INDEX IF EXISTS "idx_interactions_pending_processing";
ALTER TABLE "ampmais_interactions" DROP COLUMN "agendamento_data_referencia";
ALTER TABLE "ampmais_interactions" DROP COLUMN "agendamento_bloco_referencia";
