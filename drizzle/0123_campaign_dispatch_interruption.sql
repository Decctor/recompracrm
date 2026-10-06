-- Interrupção de disparos por erros da Meta que se repetiriam para todo destinatário
-- (pagamento pendente, conta restrita, template pausado, limite de spam...). Ver
-- lib/campaigns/dispatch/interruption-policy.ts.
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0123_campaign_dispatch_interruption.sql
-- Idempotente — pode ser reexecutada após falha parcial. Os valores novos dos enums não são usados
-- nesta transação (ALTER TYPE ... ADD VALUE só fica visível depois do commit).

ALTER TYPE "campaign_dispatch_status" ADD VALUE IF NOT EXISTS 'INTERROMPIDA';
ALTER TYPE "campaign_dispatch_skip_reason" ADD VALUE IF NOT EXISTS 'ENVIO_INTERROMPIDO';

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_dispatch_interruption_reason') THEN
		CREATE TYPE "campaign_dispatch_interruption_reason" AS ENUM (
			'PAGAMENTO_PENDENTE',
			'CONTA_RESTRITA',
			'NUMERO_INDISPONIVEL',
			'CREDENCIAL_INVALIDA',
			'TEMPLATE_INDISPONIVEL',
			'LIMITE_SPAM',
			'LIMITE_ENVIO'
		);
	END IF;
END $$;

ALTER TABLE "ampmais_campaign_dispatches" ADD COLUMN IF NOT EXISTS "motivo_interrupcao" "campaign_dispatch_interruption_reason";
ALTER TABLE "ampmais_campaign_dispatches" ADD COLUMN IF NOT EXISTS "interrupcao" jsonb;
