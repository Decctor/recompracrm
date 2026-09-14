-- Configuração do gatilho "PROMOCAO-PRODUTOS" (docs/product-promotion-campaign-design.md).
--
-- Este arquivo é DOCUMENTAÇÃO do schema aplicado via `npm run db:push` (convenção do repo);
-- não é executado pelo pipeline de migrations. Requer o valor de enum criado em
-- 0107_campaign_promotion_trigger_enum.sql.
--
-- `gatilho_promocao_data_referencia` tem a mesma semântica de `gatilho_uso_unico_data_referencia`:
-- YYYY-MM-DD no timezone do cron de interações; a hora vem de `execucao_agendada_bloco`.
--
-- `gatilho_promocao_produtos` guarda a lista curada (até 10) de produtos promovidos:
--   [{ "produtoId": "...", "precoPromocional": 9.9 | null }]
-- A ORDEM DO ARRAY é a prioridade de fallback quando o cliente não tem sinal de afinidade.
-- jsonb em vez de tabela filha: estrutura pequena, limitada e sempre lida/escrita por inteiro.
ALTER TABLE "ampmais_campaigns" ADD COLUMN IF NOT EXISTS "gatilho_promocao_data_referencia" text;
ALTER TABLE "ampmais_campaigns" ADD COLUMN IF NOT EXISTS "gatilho_promocao_produtos" jsonb;
