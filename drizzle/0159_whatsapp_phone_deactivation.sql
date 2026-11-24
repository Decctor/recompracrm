-- Soft delete de números do WhatsApp: a linha fica (conversas mantêm o vínculo), o número sai
-- da checagem de saúde, dos seletores e dos envios. Colunas anuláveis, sem default: sem rewrite.
SET lock_timeout = '5s';

ALTER TABLE "ampmais_whatsapp_connection_phones" ADD COLUMN IF NOT EXISTS "data_desativacao" timestamp;
ALTER TABLE "ampmais_whatsapp_connection_phones" ADD COLUMN IF NOT EXISTS "desativacao_autor_id" varchar(255);

DO $$ BEGIN
	ALTER TABLE "ampmais_whatsapp_connection_phones"
		ADD CONSTRAINT "ampmais_whatsapp_connection_phones_desativacao_autor_id_ampmais_users_id_fk"
		FOREIGN KEY ("desativacao_autor_id") REFERENCES "public"."ampmais_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
