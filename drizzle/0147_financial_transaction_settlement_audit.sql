-- Auditoria da efetivação de transações financeiras: quem deu a transação como paga e por qual via.
--
-- `autor_id` é quem LANÇOU a transação. Até aqui nenhum caminho de efetivação gravava quem a
-- efetivou, e a baixa de fiado sobrescrevia `autor_id` com quem recebeu — apagando quem lançou.
--
--   efetivacao_autor_id  quem efetivou (null para integração sem operador, sistema e legado)
--   efetivacao_origem    IMEDIATA (nasceu paga) | MANUAL (usuário confirmou depois) |
--                        INTEGRACAO (provedor externo) | CONCILIACAO (extrato) | SISTEMA (rotina/script)
--
-- As efetivações anteriores ficam nulas: não há como saber quem as fez, e a tela mostra "—".
-- Exceção: a baixa de fiado (modificadores_metadata.origem = 'BAIXA_FIADO') sempre gravou quem
-- recebeu em `autor_id`, então autor e origem dela são conhecidos e entram no backfill.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0147_financial_transaction_settlement_audit.sql
-- Idempotente.
--
-- lock_timeout: a tabela é quente (PDV, terminal, conciliação). ADD COLUMN nulo sem default é só
-- metadado, mas pede lock exclusivo e, enquanto espera, enfileira toda escrita atrás dele.
-- Melhor falhar rápido e tentar de novo (incidente da 0146).
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'financial_transaction_settlement_origin') THEN
		CREATE TYPE "public"."financial_transaction_settlement_origin" AS ENUM ('IMEDIATA', 'MANUAL', 'INTEGRACAO', 'CONCILIACAO', 'SISTEMA');
	END IF;
END $$;

ALTER TABLE "ampmais_financial_transactions" ADD COLUMN IF NOT EXISTS "efetivacao_autor_id" varchar(255);
ALTER TABLE "ampmais_financial_transactions" ADD COLUMN IF NOT EXISTS "efetivacao_origem" "financial_transaction_settlement_origin";

-- NOT VALID evita varrer a tabela segurando o lock; a validação vem logo abaixo, com lock leve.
-- O Postgres trunca o nome a 63 caracteres (como nas demais FKs de nome longo da tabela).
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_financial_transactions_efetivacao_autor_id_ampmais_user') THEN
		ALTER TABLE "ampmais_financial_transactions"
			ADD CONSTRAINT "ampmais_financial_transactions_efetivacao_autor_id_ampmais_users_id_fk"
			FOREIGN KEY ("efetivacao_autor_id") REFERENCES "ampmais_users"("id") ON DELETE SET NULL NOT VALID;
	END IF;
END $$;

ALTER TABLE "ampmais_financial_transactions" VALIDATE CONSTRAINT "ampmais_financial_transactions_efetivacao_autor_id_ampmais_user";

-- Backfill da baixa de fiado: autor_id dessas linhas é quem recebeu (receive.ts até esta migração).
UPDATE "ampmais_financial_transactions"
SET "efetivacao_autor_id" = "autor_id", "efetivacao_origem" = 'MANUAL'
WHERE "modificadores_metadata"->>'origem' = 'BAIXA_FIADO'
	AND "data_efetivacao" IS NOT NULL
	AND "efetivacao_origem" IS NULL;
