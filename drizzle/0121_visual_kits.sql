-- Comunicação visual: kits de peças (etiquetas, encarte, posts, stories…) gerados dos mesmos
-- produtos, preços e validade. Formatos vivem no código (lib/visual-kits/formats.ts); aqui só a chave.
-- Itens referenciam produto + variante (opcional); a unicidade (kit, produto, variante) usa
-- NULLS NOT DISTINCT, que o drizzle-orm não expressa — por isso só existe nesta migração.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0121_visual_kits.sql
-- Idempotente — pode ser reexecutada após falha parcial.

DO $$ BEGIN
	CREATE TYPE "visual_kit_status" AS ENUM ('RASCUNHO', 'GERADO');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE "visual_kit_format" AS ENUM (
		'ETIQUETA_GONDOLA', 'ADESIVO_PRECO', 'WOBBLER', 'ENCARTE', 'SELO_PRODUTO', 'POST_FEED', 'STORY', 'CARROSSEL', 'LISTA_WHATSAPP'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
	CREATE TYPE "visual_kit_output" AS ENUM ('PDF', 'PDF_ETIQUETADORA', 'PNG', 'JPG');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ampmais_visual_kits" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organizacao_id" varchar(255) NOT NULL REFERENCES "ampmais_organizations"("id") ON DELETE CASCADE,
	"nome" text NOT NULL,
	"chamada" text NOT NULL,
	"validade_fim" timestamp,
	"canal_venda_id" varchar(255) REFERENCES "ampmais_sales_channels"("id") ON DELETE SET NULL,
	"configuracao" jsonb NOT NULL,
	"status" "visual_kit_status" DEFAULT 'RASCUNHO' NOT NULL,
	"data_ultima_geracao" timestamp,
	"autor_id" varchar(255) NOT NULL REFERENCES "ampmais_users"("id"),
	"data_insercao" timestamp DEFAULT now() NOT NULL,
	"data_atualizacao" timestamp
);
CREATE INDEX IF NOT EXISTS "idx_visual_kits_organizacao" ON "ampmais_visual_kits" ("organizacao_id");

CREATE TABLE IF NOT EXISTS "ampmais_visual_kit_pieces" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organizacao_id" varchar(255) NOT NULL REFERENCES "ampmais_organizations"("id") ON DELETE CASCADE,
	"kit_id" varchar(255) NOT NULL REFERENCES "ampmais_visual_kits"("id") ON DELETE CASCADE,
	"formato" "visual_kit_format" NOT NULL,
	"modelo" text DEFAULT 'PADRAO' NOT NULL,
	"saida" "visual_kit_output" NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"configuracao" jsonb,
	"data_geracao" timestamp,
	"data_insercao" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_visual_kit_pieces_kit_formato" ON "ampmais_visual_kit_pieces" ("kit_id", "formato");

CREATE TABLE IF NOT EXISTS "ampmais_visual_kit_items" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organizacao_id" varchar(255) NOT NULL REFERENCES "ampmais_organizations"("id") ON DELETE CASCADE,
	"kit_id" varchar(255) NOT NULL REFERENCES "ampmais_visual_kits"("id") ON DELETE CASCADE,
	"produto_id" varchar(255) NOT NULL REFERENCES "ampmais_products"("id") ON DELETE CASCADE,
	"produto_variante_id" varchar(255) REFERENCES "ampmais_product_variants"("id") ON DELETE CASCADE,
	"ordem" integer DEFAULT 0 NOT NULL,
	"preco_gerado" double precision,
	"preco_de_gerado" double precision,
	"data_insercao" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_visual_kit_items_kit" ON "ampmais_visual_kit_items" ("kit_id");
CREATE INDEX IF NOT EXISTS "idx_visual_kit_items_produto" ON "ampmais_visual_kit_items" ("produto_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_visual_kit_items_kit_produto_variante"
	ON "ampmais_visual_kit_items" ("kit_id", "produto_id", "produto_variante_id") NULLS NOT DISTINCT;
