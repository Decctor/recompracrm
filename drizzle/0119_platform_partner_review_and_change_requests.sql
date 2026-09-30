-- Revisão de cadastro e alteração de dados do parceiro.
-- motivo_rejeicao: texto que o PARCEIRO lê na tela de cadastro não aprovado (observacoes_internas continua interno).
-- alteracao_solicitada + data_solicitacao_alteracao: pedido de troca de dados (chave PIX, contato,
-- documento) de um parceiro ativo, que o financeiro aprova ou recusa no admin. Um pedido por vez.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0119_platform_partner_review_and_change_requests.sql
-- Idempotente (IF NOT EXISTS).

ALTER TABLE "ampmais_platform_partners" ADD COLUMN IF NOT EXISTS "motivo_rejeicao" text;
ALTER TABLE "ampmais_platform_partners" ADD COLUMN IF NOT EXISTS "alteracao_solicitada" jsonb;
ALTER TABLE "ampmais_platform_partners" ADD COLUMN IF NOT EXISTS "data_solicitacao_alteracao" timestamp;
