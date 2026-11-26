-- Vendedor × operador na venda do Ponto de Interação: `vendedor_id` passa a ser quem vendeu
-- (escolhido no POI, opcional) e `operador_vendedor_id` quem digitou a senha. Coluna anulável,
-- sem default: sem rewrite da tabela. O backfill das vendas antigas fica na 0161, em execução
-- separada, para o ACCESS EXCLUSIVE deste ALTER não durar o UPDATE.
SET lock_timeout = '5s';

ALTER TABLE "ampmais_sales" ADD COLUMN IF NOT EXISTS "operador_vendedor_id" varchar(255);

-- NOT VALID: a FK passa a valer para linhas novas sem varrer as ~530 mil existentes sob o lock.
-- Toda linha existente é nula até a 0161, que roda o VALIDATE.
DO $$ BEGIN
	ALTER TABLE "ampmais_sales"
		ADD CONSTRAINT "ampmais_sales_operador_vendedor_id_ampmais_sellers_id_fk"
		FOREIGN KEY ("operador_vendedor_id") REFERENCES "public"."ampmais_sellers"("id") ON DELETE set null ON UPDATE no action
		NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
