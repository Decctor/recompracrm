-- Crédito de ICMS do Simples por operação. Gerada para aplicação manual pelo responsável.
-- Nenhum backfill: recurso desabilitado no JSON fiscal, decisões novas nascem nulas.
-- Executar com scripts/apply-sql-migration.ts seguindo o processo habitual do projeto.
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fiscal_sale_destination') THEN
  CREATE TYPE fiscal_sale_destination AS ENUM ('REVENDA_INDUSTRIALIZACAO', 'CONSUMO_FINAL');
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fiscal_credit_decision') THEN
  CREATE TYPE fiscal_credit_decision AS ENUM ('NAO_CONFIRMADO', 'SEM_CREDITO', 'COM_CREDITO');
 END IF;
END $$;

ALTER TABLE ampmais_sales ADD COLUMN IF NOT EXISTS fiscal_destinacao fiscal_sale_destination;
ALTER TABLE ampmais_sales ADD COLUMN IF NOT EXISTS fiscal_credito_icms fiscal_credit_decision;
ALTER TABLE ampmais_fiscal_tax_groups ADD COLUMN IF NOT EXISTS csosn_com_credito fiscal_icms_csosn;
ALTER TABLE ampmais_fiscal_tax_groups ADD COLUMN IF NOT EXISTS csosn_sem_credito fiscal_icms_csosn;

-- As linhas são revisões imutáveis. A mais recente de cada grupo/competência é a vigente.
CREATE TABLE IF NOT EXISTS ampmais_fiscal_credit_rates (
 id varchar(255) PRIMARY KEY,
 organizacao_id varchar(255) NOT NULL REFERENCES ampmais_organizations(id) ON DELETE CASCADE,
 grupo_tributario_id varchar(255) NOT NULL REFERENCES ampmais_fiscal_tax_groups(id) ON DELETE CASCADE,
 competencia varchar(7) NOT NULL,
 percentual double precision NOT NULL,
 observacao text,
 autor_id varchar(255) REFERENCES ampmais_users(id) ON DELETE SET NULL,
 data_insercao timestamptz NOT NULL DEFAULT clock_timestamp(),
 CONSTRAINT fiscal_credit_rates_competence_check CHECK (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 CONSTRAINT fiscal_credit_rates_percentage_check CHECK (percentual > 0 AND percentual <= 100)
);
CREATE INDEX IF NOT EXISTS idx_fiscal_credit_rates_lookup ON ampmais_fiscal_credit_rates (organizacao_id, grupo_tributario_id, competencia, data_insercao);
