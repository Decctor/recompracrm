import postgres from "postgres";

// SELECT-only experiment; transaction settings expire automatically.
const db = postgres(process.env.SUPABASE_DB_URL, { prepare: false, max: 1 });
const orgId = "27817d9a-cb04-4704-a1f4-15b81a3610d3";
const query = `WITH normalized AS MATERIALIZED (
 SELECT id,nome,cpf_cnpj,
 trim(regexp_replace(regexp_replace(unaccent_immutable(lower(nome)), '[^a-z0-9 ]',' ','g'),'\\s+',' ','g')) normalized
 FROM ampmais_clients WHERE organizacao_id=$1
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
), keyed AS MATERIALIZED (
 SELECT p.*,k.block FROM prepared p CROSS JOIN LATERAL
 (VALUES ('surname:'||last||':'||left(first,1)),('first:'||first||':'||left(last,3))) k(block)
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
 WHERE d.organizacao_id=$1 AND d.cliente_a_id=a.id AND d.cliente_b_id=b.id AND d.status IN ('DESCARTADO','MESCLADO'))
), classified AS (
 SELECT *,CASE
 WHEN exact AND least(atokens,btokens)>=3 THEN 'EXATO_COMPLETO'
 WHEN particle_equal AND least(atokens,btokens)>=3 THEN 'PARTICULAS'
 WHEN least(atokens,btokens)>=3 AND score>=0.8 AND first_equal THEN 'SIMILAR_PRIMEIRO_IGUAL'
 WHEN least(atokens,btokens)>=3 AND score>=0.8 AND first_variant THEN 'SIMILAR_LETRA_REPETIDA'
 WHEN exact AND greatest(afrequency,bfrequency)<=3 THEN 'EXATO_CURTO_REVISAR'
 WHEN particle_equal AND greatest(afrequency,bfrequency)<=3 THEN 'PARTICULAS_CURTO_REVISAR'
 ELSE 'OMITIDO' END categoria
 FROM pairs
) SELECT * FROM classified ORDER BY categoria,score DESC,aid,bid`;
try {
 await db.begin("read only", async tx => {
  await tx`SET LOCAL statement_timeout='15s'`;
  const start=performance.now();
  const rows=await tx.unsafe(query,[orgId]);
  const counts=Object.fromEntries([...new Set(rows.map(r=>r.categoria))].map(category=>[category,rows.filter(r=>r.categoria===category).length]));
  console.log(JSON.stringify({wallMs:Math.round(performance.now()-start),counts,
   examples:Object.fromEntries(Object.keys(counts).map(category=>[category,rows.filter(r=>r.categoria===category&&(!r.exact||category==='EXATO_CURTO_REVISAR')).slice(0,15).map(({anome,bnome,score})=>({anome,bnome,score}))]))},null,2));
  const plan=await tx.unsafe('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+query,[orgId]);
  console.log(JSON.stringify({executionMs:plan[0]['QUERY PLAN'][0]['Execution Time']}));
 });
} finally {await db.end();}
