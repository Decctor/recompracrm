-- Vendas antigas do Ponto de Interação: até aqui o vendedor gravado ERA o operador (a senha
-- digitada), então copiar `vendedor_id` para `operador_vendedor_id` é exato, não estimativa.
-- ~3,3 mil linhas (2026-11-26). Rodar depois da 0160, em execução separada.
SET lock_timeout = '5s';

UPDATE "ampmais_sales"
SET "operador_vendedor_id" = "vendedor_id"
WHERE "id_externo" LIKE 'POI-%'
	AND "vendedor_id" IS NOT NULL
	AND "operador_vendedor_id" IS NULL;

ALTER TABLE "ampmais_sales" VALIDATE CONSTRAINT "ampmais_sales_operador_vendedor_id_ampmais_sellers_id_fk";
