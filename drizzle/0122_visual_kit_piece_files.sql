-- Arquivos gerados das peças de comunicação visual. Os bytes são gerados no navegador e enviados
-- direto ao armazenamento (upload DIRETO, propósito ARQUIVO_KIT_VISUAL em lib/files/intake.ts);
-- esta tabela liga cada peça aos arquivos do catálogo (`ampmais_files`) da última geração.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0122_visual_kit_piece_files.sql
-- Idempotente — pode ser reexecutada após falha parcial.

CREATE TABLE IF NOT EXISTS "ampmais_visual_kit_piece_files" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organizacao_id" varchar(255) NOT NULL REFERENCES "ampmais_organizations"("id") ON DELETE CASCADE,
	"peca_id" varchar(255) NOT NULL REFERENCES "ampmais_visual_kit_pieces"("id") ON DELETE CASCADE,
	"arquivo_id" varchar(255) NOT NULL REFERENCES "ampmais_files"("id") ON DELETE CASCADE,
	"nome" text NOT NULL,
	"produto_id" varchar(255) REFERENCES "ampmais_products"("id") ON DELETE SET NULL,
	"produto_variante_id" varchar(255) REFERENCES "ampmais_product_variants"("id") ON DELETE SET NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"data_insercao" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_visual_kit_piece_files_peca" ON "ampmais_visual_kit_piece_files" ("peca_id");
