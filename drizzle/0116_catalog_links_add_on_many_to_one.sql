-- Complementos muitos-para-um (sobre a fase 5 / 0115). O iFood pode ter N cópias do mesmo grupo
-- interno: catálogos montados com um grupo por item ("Escolha seu gelato:" existe uma vez por item,
-- cada cópia com ids de grupo e de opção próprios). Então UM grupo interno ↔ N optionGroups e UMA
-- opção interna ↔ N options. Para ADD_ON / ADD_ON_OPCAO a identidade passa a ser o registro remoto
-- (um optionGroup / uma option pertence a no máximo um vínculo ativo por loja); produto, variante e
-- categoria seguem únicos pelo nó interno.
--
-- Corrige também o índice de grupo da 0115: ele valia para QUALQUER tipo, mas o vínculo de opção
-- carrega o `externo_option_group_id` do grupo em que está — a segunda linha do mesmo optionGroup
-- (o próprio vínculo ADD_ON + as opções) violava o índice. Agora vale só para vínculos ADD_ON.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0116_catalog_links_add_on_many_to_one.sql
-- Idempotente. O apply roda num único BEGIN: nenhum índice fica ausente entre o DROP e o CREATE.
-- Os predicados são os MESMOS de CATALOG_LINK_*_WHERE em services/drizzle/schema/catalog-links.ts.

DROP INDEX IF EXISTS "unq_catalog_links_identity";
CREATE UNIQUE INDEX "unq_catalog_links_identity" ON "ampmais_catalog_links"
  ("organizacao_id","provider","merchant_id","tipo","produto_id","produto_variante_id","produto_add_on_id","produto_add_on_opcao_id") NULLS NOT DISTINCT
  WHERE "tipo" NOT IN ('ADD_ON', 'ADD_ON_OPCAO');

DROP INDEX IF EXISTS "unq_catalog_links_externo_option_group";
CREATE UNIQUE INDEX "unq_catalog_links_externo_option_group" ON "ampmais_catalog_links"
  ("organizacao_id","provider","merchant_id","externo_option_group_id")
  WHERE "tipo" = 'ADD_ON' AND "externo_option_group_id" IS NOT NULL AND "status" <> 'DESVINCULADO';

-- `unq_catalog_links_externo_option` (0115) já tem a forma certa; recriado só para garantir o predicado.
DROP INDEX IF EXISTS "unq_catalog_links_externo_option";
CREATE UNIQUE INDEX "unq_catalog_links_externo_option" ON "ampmais_catalog_links"
  ("organizacao_id","provider","merchant_id","externo_option_id")
  WHERE "externo_option_id" IS NOT NULL AND "status" <> 'DESVINCULADO';

-- Sem o lado remoto, um vínculo de grupo/opção ficaria fora do índice que o identifica.
DO $$ BEGIN
  ALTER TABLE "ampmais_catalog_links" ADD CONSTRAINT "chk_catalog_links_add_on_refs" CHECK (
    ("tipo" <> 'ADD_ON' OR ("externo_option_group_id" IS NOT NULL AND "produto_add_on_id" IS NOT NULL))
    AND ("tipo" <> 'ADD_ON_OPCAO' OR ("externo_option_id" IS NOT NULL AND "produto_add_on_opcao_id" IS NOT NULL))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- O push parte do grupo/opção interno; a ingestão, da option remota.
CREATE INDEX IF NOT EXISTS "idx_catalog_links_add_on" ON "ampmais_catalog_links" ("organizacao_id","produto_add_on_id")
  WHERE "produto_add_on_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_catalog_links_externo_option" ON "ampmais_catalog_links" ("organizacao_id","externo_option_id")
  WHERE "externo_option_id" IS NOT NULL;
