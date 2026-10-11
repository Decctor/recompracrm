-- Datas de inserção e de atualização do cadastro de produtos.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0127_product_timestamps.sql
-- Idempotente — pode ser reexecutada após falha parcial.
--
-- Produtos anteriores à coluna recebem uma ESTIMATIVA: o primeiro uso registrado (venda, movimentação
-- de estoque ou item de compra), nunca antes da criação da organização — vendas importadas de histórico
-- antecedem a organização no sistema, e a linha do produto não pode ser mais velha que ela. Produto sem
-- uso nenhum fica com a data da organização. `data_atualizacao` parte do mesmo valor.
--
-- Colunas entram nulas e sem default para que o backfill distinga linha antiga (NULL) de linha nova;
-- o default vem antes do backfill, no mesmo arquivo (uma transação), então nenhuma inserção
-- concorrente fica nula. Tudo segura a trava de `ampmais_products` por poucos segundos (~20 mil linhas).

ALTER TABLE "ampmais_products" ADD COLUMN IF NOT EXISTS "data_insercao" timestamp;
ALTER TABLE "ampmais_products" ADD COLUMN IF NOT EXISTS "data_atualizacao" timestamp;
ALTER TABLE "ampmais_products" ALTER COLUMN "data_insercao" SET DEFAULT now();
ALTER TABLE "ampmais_products" ALTER COLUMN "data_atualizacao" SET DEFAULT now();

WITH first_use AS (
	SELECT produto_id, MIN(data_uso) AS data_uso
	FROM (
		SELECT si.produto_id, MIN(s.data_venda) AS data_uso
		FROM "ampmais_sale_items" si
		JOIN "ampmais_sales" s ON s.id = si.venda_id
		GROUP BY si.produto_id
		UNION ALL
		SELECT produto_id, MIN(data_insercao) FROM "ampmais_product_stock_transactions" GROUP BY produto_id
		UNION ALL
		SELECT produto_id, MIN(data_insercao) FROM "ampmais_purchase_items" GROUP BY produto_id
	) usos
	GROUP BY produto_id
),
estimates AS (
	SELECT
		p.id,
		-- GREATEST ignora nulos: sem uso, vale a organização; sem as duas, agora.
		COALESCE(GREATEST(o.data_insercao, f.data_uso), now()) AS data_estimada
	FROM "ampmais_products" p
	LEFT JOIN first_use f ON f.produto_id = p.id
	LEFT JOIN "ampmais_organizations" o ON o.id = p.organizacao_id
	WHERE p.data_insercao IS NULL
)
UPDATE "ampmais_products" p
SET
	data_insercao = e.data_estimada,
	data_atualizacao = COALESCE(p.data_atualizacao, e.data_estimada)
FROM estimates e
WHERE p.id = e.id;

UPDATE "ampmais_products" SET data_atualizacao = data_insercao WHERE data_atualizacao IS NULL;

ALTER TABLE "ampmais_products" ALTER COLUMN "data_insercao" SET NOT NULL;
ALTER TABLE "ampmais_products" ALTER COLUMN "data_atualizacao" SET NOT NULL;
