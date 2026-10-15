-- Recebimentos parciais de contas de atendimento. Ver docs/dev-planning/tab-partial-payments-plan.md.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0132_tab_payments.sql
-- Idempotente — pode ser reexecutada apos falha parcial. Puramente aditiva.

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tab_payment_status') THEN
		CREATE TYPE "tab_payment_status" AS ENUM ('ATIVO', 'ESTORNADO');
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ampmais_tab_payments" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organizacao_id" varchar(255) NOT NULL,
	"tab_id" varchar(255) NOT NULL,
	"venda_id" varchar(255) NOT NULL,
	"lancamento_contabil_id" varchar(255),
	"transacao_financeira_id" varchar(255),
	"sessao_venda_id" varchar(255),
	"metodo" "payment_method" NOT NULL,
	"valor" double precision NOT NULL,
	"pagador_nome" text,
	"status" "tab_payment_status" DEFAULT 'ATIVO' NOT NULL,
	"recebido_por_usuario_id" varchar(255),
	"data_recebimento" timestamp DEFAULT now() NOT NULL,
	"estornado_por_usuario_id" varchar(255),
	"data_estorno" timestamp,
	"motivo_estorno" text,
	"data_insercao" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ampmais_tab_payments_organizacao_id_fk" FOREIGN KEY ("organizacao_id") REFERENCES "ampmais_organizations"("id") ON DELETE cascade,
	CONSTRAINT "ampmais_tab_payments_tab_id_fk" FOREIGN KEY ("tab_id") REFERENCES "ampmais_tabs"("id") ON DELETE cascade,
	CONSTRAINT "ampmais_tab_payments_venda_id_fk" FOREIGN KEY ("venda_id") REFERENCES "ampmais_sales"("id") ON DELETE cascade,
	CONSTRAINT "ampmais_tab_payments_lancamento_contabil_id_fk" FOREIGN KEY ("lancamento_contabil_id") REFERENCES "ampmais_accounting_entries"("id") ON DELETE set null,
	CONSTRAINT "ampmais_tab_payments_transacao_financeira_id_fk" FOREIGN KEY ("transacao_financeira_id") REFERENCES "ampmais_financial_transactions"("id") ON DELETE set null,
	CONSTRAINT "ampmais_tab_payments_sessao_venda_id_fk" FOREIGN KEY ("sessao_venda_id") REFERENCES "ampmais_sales_sessions"("id") ON DELETE set null,
	CONSTRAINT "ampmais_tab_payments_recebido_por_usuario_id_fk" FOREIGN KEY ("recebido_por_usuario_id") REFERENCES "ampmais_users"("id") ON DELETE set null,
	CONSTRAINT "ampmais_tab_payments_estornado_por_usuario_id_fk" FOREIGN KEY ("estornado_por_usuario_id") REFERENCES "ampmais_users"("id") ON DELETE set null
);

CREATE INDEX IF NOT EXISTS "idx_tab_payments_tab" ON "ampmais_tab_payments" ("tab_id", "status");
CREATE INDEX IF NOT EXISTS "idx_tab_payments_venda" ON "ampmais_tab_payments" ("venda_id");
CREATE INDEX IF NOT EXISTS "idx_tab_payments_sessao" ON "ampmais_tab_payments" ("sessao_venda_id");
