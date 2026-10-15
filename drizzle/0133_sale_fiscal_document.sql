-- Preferência por venda. NULL preserva a seleção automática das vendas existentes.
-- Aplicar: npx tsx scripts/apply-sql-migration.ts drizzle/0133_sale_fiscal_document.sql
ALTER TABLE "ampmais_sales" ADD COLUMN IF NOT EXISTS "emissao_fiscal_documento" "fiscal_document_type";
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_emissao_fiscal_documento_check' AND conrelid = 'ampmais_sales'::regclass) THEN
		ALTER TABLE "ampmais_sales" ADD CONSTRAINT "sales_emissao_fiscal_documento_check"
		CHECK ("emissao_fiscal_documento" IS NULL OR "emissao_fiscal_documento" IN ('NFE', 'NFCE'));
	END IF;
END $$;
