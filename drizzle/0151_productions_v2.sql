-- Produções v2 (docs/productions-v2-plan.md).
--
--   production_recipes.imagem_capa_url  foto da receita
--   production_recipes.capa_icone       ícone da capa desenhada (lib/productions/recipe-cover.ts)
--   production_recipes.capa_cor         matiz 0–359 da capa desenhada
--   production_inputs.reincorporado     linha de saldo da própria saída que volta como insumo
--   production_inputs.lote_id           lote de onde o insumo é baixado na conclusão (antes do FEFO)
--
-- Receitas antigas ficam sem capa (a tela deriva ícone e matiz do id). Insumos antigos ficam
-- reincorporado = false e sem lote. Sem backfill.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0151_productions_v2.sql
-- Idempotente. Precisa ir ANTES do deploy: as consultas de produção já selecionam estas colunas.
--
-- Colunas nulas, ou com default constante: só metadado, sem reescrever as tabelas.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "ampmais_production_recipes" ADD COLUMN IF NOT EXISTS "imagem_capa_url" text;
ALTER TABLE "ampmais_production_recipes" ADD COLUMN IF NOT EXISTS "capa_icone" text;
ALTER TABLE "ampmais_production_recipes" ADD COLUMN IF NOT EXISTS "capa_cor" integer;

ALTER TABLE "ampmais_production_inputs" ADD COLUMN IF NOT EXISTS "reincorporado" boolean DEFAULT false NOT NULL;
ALTER TABLE "ampmais_production_inputs" ADD COLUMN IF NOT EXISTS "lote_id" varchar(255);

-- O Postgres trunca o nome a 63 caracteres.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_production_inputs_lote_id_ampmais_product_stock_lots_id') THEN
		ALTER TABLE "ampmais_production_inputs"
			ADD CONSTRAINT "ampmais_production_inputs_lote_id_ampmais_product_stock_lots_id_fk"
			FOREIGN KEY ("lote_id") REFERENCES "ampmais_product_stock_lots"("id") ON DELETE SET NULL NOT VALID;
	END IF;
END $$;

ALTER TABLE "ampmais_production_inputs" VALIDATE CONSTRAINT "ampmais_production_inputs_lote_id_ampmais_product_stock_lots_id";

CREATE INDEX IF NOT EXISTS "idx_production_inputs_lote" ON "ampmais_production_inputs" USING btree ("lote_id");
