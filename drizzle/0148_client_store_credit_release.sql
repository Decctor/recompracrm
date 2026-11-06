-- Liberação de fiado por cliente (crédito da loja ao cliente).
--
--   fiado_liberado         o cliente pode comprar fiado quando a organização exige liberação
--   fiado_limite           teto do saldo EM ABERTO de fiado; nulo com fiado_liberado = sem limite
--   fiado_liberado_por_id  quem tomou a decisão de crédito (auditoria)
--   fiado_liberado_em      quando
--
-- A exigência é opcional por organização (configuracao.preferencias.fiado.exigeLiberacao, JSON —
-- sem migração): até alguém ligá-la, nada muda no balcão. Ao ligar, a rota da política pré-libera
-- quem já tem histórico de fiado (lib/finances/store-credit/release.ts), então esta migração não
-- faz backfill nenhum.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0148_client_store_credit_release.sql
-- Idempotente.
--
-- lock_timeout: a tabela de clientes é quente (PDV, sincronizações, cron de RFM). ADD COLUMN com
-- default constante e nulo sem default são só metadado, mas pedem lock exclusivo e, enquanto
-- esperam, enfileiram toda escrita atrás deles. Melhor falhar rápido e tentar de novo.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "ampmais_clients" ADD COLUMN IF NOT EXISTS "fiado_liberado" boolean DEFAULT false NOT NULL;
ALTER TABLE "ampmais_clients" ADD COLUMN IF NOT EXISTS "fiado_limite" double precision;
ALTER TABLE "ampmais_clients" ADD COLUMN IF NOT EXISTS "fiado_liberado_por_id" varchar(255);
ALTER TABLE "ampmais_clients" ADD COLUMN IF NOT EXISTS "fiado_liberado_em" timestamp;

-- NOT VALID evita varrer a tabela segurando o lock; a coluna nasce toda nula, então a validação
-- logo abaixo é imediata.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_clients_fiado_liberado_por_id_ampmais_users_id_fk') THEN
		ALTER TABLE "ampmais_clients"
			ADD CONSTRAINT "ampmais_clients_fiado_liberado_por_id_ampmais_users_id_fk"
			FOREIGN KEY ("fiado_liberado_por_id") REFERENCES "ampmais_users"("id") ON DELETE SET NULL NOT VALID;
	END IF;
END $$;

ALTER TABLE "ampmais_clients" VALIDATE CONSTRAINT "ampmais_clients_fiado_liberado_por_id_ampmais_users_id_fk";
