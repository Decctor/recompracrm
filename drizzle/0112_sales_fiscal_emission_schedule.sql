-- Atraso configurável da emissão fiscal automática (docs/dev-planning/fiscal-auto-emission-delay-plan.md).
--
-- Este arquivo é DOCUMENTAÇÃO do schema aplicado via `npm run db:push` (convenção do repo);
-- também pode ser aplicado com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0112_sales_fiscal_emission_schedule.sql
-- Idempotente (IF NOT EXISTS).
--
-- `emissao_fiscal_data_agendamento` guarda o horário PARA O QUAL a emissão automática foi
-- agendada (não o momento do agendamento). Não nulo = agendamento vigente; o consumer da fila
-- `fiscal-auto-emissions` (ou o cron fiscal-queue, como rede de segurança) limpa ao executar.
-- O atraso em si vive em organizations.fiscal_configuracao->emissaoAutomatica->atrasoMinutos (jsonb, sem DDL).
ALTER TABLE "ampmais_sales" ADD COLUMN IF NOT EXISTS "emissao_fiscal_data_agendamento" timestamp;

-- Índice parcial: a varredura do cron por agendamentos vencidos não pode ler a tabela inteira,
-- e quase toda venda tem null aqui.
CREATE INDEX IF NOT EXISTS "idx_sales_emissao_fiscal_data_agendamento"
	ON "ampmais_sales" ("emissao_fiscal_data_agendamento")
	WHERE emissao_fiscal_data_agendamento IS NOT NULL;
