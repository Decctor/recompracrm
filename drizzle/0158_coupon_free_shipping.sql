-- Cupom de frete grátis: novo tipo de benefício FRETE_GRATIS.
--
-- O cupom isenta a taxa de entrega da venda (a venda nasce sem a taxa, como no "grátis acima de"
-- da loja); o valor isentado fica no resgate (coupon_redemptions.valor_desconto). Nenhuma coluna
-- nova: o tipo dispensa `beneficio_valor` e força a modalidade ENTREGA na criação.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0158_coupon_free_shipping.sql
-- Idempotente. O valor novo não é usado nesta mesma transação (exigência do Postgres).
SET LOCAL lock_timeout = '5s';

ALTER TYPE "coupon_benefit_type" ADD VALUE IF NOT EXISTS 'FRETE_GRATIS';
