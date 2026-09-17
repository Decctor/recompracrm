-- Índices nas FKs que apontam para ampmais_interactions. Sem eles, cada DELETE em interactions
-- varre sales/campaign_conversions/recipients inteiras (ON DELETE SET NULL / CASCADE) — foi o que
-- estourou o statement timeout na limpeza das linhas BLOQUEADA do cutover (0109/0110).
--
-- Aplicado em produção em 2026-09-17 com CREATE INDEX CONCURRENTLY (fora de transação); este
-- arquivo é DOCUMENTAÇÃO do schema (convenção do repo).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sales_atribuicao_interacao_id" ON "ampmais_sales" ("atribuicao_interacao_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_campaign_conversions_interacao_id" ON "ampmais_campaign_conversions" ("interacao_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_campaign_dispatch_recipients_interacao_id" ON "ampmais_campaign_dispatch_recipients" ("interacao_id");
