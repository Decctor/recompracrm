-- Apply with scripts/apply-sql-migration.ts, following this repository's numbered SQL workflow.
-- Catálogo de anúncios da mídia paga (docs/dev-planning/meta-ads-paid-media-v2-plan.md).
DO $$ BEGIN
  CREATE TYPE "public"."media_ad_platform" AS ENUM('META');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."media_ad_media_type" AS ENUM('IMAGEM', 'VIDEO', 'CARROSSEL', 'DESCONHECIDO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ampmais_media_ads" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "organizacao_id" varchar(255) NOT NULL REFERENCES "ampmais_organizations"("id") ON DELETE cascade,
  "integracao_id" varchar(255) NOT NULL REFERENCES "ampmais_integrations"("id") ON DELETE cascade,
  "plataforma" "media_ad_platform" NOT NULL,
  "conta_externa_id" varchar(255) NOT NULL,
  "campanha_id" varchar(255),
  "campanha_nome" text,
  "campanha_objetivo" varchar(120),
  "campanha_status" varchar(60),
  "conjunto_id" varchar(255),
  "conjunto_nome" text,
  "conjunto_status" varchar(60),
  "anuncio_id" varchar(255) NOT NULL,
  "anuncio_nome" text NOT NULL,
  "status" varchar(60),
  "status_configurado" varchar(60),
  "criativo_id" varchar(255),
  "titulo" text,
  "corpo" text,
  "tipo_midia" "media_ad_media_type" DEFAULT 'DESCONHECIDO' NOT NULL,
  "cartoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "video_id" varchar(255),
  "cta" varchar(80),
  "url_destino" text,
  "permalink" text,
  "url_tags" text,
  "capa_url" text,
  "capa_origem_url" text,
  "capa_criativo_id" varchar(255),
  "nomes_anteriores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_na_plataforma_em" timestamp with time zone,
  "atualizado_na_plataforma_em" timestamp with time zone,
  "sincronizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "removido_em" timestamp with time zone,
  "data_insercao" timestamp DEFAULT now() NOT NULL,
  "data_atualizacao" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_media_ads_org_platform_ad_unique"
  ON "ampmais_media_ads" ("organizacao_id", "plataforma", "anuncio_id");
CREATE INDEX IF NOT EXISTS "idx_media_ads_integration_status"
  ON "ampmais_media_ads" ("integracao_id", "status");
CREATE INDEX IF NOT EXISTS "idx_media_ads_integration_campaign"
  ON "ampmais_media_ads" ("integracao_id", "campanha_id");
CREATE INDEX IF NOT EXISTS "idx_media_ads_integration_ad_name"
  ON "ampmais_media_ads" ("integracao_id", lower("anuncio_nome"));
