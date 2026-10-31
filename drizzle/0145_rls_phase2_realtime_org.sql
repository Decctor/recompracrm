-- RLS fase 2 do Supabase Realtime.
--
-- Aplicar SOMENTE depois que o deploy que chama realtime.setAuth com o JWT da sessão
-- Lucia estiver no ar. Aplicar antes disso faz a anon key deixar de receber
-- postgres_changes, e as conversas abertas ficam sem atualização ao vivo até o
-- JavaScript novo carregar.
--
-- Aplicar:  npx tsx ./scripts/apply-sql-migration.ts drizzle/0145_rls_phase2_realtime_org.sql
-- Reverter: npx tsx ./scripts/apply-sql-migration.ts drizzle/0145_rls_phase2_realtime_org.rollback.sql
--
-- Why a column comparison, not EXISTS:
-- All seven publication tables already store organizacao_id NOT NULL on the row.
-- ampmais_chat_messages got that column in 0052 (denormalized from the chat) and
-- already has idx_chat_messages_organizacao_data_envio. A policy of
-- organizacao_id = <jwt claim> is a single indexed equality. An EXISTS against
-- ampmais_chats would join on every WAL event and cannot use a leading
-- organizacao_id index on the child. No new column and no backfill.
--
-- The claim is read once per check via the scalar subquery (initplan), from
-- app_metadata — never user_metadata, which Supabase treats as client-writable.
-- postgres owns these tables and has BYPASSRLS, so the Drizzle pool is unchanged.
-- RLS is not forced.
--
-- ampmais_action_approval_requests is subscribed by the app (fila de aprovações)
-- but was NOT in supabase_realtime. Phase 1 already enabled RLS and revoked
-- SELECT, so the subscription could not deliver rows. This migration grants
-- SELECT to authenticated, adds the same org policy, and adds the table to the
-- publication. anon stays without SELECT.
--
-- INSERT/UPDATE payloads include the full new row, so the policy can see
-- organizacao_id under REPLICA IDENTITY DEFAULT. DELETE events filtered by a
-- non-key column were already dropped (the old tuple is only the primary key).
-- REPLICA IDENTITY FULL is intentionally not set: it would write every chat
-- message update to the WAL in full, and the UI does not depend on DELETE.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ampmais_chat_messages',
    'ampmais_chat_services',
    'ampmais_chats',
    'ampmais_chat_assignments',
    'ampmais_poi_transaction_requests',
    'ampmais_ai_agent_runs',
    'ampmais_ai_agent_follow_ups',
    'ampmais_action_approval_requests'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'rls phase 2: skipping missing table %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_organizacao', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (organizacao_id = (SELECT auth.jwt() -> ''app_metadata'' ->> ''organizacao_id''))',
      t || '_select_organizacao',
      t
    );
  END LOOP;
END $$;

-- Leading organizacao_id indexes for the two publication tables that lack one.
-- The other tables already have an organizacao_id-leading index.
CREATE INDEX IF NOT EXISTS idx_ai_agent_follow_ups_organizacao_id
  ON public.ampmais_ai_agent_follow_ups (organizacao_id);

DO $$
BEGIN
  IF to_regclass('public.ampmais_chat_services') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_services_organizacao_id
      ON public.ampmais_chat_services (organizacao_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ampmais_action_approval_requests') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ampmais_action_approval_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ampmais_action_approval_requests;
  END IF;
END $$;
