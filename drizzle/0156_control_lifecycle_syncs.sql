-- Estado da sincronização do ciclo de vida das organizações com o Syncroniza Control
-- (docs/onboarding/revenue-centric-activation-analysis.md §9). Aditiva e idempotente.
-- Aplicar ANTES do deploy: o sync grava nesta tabela.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS ampmais_control_lifecycle_syncs (
	organizacao_id varchar(255) PRIMARY KEY REFERENCES ampmais_organizations(id) ON DELETE CASCADE,
	control_oportunidade_id varchar(255),
	marcos_enviados jsonb DEFAULT '[]'::jsonb NOT NULL,
	campos_hash varchar(64),
	data_ultima_sincronizacao timestamp,
	ultimo_erro text,
	data_insercao timestamp DEFAULT now() NOT NULL
);
