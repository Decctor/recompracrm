-- Atribuição de adicionais vinculados a produto nas estatísticas de produto.
--
-- O item de venda grava o unitário com os adicionais embutidos (base + adicionais). Um cookie de
-- R$ 17 com o adicional "Cookie de Ovomaltine" (R$ 14, vinculado ao produto de mesmo nome) virava
-- R$ 31 de faturamento do cookie base e zero do de Ovomaltine — que, no entanto, saía do estoque.
-- `lib/products/product-sales-lines.ts` reparte cada linha: a base fica com o produto do item e o
-- valor de cada adicional vinculado vai para o produto da opção. Adicional sem produto continua
-- com o produto do item.
--
-- O vínculo e o custo são congelados no adicional da venda, no INSERT, por trigger: são nove
-- caminhos de escrita (PDV, loja, comanda, rascunho, edição, importações) e nenhum precisa saber
-- disto. Só preenche quando o INSERT não trouxe `produto_id` — uma cópia de linha existente
-- preserva o snapshot original.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0146_sale_item_modifier_product_snapshot.sql
-- Idempotente. O backfill usa o vínculo e o custo ATUAIS das opções (não há histórico de custo).
--
-- lock_timeout: o ALTER TABLE pede lock exclusivo e, enquanto espera, enfileira atrás dele toda
-- leitura/escrita de adicionais (vendas do PDV, loja, comanda). Na primeira tentativa uma consulta
-- presa segurou o lock e o ALTER bloqueou a tabela até o statement_timeout (2 min). Melhor falhar
-- rápido e tentar de novo.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "ampmais_sale_item_modifiers" ADD COLUMN IF NOT EXISTS "produto_id" varchar(255);
ALTER TABLE "ampmais_sale_item_modifiers" ADD COLUMN IF NOT EXISTS "produto_variante_id" varchar(255);
ALTER TABLE "ampmais_sale_item_modifiers" ADD COLUMN IF NOT EXISTS "quantidade_consumo" double precision;
ALTER TABLE "ampmais_sale_item_modifiers" ADD COLUMN IF NOT EXISTS "valor_custo_unitario" double precision;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_sale_item_modifiers_produto_id_ampmais_products_id_fk') THEN
		ALTER TABLE "ampmais_sale_item_modifiers"
			ADD CONSTRAINT "ampmais_sale_item_modifiers_produto_id_ampmais_products_id_fk"
			FOREIGN KEY ("produto_id") REFERENCES "ampmais_products"("id") ON DELETE SET NULL;
	END IF;
	-- O Postgres trunca o nome a 63 caracteres (como nas demais FKs de nome longo da tabela).
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_sale_item_modifiers_produto_variante_id_ampmais_product') THEN
		ALTER TABLE "ampmais_sale_item_modifiers"
			ADD CONSTRAINT "ampmais_sale_item_modifiers_produto_variante_id_ampmais_product_variants_id_fk"
			FOREIGN KEY ("produto_variante_id") REFERENCES "ampmais_product_variants"("id") ON DELETE SET NULL;
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_sale_item_modifiers_produto_id"
	ON "ampmais_sale_item_modifiers" ("produto_id")
	WHERE "produto_id" IS NOT NULL;

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

DROP TRIGGER IF EXISTS ampmais_sale_item_modifiers_product_snapshot ON "ampmais_sale_item_modifiers";
CREATE TRIGGER ampmais_sale_item_modifiers_product_snapshot
BEFORE INSERT ON "ampmais_sale_item_modifiers"
FOR EACH ROW EXECUTE FUNCTION ampmais_snapshot_sale_item_modifier_product();

UPDATE "ampmais_sale_item_modifiers" m
SET
	produto_id = coalesce(v.produto_id, o.produto_id),
	produto_variante_id = o.product_variant_id,
	quantidade_consumo = o.quantidade_consumo,
	valor_custo_unitario = coalesce(v.preco_custo, p.preco_custo)
FROM ampmais_product_add_on_options o
LEFT JOIN ampmais_product_variants v ON v.id = o.product_variant_id
LEFT JOIN ampmais_products p ON p.id = coalesce(v.produto_id, o.produto_id)
WHERE m.opcao_id = o.id
	AND m.produto_id IS NULL
	AND coalesce(v.produto_id, o.produto_id) IS NOT NULL;
