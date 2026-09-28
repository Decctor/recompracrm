-- Origem histórica Phibo. Manter a conexão inativa para não entrar no polling.
-- Aplicar em transação separada antes de inserir a integração.
ALTER TYPE integration_type ADD VALUE IF NOT EXISTS 'PHIBO';
