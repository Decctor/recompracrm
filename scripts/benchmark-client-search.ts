import "dotenv/config";
import { applyClientSearchFuzzyProbe, buildClientSearch, buildClientSearchFuzzyProbe, CLIENT_SEARCH_WORD_THRESHOLD } from "@/lib/clients/search";
import { clientSearchUsesFuzzy, parseClientSearchTerm } from "@/lib/clients/search-terms";
import { formatStringAsOnlyDigits, formatToPhone } from "@/lib/formatting";
import {
	createSimilarityExpression,
	createSimplifiedEmailSearchCondition,
	createSimplifiedPhoneSearchCondition,
	createSimplifiedSearchCondition,
	createWordSimilarityExpression,
	extractSearchTokens,
} from "@/lib/search";
import { isValidCPF } from "@/lib/validation";
import { connection, db } from "@/services/drizzle";
import { clients, organizations } from "@/services/drizzle/schema";
import { and, asc, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type postgres from "postgres";

/**
 * Mede a busca de clientes contra o banco real: a versão anterior de cada rota contra o
 * `buildClientSearch` compartilhado, com termos tirados dos próprios clientes de cada organização
 * (nome fora de ordem, erro de digitação, final de telefone, CPF parcial, e-mail...).
 *
 * Variantes (as consultas que cada rota faz com o termo, sem as estatísticas de venda — essas são
 * agregadas só para as 25 linhas da página e não dependem da busca):
 *   legacy-search  /api/clients/search antes: OR com `word_similarity(...) >= 0.45`, top 10
 *   search         /api/clients/search agora: sonda das palavras + buildClientSearch, top 10 por relevância
 *   legacy-list    /api/clients antes: trecho do termo inteiro em nome/telefone/e-mail; count + página por nome
 *   list           /api/clients agora: sonda das palavras + buildClientSearch; count + página por relevância
 *
 * As variantes novas seguem o fluxo de `withClientSearch`: a sonda (quais palavras algum cliente já
 * contém) roda fora de transação; só se sobrar palavra para aproximação abre-se a transação do limiar.
 * O tempo da sonda entra na parede e no servidor.
 *
 * Para cada uma: tempo de parede (mediana/p95 de N execuções, inclui ida e volta e a transação do
 * limiar) e tempo de execução no servidor (EXPLAIN ANALYZE), índices usados e clientes encontrados.
 * Só leitura: todas as transações são `read only`.
 *
 * Uso:
 *   npm run bench:client-search -- [--org <id|slug>]... [--term "texto"]... [--runs 5] [--simulate gist,gin] [--plans]
 *
 *   sem --org      congelatte e ampere-mais
 *   --term         substitui os termos amostrados (repetível)
 *   --simulate     repete tudo com índices candidatos numa cópia temporária da tabela (ver
 *                  SIMULATED_INDEX_SETS) — para decidir um índice antes de criá-lo
 *   --plans        imprime o plano de cada consulta
 */

const LEGACY_MIN_NAME_TOKEN_SIMILARITY = 0.45;
const PAGE_SIZE = 25;
const SEARCH_LIMIT = 10;
const DEFAULT_ORGS = ["congelatte", "ampere-mais"];

type TQuery = { toSQL: () => { sql: string; params: unknown[] } };
type TPlannedVariant = { fuzzyThreshold: boolean; queries: TQuery[]; countQuery: TQuery; probe: TQuery | null };
/** `plan` executa o que precisa vir antes das consultas (a sonda) e devolve as consultas a medir. */
type TVariant = { name: string; plan: (executor: TExecutor) => Promise<TPlannedVariant> };
type TResult = { variant: string; matched: number; wallMedian: number; wallP95: number; serverMs: number; indexes: string[] };

function readFlags(name: string) {
	const values: string[] = [];
	process.argv.forEach((arg, index) => {
		const value = process.argv[index + 1];
		if (arg === `--${name}` && value && !value.startsWith("--")) values.push(value);
	});
	return values;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function percentile(values: number[], p: number) {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

// ---------------------------------------------------------------- variantes

function legacySearchCondition(term: string) {
	const tokens = extractSearchTokens(term);
	const tokenized =
		tokens.length > 0
			? and(
					...tokens.map((token) =>
						or(
							createSimplifiedSearchCondition(clients.nome, token),
							sql`${createWordSimilarityExpression(clients.nome, token)} >= ${LEGACY_MIN_NAME_TOKEN_SIMILARITY}`,
						),
					),
				)
			: undefined;
	return or(
		createSimplifiedSearchCondition(clients.nome, term),
		tokenized,
		createSimplifiedPhoneSearchCondition(clients.telefoneBase, term),
		createSimplifiedSearchCondition(clients.cpfCnpj, term),
	);
}

function legacySearchOrder(term: string) {
	const digits = formatStringAsOnlyDigits(term);
	const isPhone = digits.length >= 4 && digits.length <= 11 && !(digits.length === 11 && isValidCPF(digits));
	const similarity = createSimilarityExpression(clients.nome, term);
	return isPhone
		? [desc(sql`CASE WHEN right(${clients.telefoneBase}, 4) = ${digits.slice(-4)} THEN 1 ELSE 0 END`), desc(similarity), asc(clients.nome)]
		: [desc(similarity), asc(clients.nome)];
}

function legacyListCondition(term: string) {
	return or(
		createSimplifiedSearchCondition(clients.nome, term),
		createSimplifiedPhoneSearchCondition(clients.telefoneBase, term),
		createSimplifiedEmailSearchCondition(clients.email, term),
	);
}

function countOf(where: SQL | undefined) {
	return db.select({ total: count() }).from(clients).where(where);
}

const dialect = new PgDialect();
const asQuery = (statement: SQL): TQuery => ({ toSQL: () => dialect.sqlToQuery(statement) });
const staticPlan = (planned: Omit<TPlannedVariant, "probe">) => async () => ({ ...planned, probe: null });

function buildVariants(organizacaoId: string, text: string): TVariant[] {
	const byOrg = eq(clients.organizacaoId, organizacaoId);
	const variants: TVariant[] = [];

	const legacySearchWhere = and(byOrg, legacySearchCondition(text.trim()));
	variants.push({
		name: "legacy-search",
		plan: staticPlan({
			fuzzyThreshold: false,
			queries: [
				db
					.select({ id: clients.id })
					.from(clients)
					.where(legacySearchWhere)
					.orderBy(...legacySearchOrder(text.trim()))
					.limit(SEARCH_LIMIT),
			],
			countQuery: countOf(legacySearchWhere),
		}),
	});

	const legacyListWhere = and(byOrg, legacyListCondition(text));
	variants.push({
		name: "legacy-list",
		plan: staticPlan({
			fuzzyThreshold: false,
			queries: [
				countOf(legacyListWhere),
				db.select({ id: clients.id }).from(clients).where(legacyListWhere).orderBy(asc(clients.nome), asc(clients.id)).limit(PAGE_SIZE),
			],
			countQuery: countOf(legacyListWhere),
		}),
	});

	const term = parseClientSearchTerm(text);
	if (!term) return variants;
	const planNew = (pageQuery: (where: SQL | undefined, relevance: SQL<number>) => TQuery[]) => async (executor: TExecutor) => {
		const probeStatement = buildClientSearchFuzzyProbe({ organizacaoId, term });
		const probe = probeStatement ? asQuery(probeStatement) : null;
		const [probeRows] = probe ? await runQueries(executor, [probe]) : [];
		const resolved = applyClientSearchFuzzyProbe(term, probeRows?.[0]);
		const search = buildClientSearch(resolved);
		const where = and(byOrg, search.condition);
		return { fuzzyThreshold: clientSearchUsesFuzzy(resolved), queries: pageQuery(where, search.relevance), countQuery: countOf(where), probe };
	};
	variants.push({
		name: "search",
		plan: planNew((where, relevance) => [
			db.select({ id: clients.id }).from(clients).where(where).orderBy(desc(relevance), asc(clients.nome)).limit(SEARCH_LIMIT),
		]),
	});
	variants.push({
		name: "list",
		plan: planNew((where, relevance) => [
			countOf(where),
			db.select({ id: clients.id }).from(clients).where(where).orderBy(desc(relevance), asc(clients.nome), asc(clients.id)).limit(PAGE_SIZE),
		]),
	});
	return variants;
}

// ---------------------------------------------------------------- execução

type TTx = postgres.TransactionSql;
type TExecutor = TTx | typeof connection;
/** Executa um bloco de consultas: na tabela real, com a transação de `withClientSearch`; na simulação, dentro da transação dela. */
type TRunner = <T>(fuzzyThreshold: boolean, run: (executor: TExecutor) => Promise<T>) => Promise<T>;

/** Mesma forma de `withClientSearch`: transação só leitura com o limiar local quando há ramo tolerante. */
const realRunner: TRunner = async (fuzzyThreshold, run) => {
	if (!fuzzyThreshold) return run(connection);
	return (await connection.begin("read only", async (tx) => {
		await tx`select set_config('pg_trgm.word_similarity_threshold', ${String(CLIENT_SEARCH_WORD_THRESHOLD)}, true)`;
		return run(tx);
	})) as Awaited<ReturnType<typeof run>>;
};

async function runQueries(executor: TExecutor, queries: TQuery[], prefix = "") {
	const results = [];
	for (const query of queries) {
		const { sql: text, params } = query.toSQL();
		results.push(await executor.unsafe(`${prefix}${text}`, params as never[]));
	}
	return results;
}

function collectIndexes(node: Record<string, unknown>, into = new Set<string>()) {
	if (typeof node["Index Name"] === "string") into.add(node["Index Name"]);
	for (const child of (node.Plans as Record<string, unknown>[] | undefined) ?? []) collectIndexes(child, into);
	return into;
}

async function measure(variant: TVariant, runs: number, printPlans: boolean, runner: TRunner): Promise<TResult> {
	// Sonda fora de transação, consultas na transação do limiar só se preciso — como em withClientSearch.
	const execute = async (prefix = "") => {
		const planned = await runner(false, (executor) => variant.plan(executor));
		const results = await runner(planned.fuzzyThreshold, (executor) => runQueries(executor, planned.queries, prefix));
		return { planned, results };
	};

	const { planned } = await execute(); // aquecimento
	const [[countRow]] = await runner(planned.fuzzyThreshold, (executor) => runQueries(executor, [planned.countQuery]));

	const walls: number[] = [];
	for (let index = 0; index < runs; index++) {
		const startedAt = performance.now();
		await execute();
		walls.push(performance.now() - startedAt);
	}

	const explain = "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ";
	const plans = (await execute(explain)).results;
	if (planned.probe) plans.push(...(await runner(false, (executor) => runQueries(executor, [planned.probe!], explain))));
	let serverMs = 0;
	const indexes = new Set<string>();
	for (const [row] of plans) {
		const [plan] = row["QUERY PLAN"] as { Plan: Record<string, unknown>; "Execution Time": number }[];
		serverMs += plan["Execution Time"];
		collectIndexes(plan.Plan, indexes);
		if (printPlans) console.log(`\n--- ${variant.name}\n${JSON.stringify(plan.Plan, null, 1).slice(0, 4000)}`);
	}
	return {
		variant: planned.fuzzyThreshold ? `${variant.name} (aprox.)` : variant.name,
		// drizzle não nomeia o `count()` na SQL gerada; a coluna vem como "count".
		matched: Number(Object.values(countRow)[0]),
		wallMedian: percentile(walls, 50),
		wallP95: percentile(walls, 95),
		serverMs,
		indexes: [...indexes],
	};
}

// ---------------------------------------------------------------- simulação de índices

/**
 * Índices candidatos, avaliados sem tocar no esquema: a tabela de clientes é copiada para uma tabela
 * temporária de mesmo nome — que, na sessão, tem precedência sobre `public.ampmais_clients` — e os
 * índices são criados na cópia. Tudo numa transação revertida no fim: nada persiste, e a tabela real
 * só é lida (o mesmo lock de um SELECT). As duas versões são criadas do zero, então a comparação
 * entre elas não sofre com o inchaço que o índice real possa ter.
 */
const SIMULATED_INDEX_SETS: Record<string, string[]> = {
	gist: [
		"create index sim_gist_nome on ampmais_clients using gist (unaccent_immutable(lower(nome)) gist_trgm_ops)",
		"create index sim_gist_telefone on ampmais_clients using gist (telefone_base gist_trgm_ops)",
		"create index sim_gist_email on ampmais_clients using gist (lower(email) gist_trgm_ops)",
	],
	gin: [
		"create index sim_gin_nome on ampmais_clients using gin (unaccent_immutable(lower(nome)) gin_trgm_ops)",
		"create index sim_gin_telefone on ampmais_clients using gin (telefone_base gin_trgm_ops)",
		"create index sim_gin_email on ampmais_clients using gin (lower(email) gin_trgm_ops)",
		"create index sim_gin_documento on ampmais_clients using gin (regexp_replace(coalesce(cpf_cnpj, ''), '[^0-9]', '', 'g') gin_trgm_ops)",
	],
};

const ROLLBACK = new Error("ROLLBACK");

async function withSimulatedIndexes(set: string, run: (runner: TRunner) => Promise<void>) {
	const ddl = SIMULATED_INDEX_SETS[set];
	if (!ddl) throw new Error(`Conjunto de índices desconhecido: ${set} (disponíveis: ${Object.keys(SIMULATED_INDEX_SETS).join(", ")})`);
	await connection
		.begin(async (tx) => {
			await tx`create temp table ampmais_clients on commit drop as
				select id, organizacao_id, nome, telefone_base, email, cpf_cnpj from public.ampmais_clients`;
			await tx`create index sim_org on ampmais_clients (organizacao_id)`;
			for (const statement of ddl) await tx.unsafe(statement);
			await tx`analyze ampmais_clients`;
			await tx`select set_config('pg_trgm.word_similarity_threshold', ${String(CLIENT_SEARCH_WORD_THRESHOLD)}, true)`;
			await run((_fuzzyThreshold, query) => query(tx));
			throw ROLLBACK;
		})
		.catch((error) => {
			if (error !== ROLLBACK) throw error;
		});
}

// ---------------------------------------------------------------- termos

function dropLetter(word: string) {
	if (word.length < 5) return word;
	const at = Math.floor(word.length / 2);
	return word.slice(0, at) + word.slice(at + 1);
}

/** Termos tirados dos clientes da própria organização, para medir casos que de fato existem. */
async function sampleTerms(organizacaoId: string) {
	const people = await connection<{ nome: string }[]>`
		select nome from ampmais_clients
		where organizacao_id = ${organizacaoId} and nome ~ '^\\S{3,}\\s+\\S+\\s+\\S{3,}'
		order by md5(id) limit 2`;
	const [contact] = await connection<{ telefone_base: string | null; cpf_cnpj: string | null; email: string | null }[]>`
		select telefone_base, cpf_cnpj, email from ampmais_clients
		where organizacao_id = ${organizacaoId} and telefone_base ~ '^[0-9]{10,11}$'
		order by (cpf_cnpj is not null and email is not null) desc, md5(id) limit 1`;
	const [frequent] = await connection<{ first: string }[]>`
		select split_part(nome, ' ', 1) as first from ampmais_clients
		where organizacao_id = ${organizacaoId} and length(split_part(nome, ' ', 1)) >= 3
		group by 1 order by count(*) desc limit 1`;

	const terms: { kind: string; text: string }[] = [];
	for (const person of people) {
		const words = person.nome.trim().split(/\s+/);
		const [first, last] = [words[0], words[words.length - 1]];
		terms.push({ kind: "nome sem o do meio", text: `${first} ${last}` });
		terms.push({ kind: "nome invertido", text: `${last} ${first}` });
		// O erro vai na palavra mais longa: em nomes curtos ("Joao") tirar uma letra não muda nada.
		terms.push({ kind: "erro de digitação", text: first.length >= last.length ? `${dropLetter(first)} ${last}` : `${first} ${dropLetter(last)}` });
	}
	if (frequent) {
		terms.push({ kind: "nome mais comum", text: frequent.first });
		terms.push({ kind: "3 letras", text: frequent.first.slice(0, 3) });
	}
	terms.push({ kind: "2 letras", text: "ma" });
	if (contact?.telefone_base) {
		terms.push({ kind: "final do telefone", text: contact.telefone_base.slice(-4) });
		terms.push({ kind: "telefone com máscara", text: formatToPhone(contact.telefone_base) });
	}
	if (contact?.cpf_cnpj) terms.push({ kind: "CPF parcial", text: formatStringAsOnlyDigits(contact.cpf_cnpj).slice(0, 6) });
	if (contact?.email) terms.push({ kind: "e-mail parcial", text: contact.email.split("@")[0] });
	terms.push({ kind: "inexistente", text: "Zzyqx Wvbnk" });
	return terms;
}

// ---------------------------------------------------------------- main

async function resolveOrganization(idOrSlug: string) {
	const organization = await db.query.organizations.findFirst({
		where: or(eq(organizations.id, idOrSlug), eq(organizations.slug, idOrSlug)),
		columns: { id: true, nome: true },
	});
	if (!organization) throw new Error(`Organização não encontrada: ${idOrSlug}`);
	const [{ total }] = await db.select({ total: count() }).from(clients).where(eq(clients.organizacaoId, organization.id));
	return { ...organization, clientsCount: total };
}

type TBenchmarkTarget = { organization: Awaited<ReturnType<typeof resolveOrganization>>; terms: { kind: string; text: string }[] };
type TScenarioResult = TResult & { scenario: string; org: string; term: string };

async function runScenario(scenario: string, targets: TBenchmarkTarget[], runs: number, printPlans: boolean, runner: TRunner) {
	const results: TScenarioResult[] = [];
	for (const { organization, terms } of targets) {
		for (const term of terms) {
			for (const variant of buildVariants(organization.id, term.text)) {
				const result = await measure(variant, runs, printPlans, runner);
				results.push({ ...result, scenario, org: organization.id, term: term.text });
			}
		}
		console.log(`  ${scenario}: ${organization.nome} concluída`);
	}
	return results;
}

async function main() {
	const runs = Number(readFlags("runs")[0] ?? 5);
	const printPlans = hasFlag("plans");
	const orgArgs = readFlags("org");
	const customTerms = readFlags("term");
	const simulatedSets = readFlags("simulate").flatMap((value) => value.split(","));

	const rtt: number[] = [];
	for (let index = 0; index < 5; index++) {
		const startedAt = performance.now();
		await connection`select 1`;
		rtt.push(performance.now() - startedAt);
	}
	console.log(
		`Ida e volta ao banco (select 1): ${percentile(rtt, 50).toFixed(1)} ms — o tempo de parede inclui uma por consulta, mais três na transação do limiar.`,
	);

	const targets: TBenchmarkTarget[] = [];
	for (const idOrSlug of orgArgs.length > 0 ? orgArgs : DEFAULT_ORGS) {
		const organization = await resolveOrganization(idOrSlug);
		const terms = customTerms.length > 0 ? customTerms.map((text) => ({ kind: "informado", text })) : await sampleTerms(organization.id);
		targets.push({ organization, terms });
	}

	const results: TScenarioResult[] = [];
	results.push(...(await runScenario("atual", targets, runs, printPlans, realRunner)));
	for (const set of simulatedSets) {
		await withSimulatedIndexes(set, async (runner) => {
			results.push(...(await runScenario(`sim:${set}`, targets, runs, printPlans, runner)));
		});
	}

	for (const { organization, terms } of targets) {
		console.log(`\n=== ${organization.nome} (${organization.clientsCount} clientes)`);
		for (const term of terms) {
			console.log(`\n"${term.text}" — ${term.kind}`);
			console.table(
				results
					.filter((result) => result.org === organization.id && result.term === term.text)
					.map((result) => ({
						índices: result.scenario,
						variante: result.variant,
						encontrados: result.matched,
						"parede mediana": `${result.wallMedian.toFixed(1)} ms`,
						"parede p95": `${result.wallP95.toFixed(1)} ms`,
						servidor: `${result.serverMs.toFixed(1)} ms`,
						"índices usados": result.indexes.join(", ") || "(varredura)",
					})),
			);
		}
	}

	console.log("\n=== Resumo (tempo de execução no servidor, todas as organizações e termos)");
	const grouped = new Map<string, number[]>();
	for (const result of results) {
		const key = `${result.scenario} · ${result.variant}`;
		grouped.set(key, [...(grouped.get(key) ?? []), result.serverMs]);
	}
	console.table(
		[...grouped].map(([key, values]) => ({
			"índices · variante": key,
			mediana: `${percentile(values, 50).toFixed(1)} ms`,
			p95: `${percentile(values, 95).toFixed(1)} ms`,
			máximo: `${Math.max(...values).toFixed(1)} ms`,
		})),
	);
	if (simulatedSets.length > 0) console.log("Na simulação o tempo de parede não inclui abrir/fechar transação: compare pelo tempo de servidor.");
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
