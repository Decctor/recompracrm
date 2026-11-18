import type { TClientMergeSuggestionReasonEnum } from "@/schemas/enums";
import type { DB } from "@/services/drizzle";
import { sql } from "drizzle-orm";

/**
 * Sugestões do menu "Mesclar com outro cadastro": candidatos para UM cliente, calculados sob
 * demanda. São deliberadamente mais ousadas que a varredura noturna (name-duplicate-query.ts),
 * porque aqui um humano já decidiu procurar um duplicado e vai olhar cada sugestão.
 *
 * O que a varredura noturna não pega e esta pega:
 * - nomes de dois termos ("Ananda Lacerda" × "Ananda Lacerda");
 * - nome abreviado ("Ananda Lacerda" ⊂ "Ananda Costa Lacerda") — mesmo primeiro e último nome, e
 *   todos os termos do nome curto presentes no longo;
 * - telefone digitado errado (mesmos 8 dígitos finais com outro DDD, ou 1 dígito trocado), desde
 *   que primeiro nome e sobrenome também batam.
 *
 * Nome igual ou abreviado só vale quando a combinação é rara. `rarity` estima quantas OUTRAS
 * pessoas teriam esse primeiro nome e esse sobrenome, pelo maior de dois números:
 * - o esperado se fossem independentes: (cadastros com esse primeiro nome) × (cadastros com o
 *   sobrenome em QUALQUER posição) ÷ total. "Em qualquer posição" porque nome composto engana: em
 *   "João Vitor", "Vitor" quase nunca é o último termo, mas é comuníssimo no meio;
 * - o observado: cada cadastro além do par com a mesma combinação primeiro+último soma 0,3.
 * Medido na Congelatte (8,4 mil clientes): "Ananda … Lacerda" ≈ 0,01 e a amostra com raridade
 * ≤ 0,05 era quase toda de duplicados reais; "Maria Clara" e "João Vitor" passam de 1 e caem.
 *
 * Valores de contato compartilhados por mais de 10 cadastros (placeholder, telefone da loja) não
 * contam — o mesmo corte de `MAX_CLIENTS_PER_SIGNAL_VALUE` em duplicates.ts.
 */

/** Acima disto um par de nomes iguais é coincidência esperada, não evidência. */
const MAX_NAME_RARITY = 1;
const MAX_CLIENTS_PER_SIGNAL_VALUE = 10;
/** Sugestões abaixo disto ficam de fora — sobra só ruído. */
const MIN_SCORE = 36;
const MAX_SUGGESTIONS = 10;

export function buildClientMergeSuggestionsQuery({ organizacaoId, clienteId }: { organizacaoId: string; clienteId: string }) {
	return sql`WITH base AS MATERIALIZED (
 SELECT id,nome,telefone,email,cpf_cnpj,data_insercao,ultima_compra_data,metadata_total_compras,metadata_valor_total_compras,
 nullif(regexp_replace(coalesce(telefone_base,''),'[^0-9]','','g'),'') phone,
 nullif(regexp_replace(coalesce(cpf_cnpj,''),'[^0-9]','','g'),'') document,
 nullif(lower(trim(coalesce(email,''))),'') email_key,
 trim(regexp_replace(regexp_replace(unaccent_immutable(lower(nome)), '[^a-z0-9 ]',' ','g'),'\\s+',' ','g')) normalized
 FROM ampmais_clients WHERE organizacao_id=${organizacaoId}
), named AS MATERIALIZED (
 SELECT b.*,tk.tokens,tk.tokens[1] first,tk.tokens[array_length(tk.tokens,1)] last,
 coalesce(array_length(tk.tokens,1),0) token_count,array_to_string(tk.tokens,' ') clean,
 regexp_replace(coalesce(tk.tokens[1],''),'(.)\\1+','\\1','g') first_collapsed,
 (length(b.normalized)<6 OR b.normalized ~ '\\m(cliente|consumidor|identificado|cadastro|teste|testes|desconhecido)\\M'
 OR b.normalized ~ '[0-9]') generic_name
 FROM base b CROSS JOIN LATERAL
 (SELECT regexp_split_to_array(trim(regexp_replace(b.normalized,'\\m(de|da|do|das|dos|e)\\M',' ','g')),'\\s+') tokens) tk
), target AS (
 SELECT * FROM named WHERE id=${clienteId}
), frequencies AS (
 SELECT greatest(count(*) FILTER (WHERE n.token_count>=2 AND NOT n.generic_name),1)::float8 total,
 count(*) FILTER (WHERE n.token_count>=2 AND NOT n.generic_name AND n.first=t.first)::float8 first_count,
 count(*) FILTER (WHERE n.token_count>=2 AND NOT n.generic_name AND n.tokens @> ARRAY[t.last])::float8 last_count,
 count(*) FILTER (WHERE n.token_count>=2 AND NOT n.generic_name AND n.first=t.first AND n.last=t.last)::float8 combo_count,
 count(*) FILTER (WHERE n.phone=t.phone) phone_count,
 count(*) FILTER (WHERE n.email_key=t.email_key) email_count,
 count(*) FILTER (WHERE n.document=t.document) document_count
 FROM named n CROSS JOIN target t
), pool AS MATERIALIZED (
 SELECT c.*,
 coalesce(NOT c.generic_name AND NOT t.generic_name AND c.token_count>=2 AND t.token_count>=2,false) names_comparable,
 (c.token_count=t.token_count) same_token_count,
 coalesce(c.first=t.first OR c.first_collapsed=t.first_collapsed,false) first_match,
 coalesce(c.first=t.first AND c.last=t.last AND (c.tokens<@t.tokens OR t.tokens<@c.tokens),false) name_contained,
 coalesce(c.tokens=t.tokens,false) same_name,
 similarity(c.clean,t.clean)::float8 name_similarity,
 coalesce(c.document=t.document,false) same_document,
 coalesce(c.phone=t.phone,false) same_phone,
 coalesce(c.phone<>t.phone AND length(c.phone)>=10 AND length(t.phone)>=10 AND (
 right(c.phone,8)=right(t.phone,8)
 OR (length(c.phone)=length(t.phone) AND (SELECT count(*) FROM generate_series(1,length(t.phone)) i
 WHERE substr(c.phone,i,1)<>substr(t.phone,i,1))=1)
 ),false) near_phone,
 coalesce(c.email_key=t.email_key,false) same_email,
 EXISTS(SELECT 1 FROM ampmais_client_duplicate_candidates d WHERE d.organizacao_id=${organizacaoId}
 AND d.cliente_a_id=least(c.id,t.id) AND d.cliente_b_id=greatest(c.id,t.id) AND d.status='PENDENTE') pending_pair
 FROM named c CROSS JOIN target t
 WHERE c.id<>t.id
 AND ((NOT c.generic_name AND NOT t.generic_name AND (c.first=t.first OR c.first_collapsed=t.first_collapsed OR c.clean % t.clean))
 OR (c.phone IS NOT NULL AND t.phone IS NOT NULL AND right(c.phone,8)=right(t.phone,8))
 OR (c.email_key IS NOT NULL AND c.email_key=t.email_key)
 OR (c.document IS NOT NULL AND c.document=t.document))
 -- Documentos diferentes são pessoas diferentes; descartes são decisão humana e não voltam.
 AND NOT (c.document IS NOT NULL AND t.document IS NOT NULL AND c.document<>t.document)
 AND NOT EXISTS(SELECT 1 FROM ampmais_client_duplicate_candidates d WHERE d.organizacao_id=${organizacaoId}
 AND d.cliente_a_id=least(c.id,t.id) AND d.cliente_b_id=greatest(c.id,t.id) AND d.status='DESCARTADO')
), scored AS (
 SELECT p.*,r.rarity,
 (p.same_document AND f.document_count<=${MAX_CLIENTS_PER_SIGNAL_VALUE}) document_evidence,
 (p.same_phone AND f.phone_count<=${MAX_CLIENTS_PER_SIGNAL_VALUE}) same_phone_evidence,
 (p.same_email AND f.email_count<=${MAX_CLIENTS_PER_SIGNAL_VALUE}) email_evidence,
 (p.names_comparable AND p.name_contained AND r.rarity<=${MAX_NAME_RARITY}) name_evidence,
 -- Grafia parecida é para erro de digitação: mesmo número de termos. "Maria Clara" × "Maria
 -- Clara Souza" é outro sobrenome, não erro.
 (p.names_comparable AND NOT p.name_contained AND p.same_token_count AND p.first_match AND p.name_similarity>=0.6) spelling_evidence,
 -- Telefone com 1 dígito trocado também descreve linhas sequenciais de uma família: exige o mesmo
 -- primeiro nome e o sobrenome igual ou parecido, e só pesa muito junto com nome raro (abaixo).
 (p.near_phone AND p.names_comparable AND p.first_match AND (p.last=t_last.last OR p.name_similarity>=0.6)) phone_evidence
 FROM pool p CROSS JOIN frequencies f CROSS JOIN (SELECT last FROM target) t_last CROSS JOIN LATERAL
 (SELECT greatest(f.first_count*f.last_count/f.total,0.3*greatest(f.combo_count-2,0))::float8 rarity) r
), ranked AS (
 SELECT s.*,greatest(
 CASE WHEN document_evidence THEN 100 ELSE 0 END,
 CASE WHEN same_phone_evidence THEN 90 ELSE 0 END,
 CASE WHEN NOT phone_evidence THEN 0 WHEN name_evidence AND rarity<=0.2 THEN 85 ELSE 60 END,
 CASE WHEN email_evidence THEN 70 ELSE 0 END,
 CASE WHEN NOT name_evidence THEN 0
 WHEN rarity<=0.05 THEN CASE WHEN same_name THEN 80 ELSE 75 END
 WHEN rarity<=0.2 THEN CASE WHEN same_name THEN 65 ELSE 60 END
 ELSE CASE WHEN same_name THEN 45 ELSE 40 END END,
 CASE WHEN spelling_evidence THEN round(name_similarity*60) ELSE 0 END
 ) + 5*(greatest((document_evidence::int+same_phone_evidence::int+phone_evidence::int+email_evidence::int
 +name_evidence::int+spelling_evidence::int)-1,0)) score
 FROM scored s
)
SELECT id,nome,telefone,email,cpf_cnpj,data_insercao,ultima_compra_data,
 coalesce(metadata_total_compras,0)::int total_compras,coalesce(metadata_valor_total_compras,0)::float8 valor_total_compras,
 document_evidence same_document,same_phone_evidence same_phone,phone_evidence,email_evidence same_email,
 name_evidence,spelling_evidence,same_name,rarity,name_similarity,pending_pair,score::int score
FROM ranked WHERE score>=${MIN_SCORE}
ORDER BY score DESC,ultima_compra_data DESC NULLS LAST,id
LIMIT ${MAX_SUGGESTIONS}`;
}

export type TClientMergeSuggestionRow = {
	id: string;
	nome: string;
	telefone: string | null;
	email: string | null;
	cpf_cnpj: string | null;
	data_insercao: Date | string | null;
	ultima_compra_data: Date | string | null;
	total_compras: number;
	valor_total_compras: number;
	same_document: boolean;
	same_phone: boolean;
	phone_evidence: boolean;
	same_email: boolean;
	name_evidence: boolean;
	spelling_evidence: boolean;
	same_name: boolean;
	rarity: number;
	name_similarity: number;
	pending_pair: boolean;
	score: number;
};

export type TClientMergeSuggestionReason = { tipo: TClientMergeSuggestionReasonEnum; valor: string };
export type TClientMergeSuggestionConfidence = "ALTA" | "MEDIA" | "BAIXA";

function toDate(value: Date | string | null): Date | null {
	if (!value) return null;
	return value instanceof Date ? value : new Date(value);
}

function describeRarity(rarity: number): string {
	if (rarity <= 0.05) return "combinação rara na base";
	if (rarity <= 0.2) return "combinação pouco comum";
	return "combinação comum, confira";
}

/** Converte a linha do SQL na sugestão que a UI mostra: motivos legíveis e um nível de confiança. */
export function mapClientMergeSuggestionRow(row: TClientMergeSuggestionRow) {
	const motivos: TClientMergeSuggestionReason[] = [];
	if (row.same_document) motivos.push({ tipo: "CPF_CNPJ", valor: "Mesmo CPF/CNPJ" });
	if (row.same_phone) motivos.push({ tipo: "TELEFONE", valor: "Mesmo telefone" });
	if (row.phone_evidence) motivos.push({ tipo: "TELEFONE_PARECIDO", valor: "Telefone quase igual" });
	if (row.same_email) motivos.push({ tipo: "EMAIL", valor: "Mesmo e-mail" });
	if (row.name_evidence) {
		motivos.push(
			row.same_name
				? { tipo: "NOME_IGUAL", valor: `Mesmo nome, ${describeRarity(Number(row.rarity))}` }
				: { tipo: "NOME_ABREVIADO", valor: `Nome abreviado, ${describeRarity(Number(row.rarity))}` },
		);
	}
	if (row.spelling_evidence) motivos.push({ tipo: "NOME_SEMELHANTE", valor: "Grafia parecida" });

	const pontuacao = Number(row.score);
	const confianca: TClientMergeSuggestionConfidence = pontuacao >= 75 ? "ALTA" : pontuacao >= 55 ? "MEDIA" : "BAIXA";
	return {
		cliente: {
			id: row.id,
			nome: row.nome,
			telefone: row.telefone,
			email: row.email,
			cpfCnpj: row.cpf_cnpj,
			dataInsercao: toDate(row.data_insercao),
			ultimaCompraData: toDate(row.ultima_compra_data),
			metadataTotalCompras: Number(row.total_compras),
			metadataValorTotalCompras: Number(row.valor_total_compras),
		},
		motivos,
		confianca,
		pontuacao,
		/** Já está na fila de reconciliação (sinal de contato ou varredura noturna). */
		naFila: row.pending_pair,
	};
}
export type TClientMergeSuggestion = ReturnType<typeof mapClientMergeSuggestionRow>;

/** Recebe o `db` por parâmetro para o módulo seguir puro (testável com PGlite, sem conexão). */
export async function getClientMergeSuggestions(input: { db: DB; organizacaoId: string; clienteId: string }): Promise<TClientMergeSuggestion[]> {
	const rows = await input.db.transaction(async (tx) => {
		// Varre a organização inteira (até ~20 mil linhas hoje): o teto evita que uma base atípica
		// segure a conexão. ~80 ms com o cache quente na maior base medida.
		await tx.execute(sql`set local statement_timeout = '8s'`);
		return tx.execute<TClientMergeSuggestionRow>(buildClientMergeSuggestionsQuery({ organizacaoId: input.organizacaoId, clienteId: input.clienteId }));
	});
	return [...rows].map(mapClientMergeSuggestionRow);
}
