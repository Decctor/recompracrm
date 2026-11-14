-- Recompensa avulsa no ponto de interação (docs/cashback-free-form-reward-design.md).
--
-- Para organizações cujos prêmios variam demais para manter cadastrados: o operador descreve o que
-- o cliente leva e quantos pontos debitar, sem item de catálogo. O resgate vive só no ledger —
-- nenhuma venda é criada — e a descrição fica na própria transação de RESGATE, porque não há
-- `resgate_recompensa_id` para buscar o título.
--
-- `modalidade_recompensa_avulsa_permitida` é sub-modalidade da troca por recompensas: só vale com
-- `modalidade_recompensas_permitida` ligada. Default false: nenhum programa existente muda.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0151_cashback_free_form_reward.sql
-- Idempotente (IF NOT EXISTS). Coluna boolean com default constante e coluna text nullable: só
-- metadado, sem reescrever as tabelas.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "ampmais_cashback_programs"
	ADD COLUMN IF NOT EXISTS "modalidade_recompensa_avulsa_permitida" boolean DEFAULT false NOT NULL;

ALTER TABLE "ampmais_cashback_program_transactions"
	ADD COLUMN IF NOT EXISTS "resgate_recompensa_descricao" text;
