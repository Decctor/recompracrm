-- Conta Stripe dona de cada customer/assinatura da plataforma.
--
-- As primeiras assinaturas nasceram na conta SYNCRONIZA (MEI). As novas vão para a conta
-- RECOMPRACRM (CNPJ). Nada migra entre contas: cada customer continua renovando onde nasceu, e
-- toda chamada à Stripe sobre ele usa o client da conta gravada aqui (services/stripe).
--
-- Backfill: todo customer existente hoje foi criado na SYNCRONIZA, a única conta usada até esta
-- migração. Sem customer, a coluna fica nula até o primeiro checkout.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0149_stripe_account.sql
-- Idempotente.
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stripe_account') THEN
		CREATE TYPE "public"."stripe_account" AS ENUM ('SYNCRONIZA', 'RECOMPRACRM');
	END IF;
END $$;

ALTER TABLE "ampmais_organizations" ADD COLUMN IF NOT EXISTS "stripe_conta" "stripe_account";
ALTER TABLE "ampmais_deals" ADD COLUMN IF NOT EXISTS "stripe_conta" "stripe_account";

UPDATE "ampmais_organizations" SET "stripe_conta" = 'SYNCRONIZA' WHERE "stripe_customer_id" IS NOT NULL AND "stripe_conta" IS NULL;
UPDATE "ampmais_deals" SET "stripe_conta" = 'SYNCRONIZA' WHERE "stripe_customer_id" IS NOT NULL AND "stripe_conta" IS NULL;
