-- Apply with scripts/apply-sql-migration.ts, following this repository's numbered SQL workflow.
ALTER TABLE "ampmais_financial_transactions"
  ADD COLUMN IF NOT EXISTS "grupo_pagamento_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "condicoes_recebimento" jsonb;
CREATE INDEX IF NOT EXISTS "idx_financial_transactions_org_grupo_pagamento"
  ON "ampmais_financial_transactions" ("organizacao_id", "grupo_pagamento_id");

-- Preserve legacy manual credit installments. Integrated terminals resolve to a single
-- transaction server-side. Other methods always use a single transaction in this phase.
-- Existing explicit configuration is never overwritten; historical transactions are untouched.
UPDATE "ampmais_financial_accounts"
SET "configuracao" = jsonb_set("configuracao", '{recebimentos}', jsonb_build_object(
  'metodos', (
    SELECT jsonb_agg(jsonb_build_object(
      'metodo', metodo,
      'comportamentoParcelas', CASE WHEN metodo = 'CARTAO_CREDITO'
        THEN 'TRANSACOES_PARCELADAS' ELSE 'TRANSACAO_UNICA' END
    )) FROM unnest(ARRAY['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO',
      'BOLETO', 'TRANSFERENCIA', 'CASHBACK', 'VALE', 'A_DEFINIR', 'FIADO_NOTA', 'OUTRO']) AS metodo
  )
))
WHERE NOT ("configuracao" ? 'recebimentos');
