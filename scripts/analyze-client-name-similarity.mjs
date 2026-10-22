import postgres from "postgres";

// Read-only experiment: no candidate persistence or database DDL.
const db = postgres(process.env.SUPABASE_DB_URL, { prepare: false, max: 1 });
const organizationId = "27817d9a-cb04-4704-a1f4-15b81a3610d3";
const base = `WITH normalized AS MATERIALIZED (
 SELECT id, nome, telefone_base, lower(trim(email)) email, cpf_cnpj,
 trim(regexp_replace(regexp_replace(unaccent_immutable(lower(nome)), '[^a-z0-9 ]', ' ', 'g'), '\\s+', ' ', 'g')) normalized
 FROM ampmais_clients WHERE organizacao_id = $1
), names AS MATERIALIZED (
 SELECT *, regexp_split_to_array(trim(regexp_replace(normalized, '\\m(de|da|do|das|dos|e)\\M', ' ', 'g')), '\\s+') tokens
 FROM normalized WHERE length(normalized) >= 6 AND normalized LIKE '% %'
), prepared AS MATERIALIZED (
 SELECT *, array_to_string(tokens,' ') clean, tokens[1] first, tokens[array_length(tokens,1)] last
 FROM names WHERE array_length(tokens,1)>=2
)
`;
const strategies = {
 exact: "a.normalized=b.normalized",
 surname_initial: "a.last=b.last AND left(a.first,1)=left(b.first,1)",
 first_surname_prefix: "a.first=b.first AND left(a.last,3)=left(b.last,3)",
 combined_keys: "a.block=b.block",
};
try {
 for (const [strategy, block] of Object.entries(strategies)) {
  await db.begin("read only", async tx => {
   await tx`SET LOCAL statement_timeout = '20s'`;
   const keyed = strategy === 'combined_keys';
   const prefix = keyed ? base.trimEnd() + `, keyed AS MATERIALIZED (SELECT p.*,k.block FROM prepared p CROSS JOIN LATERAL (VALUES ('surname:'||last||':'||left(first,1)),('first:'||first||':'||left(last,3))) k(block)) ` : base;
   const query = prefix + `SELECT DISTINCT a.id aid,b.id bid,a.nome anome,b.nome bnome,a.first afirst,b.first bfirst,a.last alast,b.last blast,
    similarity(a.clean,b.clean) score, a.clean=b.clean exact,
    (nullif(a.telefone_base,'')=nullif(b.telefone_base,'')) phone,
    (nullif(a.email,'')=nullif(b.email,'')) email,
    (nullif(a.cpf_cnpj,'') IS NOT NULL AND nullif(b.cpf_cnpj,'') IS NOT NULL AND a.cpf_cnpj<>b.cpf_cnpj) conflicting_document
    FROM ${keyed ? 'keyed' : 'prepared'} a JOIN ${keyed ? 'keyed' : 'prepared'} b ON a.id<b.id AND (${block})
    WHERE similarity(a.clean,b.clean)>=0.65`;
   const start=performance.now();
   try {
    const rows=await tx.unsafe(query,[organizationId]);
    console.log(JSON.stringify({strategy,wallMs:Math.round(performance.now()-start),pairs:rows.length,
     thresholds:[.65,.7,.75,.8,.85,.9,1].map(t=>({threshold:t,pairs:rows.filter(r=>r.score>=t).length})),
     exact:rows.filter(r=>r.exact).length,contactSupport:rows.filter(r=>r.phone||r.email).length,
     conflictingDocuments:rows.filter(r=>r.conflicting_document).length,
     conservative:(()=>{
      const frequencies=new Map();
      for(const r of rows) for(const [id,name] of [[r.aid,r.anome],[r.bid,r.bnome]]) {const n=name.toLowerCase().trim();if(!frequencies.has(n))frequencies.set(n,new Set());frequencies.get(n).add(id)}
      const candidates=rows.filter(r=>!r.conflicting_document && !/cliente|consumidor|identificado|cadastro|teste/i.test(r.anome+' '+r.bnome) && frequencies.get(r.anome.toLowerCase().trim()).size<=10 && frequencies.get(r.bnome.toLowerCase().trim()).size<=10);
      const strong=candidates.filter(r=>r.phone||r.email||((r.anome.trim().split(/\s+/).length>=3&&r.bnome.trim().split(/\s+/).length>=3)&&r.score>=.8));
      return {afterGuards:candidates.length,contactSupported:candidates.filter(r=>r.phone||r.email).length,threeTokensOrContact:strong.length,examples:strong.filter(r=>!r.exact).slice(0,15).map(({anome,bnome,score})=>({anome,bnome,score}))};
     })(),
     commonNames:Object.entries(rows.filter(r=>r.exact).reduce((acc,r)=>{acc[r.anome.toLowerCase().trim()]=(acc[r.anome.toLowerCase().trim()]||0)+1;return acc},{})).sort((a,b)=>b[1]-a[1]).slice(0,8),
     fuzzyExamples:rows.filter(r=>!r.exact&&r.score>=.75&&r.score<.85).slice(0,20).map(({anome,bnome,score})=>({anome,bnome,score})),
     examples:rows.filter(r=>!r.exact).sort((a,b)=>b.score-a.score).slice(0,18).map(({anome,bnome,score,conflicting_document})=>({anome,bnome,score,conflicting_document}))}));
    const plan=await tx.unsafe('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+query,[organizationId]);
    console.log(JSON.stringify({strategy,plan:plan[0]['QUERY PLAN'][0]}));
   } catch(error) {console.log(JSON.stringify({strategy,error:error.message}));}
  });
 }
} finally {await db.end();}
