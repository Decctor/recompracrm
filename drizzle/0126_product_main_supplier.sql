-- Fornecedor principal do produto. Atribuição sempre manual (PUT /api/products/main-supplier);
-- o histórico de compras só gera sugestões. Excluir o fornecedor limpa o vínculo (SET NULL).
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0126_product_main_supplier.sql
-- Idempotente — pode ser reexecutada após falha parcial.

ALTER TABLE "ampmais_products" ADD COLUMN IF NOT EXISTS "fornecedor_principal_id" varchar(255);

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_products_fornecedor_principal_id_ampmais_suppliers_id_fk') THEN
		ALTER TABLE "ampmais_products"
			ADD CONSTRAINT "ampmais_products_fornecedor_principal_id_ampmais_suppliers_id_fk"
			FOREIGN KEY ("fornecedor_principal_id") REFERENCES "ampmais_suppliers"("id") ON DELETE SET NULL;
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_products_organizacao_fornecedor_principal" ON "ampmais_products" ("organizacao_id", "fornecedor_principal_id");
