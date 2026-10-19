-- Tentativas de pagamento SmartPOS e solicitantes de desconto por dispositivo.
-- Aplicar: npx tsx scripts/apply-sql-migration.ts drizzle/0136_payment_terminals.sql
-- O runner executa este arquivo inteiro em uma transação. Reexecutável.

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_attempt_status') THEN
        CREATE TYPE "payment_attempt_status" AS ENUM ('CRIADA', 'PROCESSANDO', 'APROVADA_EFETIVACAO_PENDENTE', 'CONSUMIDA', 'NAO_APROVADA', 'RESULTADO_INCERTO');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_attempt_not_approved_reason') THEN
        CREATE TYPE "payment_attempt_not_approved_reason" AS ENUM ('RECUSADA', 'CANCELADA', 'FALHA');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_attempt_operation') THEN
        CREATE TYPE "payment_attempt_operation" AS ENUM ('COBRANCA', 'CANCELAMENTO');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_attempt_provider') THEN
        CREATE TYPE "payment_attempt_provider" AS ENUM ('STONE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_installment_party') THEN
        CREATE TYPE "payment_installment_party" AS ENUM ('LOJISTA', 'EMISSOR');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ampmais_payment_attempts" (
    "id" varchar(255) PRIMARY KEY NOT NULL,
    "organizacao_id" varchar(255) NOT NULL REFERENCES "ampmais_organizations"("id") ON DELETE cascade,
    "venda_id" varchar(255) NOT NULL REFERENCES "ampmais_sales"("id") ON DELETE cascade,
    "dispositivo_id" varchar(255) NOT NULL REFERENCES "ampmais_access_principals"("id") ON DELETE restrict,
    "sessao_venda_id" varchar(255) REFERENCES "ampmais_sales_sessions"("id") ON DELETE set null,
    "tentativa_origem_id" varchar(255) REFERENCES "ampmais_payment_attempts"("id") ON DELETE restrict,
    "operacao" "payment_attempt_operation" DEFAULT 'COBRANCA' NOT NULL,
    "provedor" "payment_attempt_provider" NOT NULL,
    "metodo" "payment_method" NOT NULL,
    "valor" numeric(14, 2) NOT NULL,
    "moeda" varchar(3) DEFAULT 'BRL' NOT NULL,
    "total_parcelas" integer,
    "parcelamento_responsavel" "payment_installment_party",
    "status" "payment_attempt_status" DEFAULT 'CRIADA' NOT NULL,
    "motivo_nao_aprovacao" "payment_attempt_not_approved_reason",
    "chave_idempotencia" varchar(255),
    "fingerprint_entrada" varchar(128),
    "ordem_provedor_id" bigint GENERATED ALWAYS AS IDENTITY,
    "provedor_status" text,
    "itk_provedor" varchar(128),
    "atk_provedor" varchar(128),
    "codigo_resposta" varchar(32),
    "codigo_autorizacao" varchar(64),
    "bandeira" varchar(64),
    "pan_mascarado" varchar(32),
    "modo_entrada" varchar(32),
    "valor_autorizado" numeric(14, 2),
    "data_autorizacao_provedor" timestamp,
    "erro_codigo" varchar(64),
    "erro_mensagem" text,
    "resultado_sanitizado" jsonb,
    "transacao_financeira_id" varchar(255) REFERENCES "ampmais_financial_transactions"("id") ON DELETE set null,
    "versao" integer DEFAULT 1 NOT NULL,
    "data_inicio" timestamp,
    "data_conclusao" timestamp,
    "data_consumo" timestamp,
    "data_insercao" timestamp DEFAULT now() NOT NULL,
    "data_atualizacao" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_payment_attempts_dispositivo_status" ON "ampmais_payment_attempts" ("dispositivo_id", "status");
CREATE INDEX IF NOT EXISTS "idx_payment_attempts_organizacao_venda_status" ON "ampmais_payment_attempts" ("organizacao_id", "venda_id", "status");
CREATE INDEX IF NOT EXISTS "idx_payment_attempts_atk_provedor" ON "ampmais_payment_attempts" ("atk_provedor");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payment_attempts_transacao_financeira" ON "ampmais_payment_attempts" ("transacao_financeira_id") WHERE "status" <> 'NAO_APROVADA';
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payment_attempts_provedor_ordem" ON "ampmais_payment_attempts" ("provedor", "ordem_provedor_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payment_attempts_chave_idempotencia" ON "ampmais_payment_attempts" ("organizacao_id", "dispositivo_id", "chave_idempotencia") WHERE "chave_idempotencia" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "ampmais_payment_attempt_events" (
    "id" varchar(255) PRIMARY KEY NOT NULL,
    "organizacao_id" varchar(255) NOT NULL REFERENCES "ampmais_organizations"("id") ON DELETE cascade,
    "tentativa_id" varchar(255) NOT NULL REFERENCES "ampmais_payment_attempts"("id") ON DELETE cascade,
    "principal_id" varchar(255) REFERENCES "ampmais_access_principals"("id") ON DELETE set null,
    "usuario_id" varchar(255) REFERENCES "ampmais_users"("id") ON DELETE set null,
    "origem" varchar(30) NOT NULL,
    "tipo" varchar(50) NOT NULL,
    "status_anterior" "payment_attempt_status",
    "status_posterior" "payment_attempt_status" NOT NULL,
    "evidencia_sanitizada" jsonb,
    "chave_idempotencia" varchar(255),
    "fingerprint_entrada" varchar(128),
    "descricao" text,
    "data_insercao" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_payment_attempt_events_tentativa" ON "ampmais_payment_attempt_events" ("tentativa_id", "data_insercao");
CREATE INDEX IF NOT EXISTS "idx_payment_attempt_events_organizacao" ON "ampmais_payment_attempt_events" ("organizacao_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payment_attempt_events_chave_idempotencia" ON "ampmais_payment_attempt_events" ("tentativa_id", "chave_idempotencia") WHERE "chave_idempotencia" IS NOT NULL;

-- O vínculo inverso vem depois da criação das tentativas (as duas tabelas se referenciam).
ALTER TABLE "ampmais_financial_transactions" ADD COLUMN IF NOT EXISTS "tentativa_pagamento_id" varchar(255);
ALTER TABLE "ampmais_action_approval_requests" ALTER COLUMN "solicitante_id" DROP NOT NULL;
ALTER TABLE "ampmais_action_approval_requests" ADD COLUMN IF NOT EXISTS "solicitante_dispositivo_id" varchar(255);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_financial_transactions_tentativa_pagamento_id_fk' AND conrelid = 'ampmais_financial_transactions'::regclass) THEN
        ALTER TABLE "ampmais_financial_transactions" ADD CONSTRAINT "ampmais_financial_transactions_tentativa_pagamento_id_fk"
        FOREIGN KEY ("tentativa_pagamento_id") REFERENCES "ampmais_payment_attempts"("id") ON DELETE set null;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ampmais_action_approval_requests_solicitante_dispositivo_id_fk' AND conrelid = 'ampmais_action_approval_requests'::regclass) THEN
        ALTER TABLE "ampmais_action_approval_requests" ADD CONSTRAINT "ampmais_action_approval_requests_solicitante_dispositivo_id_fk"
        FOREIGN KEY ("solicitante_dispositivo_id") REFERENCES "ampmais_access_principals"("id") ON DELETE set null;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_financial_transactions_tentativa_pagamento" ON "ampmais_financial_transactions" ("tentativa_pagamento_id") WHERE "tentativa_pagamento_id" IS NOT NULL;
