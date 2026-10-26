-- Regra de preço do grupo de adicionais (lib/products/add-on-pricing.ts). SOMA mantém o
-- comportamento histórico (cada opção soma o próprio preço); MAIOR cobra só a opção mais cara e
-- MEDIA a média das escolhidas — o modelo de mercado para pizza de mais de um sabor.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0138_add_on_pricing_rule.sql
-- Idempotente. TEM QUE IR ANTES DO DEPLOY: PDV, loja, comanda e validação de venda passam a ler
-- `regra_preco` dos grupos.

DO $$ BEGIN
	CREATE TYPE "public"."product_add_on_pricing_rule" AS ENUM('SOMA', 'MAIOR', 'MEDIA');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "ampmais_product_add_ons" ADD COLUMN IF NOT EXISTS "regra_preco" "product_add_on_pricing_rule" DEFAULT 'SOMA' NOT NULL;
