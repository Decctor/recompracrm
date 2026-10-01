-- Campos do novo onboarding e do painel do parceiro (programa de indicações).
-- tipo_pessoa e chave_pix_tipo guiam as etapas do cadastro; data_confirmacao_titular_pix registra a
-- autodeclaração de titularidade da chave PIX (não há consulta ao DICT); mensagem_divulgacao guarda a
-- mensagem editada do kit de divulgação; data_cartao_visualizado faz o "cartão emitido" rodar uma vez só.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0118_platform_partner_onboarding_fields.sql
-- Idempotente (IF NOT EXISTS / DO-EXCEPTION) — pode ser reexecutada após falha parcial.

DO $$ BEGIN
  CREATE TYPE "public"."platform_partner_person_type" AS ENUM('PESSOA_FISICA', 'PESSOA_JURIDICA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."platform_partner_pix_key_type" AS ENUM('CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "ampmais_platform_partners" ADD COLUMN IF NOT EXISTS "tipo_pessoa" "platform_partner_person_type";
ALTER TABLE "ampmais_platform_partners" ADD COLUMN IF NOT EXISTS "chave_pix_tipo" "platform_partner_pix_key_type";
ALTER TABLE "ampmais_platform_partners" ADD COLUMN IF NOT EXISTS "data_confirmacao_titular_pix" timestamp;
ALTER TABLE "ampmais_platform_partners" ADD COLUMN IF NOT EXISTS "mensagem_divulgacao" text;
ALTER TABLE "ampmais_platform_partners" ADD COLUMN IF NOT EXISTS "data_cartao_visualizado" timestamp;

-- Parceiros existentes: o tipo de pessoa sai do tamanho do documento (11 dígitos = CPF, 14 = CNPJ).
-- A chave PIX fica sem tipo — o painel mostra a chave sem o selo.
UPDATE "ampmais_platform_partners"
SET "tipo_pessoa" = CASE length(regexp_replace("cpf_cnpj", '\D', '', 'g'))
  WHEN 11 THEN 'PESSOA_FISICA'::"platform_partner_person_type"
  WHEN 14 THEN 'PESSOA_JURIDICA'::"platform_partner_person_type"
END
WHERE "tipo_pessoa" IS NULL;

-- Parceiros já aprovados não precisam ver a animação do cartão emitido.
UPDATE "ampmais_platform_partners"
SET "data_cartao_visualizado" = COALESCE("data_aprovacao", now())
WHERE "status" = 'ATIVO' AND "data_cartao_visualizado" IS NULL;
