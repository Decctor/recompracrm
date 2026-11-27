-- Database objects that live OUTSIDE the Drizzle schema.
--
-- The local database is built from `services/drizzle/schema/` (the schema of record), because the
-- numbered files in `drizzle/` cannot be replayed. Extensions, functions and triggers are not part
-- of that schema, so they are recreated from this file. Each object names the migration that holds
-- its latest definition; when a migration changes one, copy the new definition here.
--
-- `npm run test:local-dev` fails when a migration introduces a function, trigger,
-- extension, view or policy this file does not know about.
--
-- Two sections, split by the `@section` markers: the first runs before the tables exist (indexes
-- depend on it), the second after.

-- @section before-schema

-- drizzle/0033_unaccent_extension.sql
CREATE EXTENSION IF NOT EXISTS unaccent;

-- drizzle/0048_purchase_import_matching_and_de_para.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- drizzle/0048_purchase_import_matching_and_de_para.sql
-- `unaccent` is STABLE, so it cannot back an index. The IMMUTABLE wrapper is what
-- `idx_clients_nome`, `idx_products_nome` and lib/search.ts use.
CREATE FUNCTION unaccent_immutable(text) RETURNS text
	LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
	AS $func$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $func$;

-- @section after-schema

-- drizzle/0105_coupon_purchase_history_lock.sql
CREATE OR REPLACE FUNCTION ampmais_lock_confirmed_purchase_history()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  chave text;
BEGIN
  IF NEW.status_venda = 'CONFIRMADA' AND NEW.cliente_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR OLD.status_venda IS DISTINCT FROM NEW.status_venda
      OR OLD.cliente_id IS DISTINCT FROM NEW.cliente_id
      OR OLD.organizacao_id IS DISTINCT FROM NEW.organizacao_id THEN
      chave := NEW.organizacao_id || ':' || NEW.cliente_id || ':primeira-compra';
      IF NOT pg_try_advisory_xact_lock(hashtextextended(chave, 0)) THEN
        RAISE EXCEPTION 'Outra compra deste cliente está sendo processada. Tente novamente.' USING ERRCODE = '40001';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ampmais_sales_purchase_history_lock
BEFORE INSERT OR UPDATE OF status_venda, cliente_id, organizacao_id ON ampmais_sales
FOR EACH ROW EXECUTE FUNCTION ampmais_lock_confirmed_purchase_history();

-- drizzle/0140_catalog_external_identities.sql
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

CREATE TRIGGER check_catalog_external_identity BEFORE INSERT OR UPDATE OR DELETE ON ampmais_catalog_links
FOR EACH ROW EXECUTE FUNCTION ampmais_check_catalog_external_identity();

-- drizzle/0146_sale_item_modifier_product_snapshot.sql
CREATE OR REPLACE FUNCTION ampmais_snapshot_sale_item_modifier_product()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW.produto_id IS NULL AND NEW.opcao_id IS NOT NULL THEN
		SELECT
			coalesce(v.produto_id, o.produto_id),
			o.product_variant_id,
			o.quantidade_consumo,
			coalesce(v.preco_custo, p.preco_custo)
		INTO NEW.produto_id, NEW.produto_variante_id, NEW.quantidade_consumo, NEW.valor_custo_unitario
		FROM ampmais_product_add_on_options o
		LEFT JOIN ampmais_product_variants v ON v.id = o.product_variant_id
		LEFT JOIN ampmais_products p ON p.id = coalesce(v.produto_id, o.produto_id)
		WHERE o.id = NEW.opcao_id;

		IF NEW.produto_id IS NULL THEN
			NEW.produto_variante_id := NULL;
			NEW.quantidade_consumo := NULL;
			NEW.valor_custo_unitario := NULL;
		END IF;
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER ampmais_sale_item_modifiers_product_snapshot
BEFORE INSERT ON "ampmais_sale_item_modifiers"
FOR EACH ROW EXECUTE FUNCTION ampmais_snapshot_sale_item_modifier_product();
