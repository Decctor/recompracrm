-- Repara a tabela ausente sem executar o drop/recreate destrutivo de 0076.
-- Preserva documentos recebidos e os cursores legados.
CREATE TABLE IF NOT EXISTS "ampmais_fiscal_inbound_sync_states" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organizacao_id" varchar(255) NOT NULL REFERENCES "ampmais_organizations"("id") ON DELETE CASCADE,
	"checkpoint" text,
	"ultima_sincronizacao" timestamp,
	"proxima_sincronizacao_permitida" timestamp,
	"ultimo_desfecho" varchar(60),
	"ultima_mensagem" text,
	"data_atualizacao" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_fiscal_inbound_sync_states_organizacao_id"
	ON "ampmais_fiscal_inbound_sync_states" ("organizacao_id");

-- Acesso pelo backend; a aplicação verifica autenticação e organização.
ALTER TABLE "ampmais_fiscal_inbound_sync_states" ENABLE ROW LEVEL SECURITY;
