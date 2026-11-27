-- "Quem comprou A também comprou B" persistido por organização (services/drizzle/schema/products.ts,
-- productPairScores). Escrito pelo cron product-client-references na transação de cada org e lido
-- pelo cross-sell do PDV (app/api/pos/cross-sell), que antes recalculava o self-join de itens a cada
-- requisição (até 6,9 s na Congelatte).
--
-- Tabela nova e vazia: os índices nascem instantâneos. Os FKs travam ampmais_organizations e
-- ampmais_products por milissegundos (sem varredura). Aplicar ANTES do deploy do código que a usa:
-- sem a tabela, o INSERT do cron derruba a transação da org.
CREATE TABLE IF NOT EXISTS "ampmais_product_pair_scores" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organizacao_id" varchar(255) NOT NULL,
	"produto_id" varchar(255) NOT NULL,
	"produto_relacionado_id" varchar(255) NOT NULL,
	"coocorrencias" integer NOT NULL,
	"ranking" integer NOT NULL,
	"data_atualizacao" timestamp DEFAULT now() NOT NULL,
	-- Nomes no padrão do drizzle (<tabela>_<coluna>_<ref>_<col>_fk; o Postgres corta em 63 caracteres).
	CONSTRAINT "ampmais_product_pair_scores_organizacao_id_ampmais_organizations_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "ampmais_organizations"("id") ON DELETE CASCADE,
	CONSTRAINT "ampmais_product_pair_scores_produto_id_ampmais_products_id_fk" FOREIGN KEY ("produto_id") REFERENCES "ampmais_products"("id") ON DELETE CASCADE,
	CONSTRAINT "ampmais_product_pair_scores_produto_relacionado_id_ampmais_products_id_fk" FOREIGN KEY ("produto_relacionado_id") REFERENCES "ampmais_products"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_pair_scores_produto_ranking" ON "ampmais_product_pair_scores" USING btree ("produto_id", "ranking");
CREATE INDEX IF NOT EXISTS "idx_product_pair_scores_organizacao" ON "ampmais_product_pair_scores" USING btree ("organizacao_id");
CREATE INDEX IF NOT EXISTS "idx_product_pair_scores_relacionado" ON "ampmais_product_pair_scores" USING btree ("produto_relacionado_id");

-- Mesmo padrão das demais tabelas ampmais_: RLS ligado e sem policies. O app conecta como postgres
-- (ignora RLS); a API pública do Supabase (anon/authenticated) fica sem acesso mesmo se ganhar grant.
ALTER TABLE "ampmais_product_pair_scores" ENABLE ROW LEVEL SECURITY;
