-- Preço e disponibilidade das opções de adicional por canal de venda (irmã de
-- ampmais_product_channel_settings, que faz o mesmo para produto/variante). Linha esparsa: nulo =
-- herda o valor da opção. Um canal iFood é por loja, então o preço também pode variar por loja.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0117_add_on_option_channel_settings.sql
-- Idempotente (IF NOT EXISTS / DO-EXCEPTION) — pode ser reexecutada após falha parcial.

CREATE TABLE IF NOT EXISTS "ampmais_product_add_on_option_channel_settings" (
  "id" varchar(255) PRIMARY KEY NOT NULL, "organizacao_id" varchar(255) NOT NULL,
  "canal_venda_id" varchar(255) NOT NULL, "produto_add_on_opcao_id" varchar(255) NOT NULL,
  "preco_delta" double precision, "disponivel" boolean,
  "data_insercao" timestamp DEFAULT now() NOT NULL, "data_atualizacao" timestamp
);

DO $$ BEGIN
  ALTER TABLE "ampmais_product_add_on_option_channel_settings" ADD CONSTRAINT "ampmais_add_on_option_channel_settings_organizacao_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "public"."ampmais_organizations"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ampmais_product_add_on_option_channel_settings" ADD CONSTRAINT "ampmais_add_on_option_channel_settings_canal_venda_id_fk" FOREIGN KEY ("canal_venda_id") REFERENCES "public"."ampmais_sales_channels"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ampmais_product_add_on_option_channel_settings" ADD CONSTRAINT "ampmais_add_on_option_channel_settings_opcao_id_fk" FOREIGN KEY ("produto_add_on_opcao_id") REFERENCES "public"."ampmais_product_add_on_options"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sem colunas anuláveis na chave: um índice único comum basta (nada de NULLS NOT DISTINCT).
CREATE UNIQUE INDEX IF NOT EXISTS "unq_add_on_option_channel_settings_node" ON "ampmais_product_add_on_option_channel_settings" ("canal_venda_id", "produto_add_on_opcao_id");
CREATE INDEX IF NOT EXISTS "idx_add_on_option_channel_settings_org_opcao" ON "ampmais_product_add_on_option_channel_settings" ("organizacao_id", "produto_add_on_opcao_id");
