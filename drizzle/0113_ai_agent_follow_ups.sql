-- Retomadas de conversa decididas pelo agente de IA — docs/dev-planning/chat-hub-ai-native-plan.md (Fase 2).
--
-- Este arquivo é DOCUMENTAÇÃO do schema aplicado via `npm run db:push` (convenção do repo);
-- também pode ser aplicado com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0113_ai_agent_follow_ups.sql
-- Idempotente (IF NOT EXISTS).
--
-- Uma retomada é amarrada ao episódio de atendimento em que foi decidida: se o ticket encerra,
-- ela morre com ele (cascade). Um chat tem no máximo uma retomada AGENDADA (índice parcial):
-- o turno mais novo sabe mais e substitui a anterior.

CREATE TABLE IF NOT EXISTS "ampmais_ai_agent_follow_ups" (
	"id" varchar(255) PRIMARY KEY,
	"organizacao_id" varchar(255) NOT NULL,
	"agente_id" varchar(255) NOT NULL,
	"chat_id" varchar(255) NOT NULL,
	"atendimento_id" varchar(255) NOT NULL,
	"run_origem_id" varchar(255),
	"run_execucao_id" varchar(255),
	"status" varchar(32) NOT NULL DEFAULT 'AGENDADA',
	"objetivo" text NOT NULL,
	"agendada_para" timestamp NOT NULL,
	"solicitada_para" timestamp NOT NULL,
	"tentativa" integer NOT NULL DEFAULT 0,
	"motivo_cancelamento" varchar(64),
	"lease_ate" timestamp,
	"data_execucao" timestamp,
	"data_insercao" timestamp NOT NULL DEFAULT now(),
	"data_atualizacao" timestamp,
	CONSTRAINT "ampmais_ai_agent_follow_ups_organizacao_id_ampmais_organizations_id_fk"
		FOREIGN KEY ("organizacao_id") REFERENCES "public"."ampmais_organizations"("id") ON DELETE CASCADE,
	CONSTRAINT "ampmais_ai_agent_follow_ups_agente_id_ampmais_ai_agents_id_fk"
		FOREIGN KEY ("agente_id") REFERENCES "public"."ampmais_ai_agents"("id") ON DELETE CASCADE,
	CONSTRAINT "ampmais_ai_agent_follow_ups_chat_id_ampmais_chats_id_fk"
		FOREIGN KEY ("chat_id") REFERENCES "public"."ampmais_chats"("id") ON DELETE CASCADE,
	CONSTRAINT "ampmais_ai_agent_follow_ups_atendimento_id_ampmais_chat_assignments_id_fk"
		FOREIGN KEY ("atendimento_id") REFERENCES "public"."ampmais_chat_assignments"("id") ON DELETE CASCADE,
	CONSTRAINT "ampmais_ai_agent_follow_ups_run_origem_id_ampmais_ai_agent_runs_id_fk"
		FOREIGN KEY ("run_origem_id") REFERENCES "public"."ampmais_ai_agent_runs"("id") ON DELETE SET NULL,
	CONSTRAINT "ampmais_ai_agent_follow_ups_run_execucao_id_ampmais_ai_agent_runs_id_fk"
		FOREIGN KEY ("run_execucao_id") REFERENCES "public"."ampmais_ai_agent_runs"("id") ON DELETE SET NULL
);

-- Uma retomada agendada por chat. Parcial: o histórico (executadas, canceladas) não conflita.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_agent_follow_ups_chat_agendada_idx"
	ON "ampmais_ai_agent_follow_ups" ("chat_id")
	WHERE status = 'AGENDADA';

-- Varredura do cron: só as vencidas, sem ler a tabela inteira.
CREATE INDEX IF NOT EXISTS "idx_ai_agent_follow_ups_due"
	ON "ampmais_ai_agent_follow_ups" ("status", "agendada_para");

CREATE INDEX IF NOT EXISTS "idx_ai_agent_follow_ups_atendimento"
	ON "ampmais_ai_agent_follow_ups" ("atendimento_id");

-- Presença da IA no hub (Fase 1) e retomadas (Fase 2) chegam ao hub por realtime:
-- alter publication supabase_realtime add table ampmais_ai_agent_runs;
-- alter publication supabase_realtime add table ampmais_ai_agent_follow_ups;
