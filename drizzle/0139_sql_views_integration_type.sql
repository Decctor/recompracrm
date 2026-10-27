-- Conector genérico de ERPs locais que expõem views Postgres no contrato vw_recompra_* (Fran Farma/Atma).
ALTER TYPE "public"."integration_type" ADD VALUE IF NOT EXISTS 'SQL-VIEWS';
