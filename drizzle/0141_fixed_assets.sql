-- Fase 7 da entrada fiscal de compras (ADR-0002, decisao 8): patrimonio.
-- Aplicar: npx tsx ./scripts/apply-sql-migration.ts drizzle/0141_fixed_assets.sql
-- DDL aditivo e idempotente. Aplicar ANTES do deploy.
--
--   fixed_assets                              bem do ativo imobilizado (unidade ou grupo fungivel)
--   accounting_entry_origin_type + PATRIMONIO lancamento mensal de depreciacao/CIAP e baixa de bem
--
-- Contas novas do plano padrao (1.6 Imobilizado, 1.7 Depreciacao Acumulada, 1.8 ICMS a Recuperar — CIAP,
-- 6.7 Despesas com Depreciacao) sao semeadas por organizacao em Configuracoes > Financeiro; organizacoes
-- existentes as criam no plano de contas e as apontam em Lancamentos padrao > Patrimonio.

ALTER TYPE "accounting_entry_origin_type" ADD VALUE IF NOT EXISTS 'PATRIMONIO';

DO $$ BEGIN
	CREATE TYPE "fixed_asset_status" AS ENUM ('EM_USO', 'EM_MANUTENCAO', 'BAIXADO');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ampmais_fixed_assets" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organizacao_id" varchar(255) NOT NULL REFERENCES "ampmais_organizations"("id") ON DELETE CASCADE,
	"produto_id" varchar(255) REFERENCES "ampmais_products"("id") ON DELETE SET NULL,
	"produto_variante_id" varchar(255) REFERENCES "ampmais_product_variants"("id") ON DELETE SET NULL,
	"compra_id" varchar(255) REFERENCES "ampmais_purchases"("id") ON DELETE SET NULL,
	"compra_item_id" varchar(255) REFERENCES "ampmais_purchase_items"("id") ON DELETE SET NULL,
	"codigo_patrimonio" varchar(60),
	"descricao" text NOT NULL,
	"numero_serie" varchar(120),
	"localizacao" varchar(255),
	"responsavel_id" varchar(255) REFERENCES "ampmais_users"("id") ON DELETE SET NULL,
	"status" "fixed_asset_status" DEFAULT 'EM_USO' NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"valor_aquisicao" numeric(14, 2) NOT NULL,
	"data_inicio_uso" timestamp NOT NULL,
	"vida_util_meses" integer NOT NULL,
	"valor_residual" numeric(14, 2) DEFAULT 0 NOT NULL,
	"depreciacao_acumulada_inicial" numeric(14, 2) DEFAULT 0 NOT NULL,
	"credito_icms_ciap" numeric(14, 2),
	"data_baixa" timestamp,
	"motivo_baixa" text,
	"valor_baixa" numeric(14, 2),
	"anotacoes" text,
	"autor_id" varchar(255) REFERENCES "ampmais_users"("id") ON DELETE SET NULL,
	"data_insercao" timestamp DEFAULT now() NOT NULL,
	"data_atualizacao" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_fixed_assets_organizacao_id" ON "ampmais_fixed_assets" ("organizacao_id");
CREATE INDEX IF NOT EXISTS "idx_fixed_assets_status" ON "ampmais_fixed_assets" ("organizacao_id", "status");
CREATE INDEX IF NOT EXISTS "idx_fixed_assets_compra_id" ON "ampmais_fixed_assets" ("compra_id");
CREATE INDEX IF NOT EXISTS "idx_fixed_assets_compra_item_id" ON "ampmais_fixed_assets" ("compra_item_id");
