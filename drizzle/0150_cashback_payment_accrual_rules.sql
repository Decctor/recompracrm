-- Regras de acúmulo de cashback por forma de pagamento (docs/cashback-payment-accrual-rules-design.md).
--
-- Jsonb validado por CashbackPaymentAccrualRulesSchema (schemas/cashback-programs.ts):
-- { "<PaymentMethodEnum>": { "pontua": boolean, "momento": "NA_VENDA" | "NA_QUITACAO" } }.
-- Null = programa sem regras: cada caminho de acúmulo segue o comportamento anterior. Sem backfill.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0150_cashback_payment_accrual_rules.sql
-- Idempotente. Coluna nullable sem default: só metadado, sem reescrever a tabela.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "ampmais_cashback_programs" ADD COLUMN IF NOT EXISTS "acumulo_regras_pagamento" jsonb;
