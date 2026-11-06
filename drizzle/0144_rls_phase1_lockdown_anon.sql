-- Repo copy of the Supabase migration already applied to production on 2026-10-31
-- (version 20261031111654, name rls_phase1_lockdown_anon).
--
-- Idempotent: RLS is enabled only where it is still off, and REVOKE / ALTER DEFAULT
-- PRIVILEGES are safe to repeat. The seven Realtime tables stay out of this pass;
-- 0145_rls_phase2_realtime_org.sql locks those down after the app sends an
-- authenticated JWT.
--
-- Do not re-run this file after 0145 if you need authenticated SELECT on
-- ampmais_action_approval_requests: that table is not in the exclusion list, so
-- this script revokes SELECT from authenticated on it. Re-apply the GRANT in 0145
-- if that happens.
--
-- Apply with: npx tsx ./scripts/apply-sql-migration.ts drizzle/0144_rls_phase1_lockdown_anon.sql

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname LIKE 'ampmais\_%'
      AND NOT c.relrowsecurity
      AND c.relname NOT IN (
        'ampmais_chat_messages','ampmais_chat_services','ampmais_chats',
        'ampmais_chat_assignments','ampmais_poi_transaction_requests',
        'ampmais_ai_agent_runs','ampmais_ai_agent_follow_ups')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'ampmais\_%'
      AND tablename NOT IN (
        'ampmais_chat_messages','ampmais_chat_services','ampmais_chats',
        'ampmais_chat_assignments','ampmais_poi_transaction_requests',
        'ampmais_ai_agent_runs','ampmais_ai_agent_follow_ups')
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
