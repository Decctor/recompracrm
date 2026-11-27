-- Revisão de performance (2026-11-27). APLICADO EM PRODUÇÃO em 2026-11-27 (manhã, BRT), um
-- statement por vez com CONCURRENTLY; todos conferidos com pg_index.indisvalid = true. Este arquivo
-- registra o que foi criado e serve para outros ambientes.
--
-- CONCURRENTLY não roda dentro de transação: aplicar UM statement por vez, fora de BEGIN
-- (scripts/apply-sql-migration.ts embrulha o arquivo numa transação e NÃO serve aqui).
-- Não aplicar durante os crons da madrugada (23:00–03:00 BRT): o CREATE INDEX CONCURRENTLY espera
-- as transações abertas na tabela, e a transação por org do product-client-references dura minutos.
-- Se um CREATE falhar no meio, ele deixa um índice INVALID: DROP INDEX CONCURRENTLY e rodar de novo.

-- A. Resolução de cliente da integração (lib/data-collecting-v2/sync-auxiliary-entities.ts,
-- loadExistingClients) e busca por telefone: sem índice btree por org + chave, cada lote lia todos os
-- clientes da org (Fran Farma: 1,86 s → 0,24 ms com BitmapOr sobre estes índices).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_clients_org_telefone_base" ON "ampmais_clients" USING btree ("organizacao_id", "telefone_base");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_clients_org_cpf_cnpj" ON "ampmais_clients" USING btree ("organizacao_id", "cpf_cnpj");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_clients_org_id_externo" ON "ampmais_clients" USING btree ("organizacao_id", "id_externo");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_clients_org_nome_normalizado" ON "ampmais_clients" USING btree ("organizacao_id", upper(btrim("nome")));

-- B. Cascata da exclusão de cliente: 5 filhas com FK ON DELETE CASCADE sem índice que comece por
-- cliente_id. Cada DELETE de cliente varria ~300 MB (13–20 s observados no auto_explain); complementa
-- a 0162.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_product_client_references_cliente_id" ON "ampmais_product_client_references" USING btree ("cliente_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_client_seller_references_cliente_id" ON "ampmais_client_seller_references" USING btree ("cliente_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_interactions_cliente_id" ON "ampmais_interactions" USING btree ("cliente_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cashback_program_balances_cliente_id" ON "ampmais_cashback_program_balances" USING btree ("cliente_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chats_cliente_id" ON "ampmais_chats" USING btree ("cliente_id");
