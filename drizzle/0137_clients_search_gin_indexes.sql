-- Busca de clientes (vínculo e listagem, lib/clients/search.ts): troca os índices trigram GiST de
-- nome, telefone e e-mail por GIN e indexa os dígitos do CPF/CNPJ (gravado com e sem máscara).
--
-- Medido com `npm run bench:client-search -- --simulate gist,gin` (Congelatte e Ampère Mais,
-- 2026-10-24): o GiST percorre boa parte do índice mesmo para um nome que ninguém tem (~4.800 blocos);
-- a busca por nome cai de 20–100 ms para 1–5 ms de execução no servidor, e telefone/CPF deixam de
-- varrer os clientes da organização. Nenhuma consulta usa ordenação por distância (`<->`), a única
-- coisa que só o GiST oferece.
--
-- Aplicar com: npx tsx ./scripts/apply-sql-migration.ts drizzle/0137_clients_search_gin_indexes.sql
-- Idempotente. Roda numa transação: enquanto os índices são criados (segundos, ~80 mil clientes) as
-- escritas em clientes esperam; as leituras seguem. Os GiST só são removidos depois que os GIN existem,
-- e o bloqueio exclusivo do DROP dura só até o COMMIT. Para zero espera, rode cada CREATE com
-- CONCURRENTLY, fora de transação.

CREATE INDEX IF NOT EXISTS "idx_clients_nome_gin" ON "ampmais_clients" USING gin (unaccent_immutable(lower("nome")) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_clients_telefone_gin" ON "ampmais_clients" USING gin ("telefone_base" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_clients_email_gin" ON "ampmais_clients" USING gin (lower("email") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_clients_documento_gin" ON "ampmais_clients" USING gin (regexp_replace(coalesce("cpf_cnpj", ''), '[^0-9]', '', 'g') gin_trgm_ops);

DROP INDEX IF EXISTS "idx_clients_nome";
DROP INDEX IF EXISTS "idx_clients_telefone";
DROP INDEX IF EXISTS "idx_clients_email";
