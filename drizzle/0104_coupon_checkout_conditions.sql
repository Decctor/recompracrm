ALTER TABLE "ampmais_coupons"
	ADD COLUMN "condicao_modalidades_entrega" "delivery_mode"[],
	ADD COLUMN "condicao_primeira_compra" boolean DEFAULT false NOT NULL;
