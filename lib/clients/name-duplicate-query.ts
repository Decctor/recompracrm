import { sql } from "drizzle-orm";

/** Nightly-only matching. Organization materialization and equality keys avoid global trigram scans.
 * Short names stay out. Common names (>10) and blocks (>100) are deliberately omitted.
 * The output is capped per side and per organization to bound queue growth.
 */
export function buildClientNameDuplicateQuery(organizacaoId: string) {
	return sql`WITH normalized AS MATERIALIZED (
 SELECT id,nome,cpf_cnpj,
 trim(regexp_replace(regexp_replace(unaccent_immutable(lower(nome)), '[^a-z0-9 ]',' ','g'),'\\s+',' ','g')) normalized
 FROM ampmais_clients WHERE organizacao_id=${organizacaoId}
), tokenized AS MATERIALIZED (
 SELECT *,regexp_split_to_array(trim(regexp_replace(normalized,'\\m(de|da|do|das|dos|e)\\M',' ','g')),'\\s+') tokens,
 count(*) OVER(PARTITION BY normalized) frequency
 FROM normalized
), prepared AS MATERIALIZED (
 SELECT *,array_to_string(tokens,' ') clean,tokens[1] first,tokens[array_length(tokens,1)] last,
 regexp_replace(tokens[1],'(.)\\1+','\\1','g') first_collapsed
 FROM tokenized
 WHERE array_length(tokens,1)>=2 AND length(normalized)>=6
 AND normalized !~ '\\m(cliente|consumidor|identificado|cadastro|teste|testes|desconhecido)\\M'
 AND normalized !~ '[0-9]'
 AND frequency<=10
), keyed_raw AS MATERIALIZED (
 SELECT p.*,k.block FROM prepared p CROSS JOIN LATERAL
 (VALUES ('surname:'||last||':'||left(first,1)),('first:'||first||':'||left(last,3))) k(block)
), keyed AS MATERIALIZED (
 SELECT * FROM (SELECT *, count(*) OVER(PARTITION BY block) block_size FROM keyed_raw) grouped
 WHERE block_size<=100
), pairs AS MATERIALIZED (
 SELECT DISTINCT a.id aid,b.id bid,a.nome anome,b.nome bnome,a.normalized=b.normalized exact,
 a.clean=b.clean particle_equal, similarity(a.clean,b.clean) score,
 a.first=b.first first_equal,a.first_collapsed=b.first_collapsed first_variant,
 array_length(a.tokens,1) atokens,array_length(b.tokens,1) btokens,
 a.frequency afrequency,b.frequency bfrequency
 FROM keyed a JOIN keyed b ON a.block=b.block AND a.id<b.id
 WHERE similarity(a.clean,b.clean)>=0.75
 AND NOT (nullif(a.cpf_cnpj,'') IS NOT NULL AND nullif(b.cpf_cnpj,'') IS NOT NULL AND a.cpf_cnpj<>b.cpf_cnpj)
 AND NOT EXISTS(SELECT 1 FROM ampmais_client_duplicate_candidates d
 WHERE d.organizacao_id=${organizacaoId} AND d.cliente_a_id=a.id AND d.cliente_b_id=b.id AND d.status IN ('DESCARTADO','MESCLADO'))
), eligible AS MATERIALIZED (
 SELECT * FROM pairs WHERE least(atokens,btokens)>=3
 AND (exact OR particle_equal OR (score>=0.8 AND (first_equal OR first_variant)))
), ranked AS (
 SELECT *,row_number() OVER(PARTITION BY aid ORDER BY score DESC,bid) arank,
 row_number() OVER(PARTITION BY bid ORDER BY score DESC,aid) brank
 FROM eligible
)
SELECT aid AS cliente_a_id,bid AS cliente_b_id,
 CASE WHEN exact THEN 'Nome completo igual' WHEN particle_equal THEN 'Nome completo equivalente'
 ELSE 'Grafia semelhante do nome completo' END AS valor
FROM ranked WHERE arank<=10 AND brank<=10
ORDER BY score DESC,aid,bid LIMIT 5000`;
}

/** Append/refresh name evidence without replacing deterministic reasons or reopening decisions. */
export function buildClientNameDuplicateInsert(organizacaoId: string) {
	return sql`
 WITH matches AS (${buildClientNameDuplicateQuery(organizacaoId)})
 INSERT INTO ampmais_client_duplicate_candidates AS candidate
 (id,organizacao_id,cliente_a_id,cliente_b_id,motivos,status)
 SELECT gen_random_uuid(),${organizacaoId},cliente_a_id,cliente_b_id,
 jsonb_build_array(jsonb_build_object('tipo','NOME_SEMELHANTE','valor',valor)),'PENDENTE'
 FROM matches
 ON CONFLICT (organizacao_id,cliente_a_id,cliente_b_id) DO UPDATE
 SET motivos=coalesce((SELECT jsonb_agg(reason) FROM jsonb_array_elements(candidate.motivos) reason
 WHERE reason->>'tipo'<>'NOME_SEMELHANTE'),'[]'::jsonb) || excluded.motivos,
 data_atualizacao=now()
 WHERE candidate.status='PENDENTE'
 RETURNING id`;
}

/** Live checks own contact reasons; the nightly sweep owns name reasons. */
export function buildLiveDuplicateReasonsUpdate(reasons: { tipo: string; valor: string }[]) {
	return sql`${JSON.stringify(reasons)}::jsonb || coalesce((
 select jsonb_agg(reason) from jsonb_array_elements(ampmais_client_duplicate_candidates.motivos) reason
 where reason->>'tipo'='NOME_SEMELHANTE'
 ),'[]'::jsonb)`;
}
