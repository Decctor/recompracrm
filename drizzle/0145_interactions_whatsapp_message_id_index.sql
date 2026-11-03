-- Status de entrega da Meta (webhook do WhatsApp) e do gateway interno localizam a interação de
-- campanha pelo wamid guardado no JSON: `metadados->>'whatsappMessageId' = $1`
-- (lib/interactions/delivery-state.ts `applyProviderStatusUpdate`,
-- lib/whatsapp/gateway-webhook-processing.ts, lib/campaigns/surveys/capture.ts). Sem índice nessa
-- expressão cada `sent`/`delivered`/`read` — três por mensagem enviada, milhares por disparo —
-- varria a tabela de interações inteira. Parcial: só as interações enviadas por WhatsApp têm a
-- chave; a igualdade da consulta implica o `IS NOT NULL`, então o planner usa o índice.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0145_interactions_whatsapp_message_id_index.sql
-- Idempotente. Roda numa transação: enquanto o índice é criado as escritas em interações esperam
-- (as leituras seguem). Para zero espera, rode o CREATE abaixo com CONCURRENTLY, fora de transação
-- (ex.: no SQL editor do Supabase).
CREATE INDEX IF NOT EXISTS "idx_interactions_whatsapp_message_id"
	ON "ampmais_interactions" ((("metadados" ->> 'whatsappMessageId')))
	WHERE ("metadados" ->> 'whatsappMessageId') IS NOT NULL;
