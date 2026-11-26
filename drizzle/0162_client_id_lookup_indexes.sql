-- Índices para FKs de cliente que só eram achadas por varredura da tabela inteira: o merge de
-- clientes duplicados (lib/clients/merge.ts) re-aponta cada uma pelo cliente_id, e o delete do
-- cliente procura por elas no cascade.
--
-- CONCURRENTLY não roda dentro de transação: aplicar um statement por vez, fora de BEGIN
-- (scripts/apply-sql-migration.ts embrulha o arquivo numa transação e NÃO serve aqui).
-- Se um CREATE INDEX CONCURRENTLY falhar no meio, ele deixa um índice INVALID: DROP INDEX
-- CONCURRENTLY e rodar de novo.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chat_messages_cliente_id" ON "ampmais_chat_messages" USING btree ("cliente_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_chat_messages_autor_cliente_id" ON "ampmais_chat_messages" USING btree ("autor_cliente_id") WHERE "ampmais_chat_messages"."autor_cliente_id" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cashback_program_transactions_cliente_id" ON "ampmais_cashback_program_transactions" USING btree ("cliente_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_campaign_dispatch_recipients_cliente_id" ON "ampmais_campaign_dispatch_recipients" USING btree ("cliente_id");
