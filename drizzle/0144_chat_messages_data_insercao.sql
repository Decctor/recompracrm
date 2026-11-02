-- Apply with scripts/apply-sql-migration.ts, following this repository's numbered SQL workflow.
-- `data_envio` of an incoming message is WhatsApp's timestamp (whole seconds, the moment the
-- customer pressed send), not the moment the message reached us. The AI turn compared it against
-- the AI reply's own clock, so a question sent at 19:59:50.000 and delivered by the webhook after
-- the greeting reply (19:59:51.8) looked "already answered" and was silently skipped.
-- `data_insercao` is our clock. Two steps on purpose: adding the column with DEFAULT now() would
-- stamp every historical row with the migration time; this way old rows stay NULL (read through
-- coalesce(data_insercao, data_envio)) and only new rows get the default, without a table rewrite.
ALTER TABLE "ampmais_chat_messages" ADD COLUMN IF NOT EXISTS "data_insercao" timestamp;
ALTER TABLE "ampmais_chat_messages" ALTER COLUMN "data_insercao" SET DEFAULT now();
