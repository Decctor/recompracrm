-- Arquivamento de recompensas do programa de cashback. Uma recompensa já resgatada não pode ser
-- excluída: `ampmais_cashback_program_transactions.resgate_recompensa_id` aponta para ela sem
-- cascade, e o histórico do resgate precisa continuar resolvendo o prêmio. Excluir uma recompensa
-- resgatada a arquiva (data_arquivamento preenchida + ativo = false); nunca resgatada, é removida.
-- O índice parcial serve a contagem de resgates por recompensa da listagem e a checagem da exclusão.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0118_cashback_program_prizes_archive.sql
-- Idempotente (IF NOT EXISTS) — pode ser reexecutada após falha parcial.

ALTER TABLE "ampmais_cashback_program_prizes" ADD COLUMN IF NOT EXISTS "data_arquivamento" timestamp;

CREATE INDEX IF NOT EXISTS "idx_cashback_program_transactions_resgate_recompensa_id"
  ON "ampmais_cashback_program_transactions" ("resgate_recompensa_id")
  WHERE "resgate_recompensa_id" IS NOT NULL;
