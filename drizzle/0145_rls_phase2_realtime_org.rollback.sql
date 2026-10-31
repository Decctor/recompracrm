-- REVERSÃO de 0145_rls_phase2_realtime_org.sql.
-- Não aplicar no rollout. Devolve SELECT ao anon e desliga RLS nas sete tabelas do
-- Realtime, o que volta a deixar qualquer organização legível com a anon key.
--
-- Só para desfazer a fase 2:
--   npx tsx ./scripts/apply-sql-migration.ts drizzle/0145_rls_phase2_realtime_org.rollback.sql
--
-- Indexes added by 0145 are left in place (they do not grant access).
-- ampmais_action_approval_requests returns to the phase 1 state: RLS on, no
-- policies, no SELECT for anon/authenticated, and out of supabase_realtime.

DO $$
DECLARE
  t text;
  realtime_tables text[] := ARRAY[
    'ampmais_chat_messages',
    'ampmais_chat_services',
    'ampmais_chats',
    'ampmais_chat_assignments',
    'ampmais_poi_transaction_requests',
    'ampmais_ai_agent_runs',
    'ampmais_ai_agent_follow_ups'
  ];
BEGIN
  FOREACH t IN ARRAY realtime_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_organizacao', t);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', t);
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ampmais_action_approval_requests') IS NULL THEN
    RETURN;
  END IF;

  DROP POLICY IF EXISTS ampmais_action_approval_requests_select_organizacao
    ON public.ampmais_action_approval_requests;
  ALTER TABLE public.ampmais_action_approval_requests ENABLE ROW LEVEL SECURITY;
  REVOKE SELECT ON TABLE public.ampmais_action_approval_requests FROM anon, authenticated;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ampmais_action_approval_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.ampmais_action_approval_requests;
  END IF;
END $$;
