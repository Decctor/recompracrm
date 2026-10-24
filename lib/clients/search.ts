import { and, eq, or, sql, type SQL } from "drizzle-orm";
import type { DB, DBTransaction } from "@/services/drizzle";
import { clients } from "@/services/drizzle/schema";
import { clientSearchUsesFuzzy, type TClientSearchTerm } from "./search-terms";

export type ClientSearchDatabase = DB | DBTransaction;
export type TClientSearch = ReturnType<typeof buildClientSearch>;
/** Mesmo limiar que a busca do vínculo usava com `word_similarity(...) >= 0.45`. */
export const CLIENT_SEARCH_WORD_THRESHOLD = 0.45;

// Mantenha idênticas às expressões de idx_clients_nome_gin e idx_clients_documento_gin (0137), senão
// os índices trigram não são usados.
const normalizedName = sql`unaccent_immutable(lower(${clients.nome}))`;
// Documentos estão gravados com e sem máscara; a comparação é sempre pelos dígitos.
const documentDigits = sql`regexp_replace(coalesce(${clients.cpfCnpj}, ''), '[^0-9]', '', 'g')`;

// Escapa metacaracteres do LIKE: um '%' ou '_' digitado é literal, nunca curinga.
function escapeLike(value: string) {
	return value.replace(/[\\%_]/g, "\\$&");
}

function likeContaining(value: string) {
	return `%${escapeLike(value)}%`;
}

function normalizedLike(value: string, { prefix = false }: { prefix?: boolean } = {}) {
	return sql`unaccent_immutable(lower(${prefix ? `${escapeLike(value)}%` : likeContaining(value)}))`;
}

function normalizedValue(value: string) {
	return sql`unaccent_immutable(lower(${value}))`;
}

function nameContains(value: string) {
	return sql`${normalizedName} LIKE ${normalizedLike(value)}`;
}

function nameTokenCondition(token: TClientSearchTerm["nameTokens"][number]) {
	// `%>` (e não `word_similarity(...) >= x`) para o índice trigram servir também ao ramo tolerante a
	// erro; o limiar vem de `pg_trgm.word_similarity_threshold`, ajustado em `withClientSearch`.
	return token.fuzzy ? sql`(${nameContains(token.value)} OR ${normalizedName} %> ${normalizedValue(token.value)})` : nameContains(token.value);
}

function emailContains(value: string) {
	return sql`lower(${clients.email}) LIKE ${likeContaining(value.toLowerCase())}`;
}

function phoneCondition(patterns: string[]) {
	return or(...patterns.map((pattern) => sql`${clients.telefoneBase} LIKE ${likeContaining(pattern)}`));
}

function digitsCondition(digits: string, phonePatterns: string[]) {
	return or(phoneCondition(phonePatterns), sql`${documentDigits} LIKE ${likeContaining(digits)}`);
}

/**
 * Condição e relevância da busca de clientes, compartilhadas pelo vínculo de cliente
 * (`/api/clients/search`) e pela listagem (`/api/clients`): o mesmo texto encontra as mesmas pessoas
 * nas duas telas. Prefira `withClientSearch`, que decide quais palavras toleram erro de digitação.
 *
 * - Nome: cada palavra precisa aparecer, em qualquer ordem ("Gustavo Castro" acha "Gustavo Fernandes
 *   Castro"); as marcadas como `fuzzy` também casam por aproximação.
 * - Números soltos numa busca mista ("Gustavo 9944") restringem por telefone ou documento.
 * - Busca só numérica: telefone (com e sem nono dígito) e CPF/CNPJ, com ou sem máscara.
 * - E-mail: só quando o termo não tem espaço.
 */
export function buildClientSearch(term: TClientSearchTerm) {
	const branches: (SQL | undefined)[] = [];

	if (term.nameTokens.length > 0) {
		branches.push(and(...term.nameTokens.map(nameTokenCondition), ...term.digitTokens.map((digits) => digitsCondition(digits, [digits]))));
	} else if (!term.digits) {
		// Nada tokenizável ("a b", "12"): o termo inteiro contra o nome.
		branches.push(nameContains(term.text));
	}
	if (term.digits) branches.push(digitsCondition(term.digits, term.phonePatterns));
	if (term.matchesEmail) branches.push(emailContains(term.text));

	const value = normalizedValue(term.text);
	const allTokensTier = term.nameTokens.length > 1 ? sql`WHEN ${and(...term.nameTokens.map((token) => nameContains(token.value)))} THEN 1` : sql``;
	const nameTier = sql`CASE
		WHEN ${normalizedName} = ${value} THEN 4
		WHEN ${normalizedName} LIKE ${normalizedLike(term.text, { prefix: true })} THEN 3
		WHEN ${nameContains(term.text)} THEN 2
		${allTokensTier}
		ELSE 0 END`;
	const contactTier = term.digits
		? sql`CASE WHEN ${clients.telefoneBase} IN (${sql.join(
				term.phonePatterns.map((pattern) => sql`${pattern}`),
				sql`, `,
			)}) OR ${documentDigits} = ${term.digits} THEN 4 ELSE 0 END`
		: term.matchesEmail
			? sql`CASE WHEN lower(${clients.email}) = ${term.text.toLowerCase()} THEN 4 WHEN ${emailContains(term.text)} THEN 2 ELSE 0 END`
			: sql`0`;
	const phoneFinalFour = term.phoneFinalFour ? sql`CASE WHEN right(${clients.telefoneBase}, 4) = ${term.phoneFinalFour} THEN 10 ELSE 0 END` : sql`0`;

	return {
		condition: or(...branches),
		/**
		 * Maior é melhor. Final de telefone (10) > igualdade de nome, telefone, documento ou e-mail (4) >
		 * nome começa pelo termo (3) > nome ou e-mail contém o termo (2) > todas as palavras presentes (1)
		 * > só por aproximação (0); a similaridade trigram (0–1) desempata dentro de cada faixa.
		 */
		relevance: sql<number>`(${phoneFinalFour} + greatest(${nameTier}, ${contactTier}) + similarity(${normalizedName}, ${value}))`,
	};
}

/**
 * Consulta única que diz, para cada palavra que poderia tolerar erro de digitação, se algum cliente
 * da organização já a contém exatamente — e se o termo inteiro aparece em algum e-mail. `null`
 * quando nenhuma palavra é candidata.
 */
export function buildClientSearchFuzzyProbe({ organizacaoId, term }: { organizacaoId: string; term: TClientSearchTerm }) {
	const candidates = term.nameTokens.filter((token) => token.fuzzy);
	if (candidates.length === 0) return null;
	const columns = candidates.map(
		(token, index) =>
			sql`exists (select 1 from ${clients} where ${eq(clients.organizacaoId, organizacaoId)} and ${nameContains(token.value)}) as ${sql.raw(`"t${index}"`)}`,
	);
	if (term.matchesEmail) {
		columns.push(sql`exists (select 1 from ${clients} where ${eq(clients.organizacaoId, organizacaoId)} and ${emailContains(term.text)}) as "email"`);
	}
	return sql`select ${sql.join(columns, sql`, `)}`;
}

/**
 * Aproximação só para quem não tem casamento exato: uma palavra que algum cliente contém casa só por
 * trecho. Sem isso "Maria" traria também Mário, Márcia e Marina — o dobro de resultados, todos na
 * contagem e na exportação da listagem. Pelo mesmo motivo, um termo encontrado num e-mail
 * ("fabianaguimaraesfisio") não procura nomes parecidos.
 */
export function applyClientSearchFuzzyProbe(term: TClientSearchTerm, probe: Record<string, unknown> | undefined): TClientSearchTerm {
	if (probe?.email === true) return { ...term, nameTokens: term.nameTokens.map((token) => ({ ...token, fuzzy: false })) };
	let candidateIndex = 0;
	return {
		...term,
		nameTokens: term.nameTokens.map((token) => {
			if (!token.fuzzy) return token;
			const existsExactly = probe?.[`t${candidateIndex++}`] === true;
			return { ...token, fuzzy: !existsExactly };
		}),
	};
}

/**
 * Monta a busca e executa `query` com ela. Palavras que nenhum cliente contém viram aproximação, e
 * então a consulta roda numa transação com o limiar local — seguro com o Transaction Pooler do
 * Supabase, nunca vaza para outra requisição. Quando todas existem (o caso comum), nem a transação
 * é aberta.
 */
export async function withClientSearch<T>(
	database: DB,
	{ organizacaoId, term }: { organizacaoId: string; term: TClientSearchTerm | null },
	query: (db: ClientSearchDatabase, search: TClientSearch | null) => Promise<T>,
): Promise<T> {
	if (!term) return query(database, null);
	const probe = buildClientSearchFuzzyProbe({ organizacaoId, term });
	const [probeRow] = probe ? await database.execute<Record<string, unknown>>(probe) : [];
	const resolved = applyClientSearchFuzzyProbe(term, probeRow);
	const search = buildClientSearch(resolved);
	if (!clientSearchUsesFuzzy(resolved)) return query(database, search);
	return database.transaction(
		async (tx) => {
			await tx.execute(sql`select set_config('pg_trgm.word_similarity_threshold', ${String(CLIENT_SEARCH_WORD_THRESHOLD)}, true)`);
			return query(tx, search);
		},
		{ accessMode: "read only" },
	);
}
