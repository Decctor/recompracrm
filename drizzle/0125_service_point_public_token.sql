-- QR fixo do ponto de atendimento: o token bruto passa a ser persistido para o painel
-- reexibir/reimprimir o QR sem regenerar. A busca publica segue por token_publico_hash.
-- Pontos existentes (apenas testes) recebem um token novo — QRs impressos antes desta
-- migracao deixam de funcionar.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0125_service_point_public_token.sql
-- Idempotente — pode ser reexecutada apos falha parcial.

ALTER TABLE "ampmais_service_points" ADD COLUMN IF NOT EXISTS "token_publico" varchar(64);

UPDATE "ampmais_service_points"
SET "token_publico" = encode(extensions.gen_random_bytes(32), 'hex')
WHERE "token_publico" IS NULL;

UPDATE "ampmais_service_points"
SET "token_publico_hash" = encode(sha256(convert_to("token_publico", 'UTF8')), 'hex')
WHERE "token_publico_hash" <> encode(sha256(convert_to("token_publico", 'UTF8')), 'hex');

ALTER TABLE "ampmais_service_points" ALTER COLUMN "token_publico" SET NOT NULL;
