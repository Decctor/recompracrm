-- Reuse catalog_links for Phibo/Nuvemshop mappings. iFood rows and policies remain intact.
ALTER TYPE "catalog_link_provider" ADD VALUE IF NOT EXISTS 'NUVEM-SHOP';
ALTER TYPE "catalog_link_provider" ADD VALUE IF NOT EXISTS 'PHIBO';
ALTER TABLE "ampmais_catalog_links" ADD COLUMN IF NOT EXISTS "integracao_id" varchar(255) REFERENCES "ampmais_integrations"("id") ON DELETE RESTRICT;
ALTER TABLE "ampmais_catalog_links" ADD COLUMN IF NOT EXISTS "identidade_tipo" text;
ALTER TABLE "ampmais_catalog_links" ADD COLUMN IF NOT EXISTS "identidade_valor" text;
ALTER TABLE "ampmais_catalog_links" ADD COLUMN IF NOT EXISTS "protegido" boolean NOT NULL DEFAULT false;

-- Aliases have no iFood merchant. Give each key its own technical namespace so the
-- original index and old deployed iFood ON CONFLICT clauses remain compatible.
UPDATE ampmais_catalog_links
SET merchant_id = 'alias:' || md5(integracao_id || ':' || identidade_tipo || ':' || identidade_valor)
WHERE identidade_tipo IS NOT NULL;
DROP INDEX IF EXISTS "unq_catalog_links_identity";
CREATE UNIQUE INDEX "unq_catalog_links_identity" ON "ampmais_catalog_links"
  (organizacao_id, provider, merchant_id, tipo, produto_id, produto_variante_id, produto_add_on_id, produto_add_on_opcao_id) NULLS NOT DISTINCT
  WHERE tipo NOT IN ('ADD_ON', 'ADD_ON_OPCAO');
CREATE UNIQUE INDEX IF NOT EXISTS "unq_catalog_links_external_identity" ON "ampmais_catalog_links"
  (organizacao_id, integracao_id, identidade_tipo, identidade_valor);
DO $$ BEGIN
  ALTER TABLE ampmais_catalog_links ADD CONSTRAINT chk_catalog_links_external_identity CHECK (
    (identidade_tipo IS NULL AND identidade_valor IS NULL)
    OR (identidade_tipo IS NOT NULL AND identidade_tipo IN ('PRODUTO','VARIANTE','CODIGO','EAN','ESTOQUE') AND identidade_valor IS NOT NULL
      AND length(btrim(identidade_valor)) > 0 AND integracao_id IS NOT NULL
      AND num_nonnulls(produto_id, produto_variante_id) = 1
      AND produto_add_on_id IS NULL AND produto_add_on_opcao_id IS NULL
      AND ((tipo = 'PRODUTO' AND produto_id IS NOT NULL) OR (tipo = 'VARIANTE' AND produto_variante_id IS NOT NULL)))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION ampmais_check_catalog_external_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.identidade_tipo IS NOT NULL AND OLD.protegido THEN
      RAISE EXCEPTION 'Vínculo protegido: migre a identidade externa antes de excluir o cadastro.';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.identidade_tipo IS NOT NULL AND (
    NOT EXISTS (SELECT 1 FROM ampmais_integrations WHERE id = NEW.integracao_id AND organizacao_id = NEW.organizacao_id AND tipo::text = NEW.provider::text)
    OR (NEW.produto_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ampmais_products WHERE id = NEW.produto_id AND organizacao_id = NEW.organizacao_id))
    OR (NEW.produto_variante_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM ampmais_product_variants v JOIN ampmais_products p ON p.id = v.produto_id
      WHERE v.id = NEW.produto_variante_id AND v.organizacao_id = NEW.organizacao_id AND p.organizacao_id = NEW.organizacao_id
    ))
  ) THEN RAISE EXCEPTION 'Identidade externa aponta para outra organização, origem ou destino inexistente.'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_catalog_external_identity ON ampmais_catalog_links;
CREATE TRIGGER check_catalog_external_identity BEFORE INSERT OR UPDATE OR DELETE ON ampmais_catalog_links
FOR EACH ROW EXECUTE FUNCTION ampmais_check_catalog_external_identity();

-- Cleanup of the empty provisional table created during this task; never discard mappings.
DO $$ BEGIN
  IF to_regclass('ampmais_product_external_identities') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM ampmais_product_external_identities) THEN
      RAISE EXCEPTION 'Tabela provisória não está vazia; migre seus vínculos antes de removê-la.';
    END IF;
    DROP TABLE ampmais_product_external_identities;
  END IF;
END $$;
DROP FUNCTION IF EXISTS ampmais_check_product_external_identity();
