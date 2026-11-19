-- Destino contábil do item de compra e cancelamento de compra com estorno.
--
--   purchase_items.conta_contabil_id   conta que recebe o custo do item. Nulo = estoque (padrão de
--                                      compras da organização): só então o item movimenta saldo e lote.
--                                      Preenchida = manutenção, imobilizado, uso e consumo… sem estoque.
--   accounting_entries.compra_id       compra que originou um lançamento que não é o da própria compra
--                                      (hoje: o ESTORNO do cancelamento).
--   financial_transactions.data_cancelamento / cancelamento_motivo / cancelamento_autor_id
--                                      parcela pendente que deixou de ser devida. Cancelada, sai de contas
--                                      a pagar/receber, fluxo de caixa e conciliação.
--   purchases.data_cancelamento / cancelamento_motivo / cancelamento_autor_id
--                                      quando, por quem e por quê a compra foi cancelada.
--
-- Nenhum backfill: conta nula é o comportamento de antes (tudo no estoque), e nenhuma transação
-- existente fica cancelada.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0152_purchase_item_destination_and_cancellation.sql
-- Idempotente.
--
-- lock_timeout: financial_transactions e accounting_entries são quentes (PDV, terminal, conciliação).
-- ADD COLUMN nulo sem default é só metadado, mas pede lock exclusivo; melhor falhar rápido e repetir.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "ampmais_purchase_items" ADD COLUMN IF NOT EXISTS "conta_contabil_id" varchar(255);
ALTER TABLE "ampmais_accounting_entries" ADD COLUMN IF NOT EXISTS "compra_id" varchar(255);
ALTER TABLE "ampmais_financial_transactions" ADD COLUMN IF NOT EXISTS "data_cancelamento" timestamp;
ALTER TABLE "ampmais_financial_transactions" ADD COLUMN IF NOT EXISTS "cancelamento_motivo" text;
ALTER TABLE "ampmais_financial_transactions" ADD COLUMN IF NOT EXISTS "cancelamento_autor_id" varchar(255);
ALTER TABLE "ampmais_purchases" ADD COLUMN IF NOT EXISTS "data_cancelamento" timestamp;
ALTER TABLE "ampmais_purchases" ADD COLUMN IF NOT EXISTS "cancelamento_motivo" text;
ALTER TABLE "ampmais_purchases" ADD COLUMN IF NOT EXISTS "cancelamento_autor_id" varchar(255);

-- FKs NOT VALID: as colunas acabaram de nascer nulas, não há o que varrer; a validação vem em seguida.
-- O Postgres trunca nomes a 63 caracteres: as checagens e o VALIDATE usam o nome já truncado.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_purchase_items_conta_contabil_id_ampmais_accounts_chart') THEN
		ALTER TABLE "ampmais_purchase_items"
			ADD CONSTRAINT "ampmais_purchase_items_conta_contabil_id_ampmais_accounts_charts_id_fk"
			FOREIGN KEY ("conta_contabil_id") REFERENCES "ampmais_accounts_charts"("id") NOT VALID;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_accounting_entries_compra_id_ampmais_purchases_id_fk') THEN
		ALTER TABLE "ampmais_accounting_entries"
			ADD CONSTRAINT "ampmais_accounting_entries_compra_id_ampmais_purchases_id_fk"
			FOREIGN KEY ("compra_id") REFERENCES "ampmais_purchases"("id") ON DELETE SET NULL NOT VALID;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_financial_transactions_cancelamento_autor_id_ampmais_us') THEN
		ALTER TABLE "ampmais_financial_transactions"
			ADD CONSTRAINT "ampmais_financial_transactions_cancelamento_autor_id_ampmais_users_id_fk"
			FOREIGN KEY ("cancelamento_autor_id") REFERENCES "ampmais_users"("id") ON DELETE SET NULL NOT VALID;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_purchases_cancelamento_autor_id_ampmais_users_id_fk') THEN
		ALTER TABLE "ampmais_purchases"
			ADD CONSTRAINT "ampmais_purchases_cancelamento_autor_id_ampmais_users_id_fk"
			FOREIGN KEY ("cancelamento_autor_id") REFERENCES "ampmais_users"("id") ON DELETE SET NULL NOT VALID;
	END IF;
END $$;

ALTER TABLE "ampmais_purchase_items" VALIDATE CONSTRAINT "ampmais_purchase_items_conta_contabil_id_ampmais_accounts_chart";
ALTER TABLE "ampmais_accounting_entries" VALIDATE CONSTRAINT "ampmais_accounting_entries_compra_id_ampmais_purchases_id_fk";
ALTER TABLE "ampmais_financial_transactions" VALIDATE CONSTRAINT "ampmais_financial_transactions_cancelamento_autor_id_ampmais_us";
ALTER TABLE "ampmais_purchases" VALIDATE CONSTRAINT "ampmais_purchases_cancelamento_autor_id_ampmais_users_id_fk";

CREATE INDEX IF NOT EXISTS "idx_accounting_entries_compra_id" ON "ampmais_accounting_entries" USING btree ("compra_id");
