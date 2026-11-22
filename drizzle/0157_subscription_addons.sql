-- Modelo de preços por plano-base + adicionais (docs/dev-planning/pricing-model-redesign-plan.md).
--
-- organizations.assinatura_adicionais: adicionais contratados sobre o plano-base (hoje
--   HUB_ATENDIMENTOS e CONSULTORIA). Espelho dos itens da assinatura no Stripe, gravado pelo
--   webhook. Nasce vazio para todo mundo: quem tem um tier antigo continua descrito só por
--   `assinatura_plano` e pelos recursos já gravados em `configuracao`.
-- deals.adicionais: adicionais incluídos no valor negociado do deal.
-- platform_partner_commissions.valor_adicionais_centavos / percentual_comissao_adicionais_bps:
--   parcela do invoice referente a adicionais comissionáveis e a taxa fixa aplicada a ela. Zero
--   em toda comissão anterior — nenhuma delas tinha adicional comissionável.
--
-- Sem backfill: as colunas só passam a ser preenchidas por assinaturas novas.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0157_subscription_addons.sql
-- Idempotente.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "ampmais_organizations" ADD COLUMN IF NOT EXISTS "assinatura_adicionais" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "ampmais_deals" ADD COLUMN IF NOT EXISTS "adicionais" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "ampmais_platform_partner_commissions" ADD COLUMN IF NOT EXISTS "valor_adicionais_centavos" integer DEFAULT 0 NOT NULL;
ALTER TABLE "ampmais_platform_partner_commissions" ADD COLUMN IF NOT EXISTS "percentual_comissao_adicionais_bps" integer DEFAULT 0 NOT NULL;
