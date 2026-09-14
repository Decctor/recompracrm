ALTER TABLE "ampmais_sales"
	ADD COLUMN "status_atendimento_data" timestamp;

-- Backfill: antes desta coluna, a unica aproximacao do momento da etapa era a data da venda. Para
-- vendas de balcao (nascem ENTREGUE) as duas coincidem; para pedidos que passaram pelo fluxo, a
-- aproximacao erra para tras, o que e o lado seguro (a venda fica FORA da janela de concluidos
-- recentes em vez de reaparecer nela).
UPDATE "ampmais_sales" SET "status_atendimento_data" = "data_venda" WHERE "data_venda" IS NOT NULL;

CREATE INDEX "idx_sales_org_atendimento_data"
	ON "ampmais_sales" USING btree ("organizacao_id", "status_atendimento", "status_atendimento_data");
