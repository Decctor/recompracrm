import "@/utils/scripts/load-next-env";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { formatPhoneAsBase, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { isValidCpfCnpj } from "@/lib/validation";
import { connection, db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions, clients } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as XLSX from "xlsx";

/**
 * Importa o saldo de pontos exportado do app de fidelidade anterior da Fran Farma para o programa
 * de cashback da organização.
 *
 * A planilha é um retrato de saldo (cpf, consumidor_nome, celular, saldo de pontos), sem histórico,
 * então cada cliente recebe UM ACÚMULO avulso (sem venda) com o saldo convertido, marcado com
 * `metadados.importacao = IMPORT_TAG`. O programa da org é em PONTOS com a regra do app anterior
 * (1 real gasto = 1 ponto, ou seja, PERCENTUAL 100), então o saldo entra como veio. `--taxa` (unidades
 * do programa por ponto da planilha) só é obrigatória num programa em DINHEIRO: converter pontos em
 * reais é decisão comercial e não tem default.
 *
 * Match, nesta ordem:
 * 1. CPF/CNPJ normalizado (o Excel comeu os zeros à esquerda: CPF volta para 11 dígitos, CNPJ para
 *    14). Quando o mesmo documento tem mais de um cliente no CRM (cadastro do CRM + cadastro do ERP),
 *    o saldo vai para o canônico — ver `pickCanonicalClient` — e a linha sai marcada no relatório.
 * 2. Telefone, só para cliente do CRM SEM documento e com nome compatível. Telefone sozinho não
 *    identifica ninguém aqui: na base, o mesmo celular aparece em vários membros da família, e um
 *    cliente do CRM com OUTRO CPF é, por definição, outra pessoa.
 * Celular sem DDD (8–9 dígitos) não é usado.
 *
 * Reexecução ("reset"): antes de importar, todo ACÚMULO com a marca de importação é removido e o
 * saldo do cliente é devolvido ao que era sem ele. Rodar de novo com a exportação do dia da virada
 * substitui a carga de teste, sem somar. O reset recusa ACÚMULOs importados que já foram
 * consumidos ou expirados — isso significa que a virada já aconteceu e reimportar duplicaria pontos.
 *
 * Uso:
 *   node --conditions=react-server --import tsx scripts/import-franfarma-points.ts \
 *     --file ./pontos-franfarma.xlsx [--validade-dias 90] [--sem-criar-clientes] [--taxa N] [--apply]
 *
 * Linhas sem match viram clientes novos (CPF, nome e celular com DDD), salvo com --sem-criar-clientes.
 * Sem --apply, só gera o relatório de match (CSV + resumo) em scripts/output/franfarma-points/.
 */

const ORGANIZATION_ID = "76e37c1c-927b-4f2c-88e5-104f07aa836a"; // Fran Farma
const IMPORT_TAG = "FRANFARMA_PONTOS";
const BATCH_SIZE = 500;
const OUTPUT_DIR = path.join("scripts", "output", "franfarma-points");
// Validade dos pontos migrados, contada da importação. Independe da regra do programa de propósito:
// a carga inteira vence no mesmo dia, e o prazo dela é decisão da migração.
const DEFAULT_VALIDITY_DAYS = 90;

type TArgs = {
	file: string;
	rate: number;
	validityDays: number;
	createMissingClients: boolean;
	apply: boolean;
};

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const inline = process.argv.find((arg) => arg.startsWith(prefix));
	if (inline) return inline.slice(prefix.length);
	const index = process.argv.indexOf(`--${name}`);
	if (index >= 0) return process.argv[index + 1] ?? null;
	return null;
}

function parseArgs(terminology: string): TArgs {
	const file = getArgValue("file");
	if (!file) throw new Error("Informe --file <planilha.xlsx>.");

	const rateRaw = getArgValue("taxa");
	if (!rateRaw && terminology !== "PONTOS") {
		throw new Error(
			"O programa está em DINHEIRO: informe --taxa <reais por ponto> (ex.: --taxa 0.01 para 100 pontos = R$ 1,00). Não há default: é decisão comercial.",
		);
	}
	const rate = rateRaw ? Number(rateRaw) : 1;
	if (!Number.isFinite(rate) || rate <= 0) throw new Error("--taxa precisa ser um número positivo.");

	const validityRaw = getArgValue("validade-dias");
	const validityDays = validityRaw ? Number(validityRaw) : DEFAULT_VALIDITY_DAYS;
	if (!Number.isInteger(validityDays) || validityDays <= 0) throw new Error("--validade-dias precisa ser um inteiro positivo.");

	return {
		file,
		rate,
		validityDays,
		createMissingClients: !process.argv.includes("--sem-criar-clientes"),
		apply: process.argv.includes("--apply"),
	};
}

// ---------------------------------------------------------------------------------------------
// Planilha
// ---------------------------------------------------------------------------------------------

type TSheetRow = {
	line: number;
	document: string; // só dígitos, zeros à esquerda restaurados
	name: string;
	phoneDigits: string;
	points: number;
};

function restoreDocumentDigits(raw: unknown) {
	const digits = String(raw ?? "").replace(/\D/g, "");
	if (!digits) return "";
	// Coluna numérica no Excel: CPF que começa com zero perde os zeros. 12–14 dígitos só pode ser CNPJ.
	return digits.length <= 11 ? digits.padStart(11, "0") : digits.padStart(14, "0");
}

function readSheet(file: string): TSheetRow[] {
	const workbook = XLSX.read(readFileSync(file));
	const sheet = workbook.Sheets[workbook.SheetNames[0]];
	const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
	const header = (rows[0] ?? []).map((cell) => String(cell ?? "").trim().toLowerCase());
	const expected = ["cpf", "consumidor_nome", "celular", "saldo de pontos"];
	if (expected.some((column, index) => header[index] !== column)) {
		throw new Error(`Cabeçalho inesperado: ${JSON.stringify(header)}. Esperado: ${JSON.stringify(expected)}.`);
	}

	return rows
		.slice(1)
		.map((row, index) => ({
			line: index + 2,
			document: restoreDocumentDigits(row[0]),
			name: String(row[1] ?? "").trim(),
			phoneDigits: String(row[2] ?? "").replace(/\D/g, ""),
			points: Number(row[3] ?? 0),
		}))
		.filter((row) => row.document || row.name);
}

// ---------------------------------------------------------------------------------------------
// Match
// ---------------------------------------------------------------------------------------------

type TCrmClient = {
	id: string;
	nome: string;
	cpfCnpj: string | null;
	telefoneBase: string;
	idExterno: string | null;
	totalCompras: number;
	ultimaCompraData: Date | null;
	dataInsercao: Date | null;
};

type TMatchMethod = "CPF" | "CPF_DUPLICADO_CRM" | "TELEFONE_NOME" | "NOVO_CLIENTE" | "SEM_MATCH";

type TMatch = {
	row: TSheetRow;
	method: TMatchMethod;
	client: TCrmClient | null;
	candidates: TCrmClient[];
	alerts: string[];
};

function nameTokens(name: string) {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.replace(/[^A-Z ]/g, " ")
		.split(/\s+/)
		.filter((token) => token.length > 2);
}

/** Fração dos tokens do nome mais curto presentes no outro (0–1). */
function nameOverlap(a: string, b: string) {
	const tokensA = new Set(nameTokens(a));
	const tokensB = new Set(nameTokens(b));
	if (!tokensA.size || !tokensB.size) return 0;
	let shared = 0;
	for (const token of tokensA) if (tokensB.has(token)) shared++;
	return shared / Math.min(tokensA.size, tokensB.size);
}

/** Mesmo primeiro nome e maioria dos tokens em comum: o bastante para aceitar um match por telefone. */
function namesLookLikeSamePerson(a: string, b: string) {
	const [firstA] = nameTokens(a);
	const [firstB] = nameTokens(b);
	return !!firstA && firstA === firstB && nameOverlap(a, b) >= 0.6;
}

/**
 * Entre clientes do CRM com o mesmo documento, o canônico é o que recebe as vendas: o cadastro do
 * ERP (`idExterno`), depois quem mais comprou, comprou por último e, por fim, o cadastro mais antigo.
 * O merge de clientes consolida saldo, então a escolha só importa até a deduplicação.
 */
function pickCanonicalClient(candidates: TCrmClient[]) {
	return [...candidates].sort((a, b) => {
		if (!!a.idExterno !== !!b.idExterno) return a.idExterno ? -1 : 1;
		if (a.totalCompras !== b.totalCompras) return b.totalCompras - a.totalCompras;
		const lastA = a.ultimaCompraData?.getTime() ?? 0;
		const lastB = b.ultimaCompraData?.getTime() ?? 0;
		if (lastA !== lastB) return lastB - lastA;
		return (a.dataInsercao?.getTime() ?? 0) - (b.dataInsercao?.getTime() ?? 0);
	})[0];
}

function pushToIndex<T>(index: Map<string, T[]>, key: string, value: T) {
	const list = index.get(key);
	if (list) list.push(value);
	else index.set(key, [value]);
}

function matchRows(rows: TSheetRow[], crmClients: TCrmClient[]): TMatch[] {
	const byDocument = new Map<string, TCrmClient[]>();
	const byPhone = new Map<string, TCrmClient[]>();
	for (const client of crmClients) {
		const document = restoreDocumentDigits(client.cpfCnpj);
		if (document) pushToIndex(byDocument, document, client);
		if (client.telefoneBase) pushToIndex(byPhone, client.telefoneBase, client);
	}

	return rows.map((row) => {
		const alerts: string[] = [];
		if (!isValidCpfCnpj(row.document)) alerts.push("DOCUMENTO_INVALIDO");

		const documentHits = byDocument.get(row.document) ?? [];
		if (documentHits.length > 0) {
			const client = pickCanonicalClient(documentHits);
			if (nameOverlap(row.name, client.nome) < 0.5) alerts.push("NOME_DIVERGENTE");
			return {
				row,
				method: documentHits.length > 1 ? "CPF_DUPLICADO_CRM" : "CPF",
				client,
				candidates: documentHits,
				alerts,
			};
		}

		if (row.phoneDigits.length >= 10) {
			const phoneHits = (byPhone.get(formatPhoneAsBase(row.phoneDigits)) ?? []).filter(
				(client) => !restoreDocumentDigits(client.cpfCnpj) && namesLookLikeSamePerson(row.name, client.nome),
			);
			if (phoneHits.length === 1) return { row, method: "TELEFONE_NOME", client: phoneHits[0], candidates: phoneHits, alerts };
			if (phoneHits.length > 1) alerts.push("TELEFONE_AMBIGUO");
		}

		return { row, method: "SEM_MATCH", client: null, candidates: [], alerts };
	});
}

// ---------------------------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------------------------

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function csvCell(value: unknown) {
	const text = value === null || value === undefined ? "" : String(value);
	return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeReport(matches: TMatch[], args: TArgs) {
	mkdirSync(OUTPUT_DIR, { recursive: true });
	const stamp = dayjs().format("YYYYMMDD-HHmmss");

	const header = ["linha", "documento", "nome", "celular", "pontos_planilha", "valor_importado", "metodo", "cliente_id", "cliente_nome", "cliente_documento", "clientes_mesmo_documento", "alertas"];
	const lines = matches.map((match) =>
		[
			match.row.line,
			formatToCPForCNPJ(match.row.document),
			match.row.name,
			match.row.phoneDigits,
			match.row.points.toFixed(2).replace(".", ","),
			roundMoney(match.row.points * args.rate).toFixed(2).replace(".", ","),
			match.method,
			match.client?.id,
			match.client?.nome,
			match.client?.cpfCnpj,
			match.candidates.length > 1 ? match.candidates.map((client) => client.id).join(" | ") : "",
			match.alerts.join(" | "),
		]
			.map(csvCell)
			.join(";"),
	);
	const csvPath = path.join(OUTPUT_DIR, `match-${stamp}.csv`);
	// BOM para o Excel abrir acentos corretamente.
	writeFileSync(csvPath, `﻿${[header.join(";"), ...lines].join("\n")}`);

	const totalPoints = matches.reduce((sum, match) => sum + match.row.points, 0);
	const summary: Record<string, { linhas: number; pctLinhas: string; pontos: number; pctPontos: string; valorImportado: number }> = {};
	for (const match of matches) {
		const entry = (summary[match.method] ??= { linhas: 0, pctLinhas: "", pontos: 0, pctPontos: "", valorImportado: 0 });
		entry.linhas++;
		entry.pontos += match.row.points;
	}
	for (const entry of Object.values(summary)) {
		entry.pctLinhas = `${((100 * entry.linhas) / matches.length).toFixed(1)}%`;
		entry.pctPontos = `${((100 * entry.pontos) / totalPoints).toFixed(1)}%`;
		entry.valorImportado = roundMoney(entry.pontos * args.rate);
		entry.pontos = roundMoney(entry.pontos);
	}

	const alertCounts: Record<string, number> = {};
	for (const match of matches) for (const alert of match.alerts) alertCounts[alert] = (alertCounts[alert] ?? 0) + 1;

	const matched = matches.filter((match) => match.client);
	const toCreate = args.createMissingClients ? matches.filter((match) => match.method === "SEM_MATCH" && match.row.document && match.row.name).length : 0;
	const report = {
		arquivo: path.resolve(args.file),
		taxa: args.rate,
		validadeDias: args.validityDays,
		linhas: matches.length,
		pontosTotal: roundMoney(totalPoints),
		valorTotalImportado: roundMoney(totalPoints * args.rate),
		clientesNovosACriar: toCreate,
		matchRateLinhas: `${((100 * matched.length) / matches.length).toFixed(1)}%`,
		matchRatePontos: `${((100 * matched.reduce((sum, match) => sum + match.row.points, 0)) / totalPoints).toFixed(1)}%`,
		porMetodo: summary,
		alertas: alertCounts,
		csv: path.resolve(csvPath),
	};
	writeFileSync(path.join(OUTPUT_DIR, `match-${stamp}.json`), JSON.stringify(report, null, 2));
	return report;
}

// ---------------------------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------------------------

async function loadProgram() {
	const program = await db.query.cashbackPrograms.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.organizacaoId, ORGANIZATION_ID), eq(fields.ativo, true)),
	});
	if (!program) throw new Error("A organização não tem programa de cashback ativo.");
	return program;
}

async function loadCrmClients(): Promise<TCrmClient[]> {
	const rows = await db
		.select({
			id: clients.id,
			nome: clients.nome,
			cpfCnpj: clients.cpfCnpj,
			telefoneBase: clients.telefoneBase,
			idExterno: clients.idExterno,
			totalCompras: clients.metadataTotalCompras,
			ultimaCompraData: clients.ultimaCompraData,
			dataInsercao: clients.dataInsercao,
		})
		.from(clients)
		.where(eq(clients.organizacaoId, ORGANIZATION_ID));
	return rows.map((row) => ({ ...row, totalCompras: row.totalCompras ?? 0 }));
}

function chunk<T>(items: T[], size: number) {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
	return chunks;
}

const importedTransactionFilter = (programId: string) =>
	and(
		eq(cashbackProgramTransactions.organizacaoId, ORGANIZATION_ID),
		eq(cashbackProgramTransactions.programaId, programId),
		eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
		sql`${cashbackProgramTransactions.metadados}->>'importacao' = ${IMPORT_TAG}`,
	);

/** Soma `deltas` aos saldos, arredondando para centavos (evita resíduo de ponto flutuante). */
async function applyBalanceDeltas(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	programId: string,
	deltas: { clientId: string; available: number; accumulated: number }[],
) {
	if (deltas.length === 0) return;
	const values = sql.join(
		deltas.map((delta) => sql`(${delta.clientId}::varchar, ${delta.available}::double precision, ${delta.accumulated}::double precision)`),
		sql`, `,
	);
	await tx.execute(sql`
		update ${cashbackProgramBalances} as b
		set saldo_valor_disponivel = round((b.saldo_valor_disponivel + v.available)::numeric, 2)::double precision,
			saldo_valor_acumulado_total = round((b.saldo_valor_acumulado_total + v.accumulated)::numeric, 2)::double precision,
			data_atualizacao = now()
		from (values ${values}) as v(cliente_id, available, accumulated)
		where b.organizacao_id = ${ORGANIZATION_ID} and b.programa_id = ${programId} and b.cliente_id = v.cliente_id
	`);
}

/** Remove a carga anterior. Ver o cabeçalho: recusa se algum ACÚMULO importado já foi tocado. */
async function resetPreviousImport(programId: string) {
	const previous = await db
		.select({
			id: cashbackProgramTransactions.id,
			clienteId: cashbackProgramTransactions.clienteId,
			status: cashbackProgramTransactions.status,
			valor: cashbackProgramTransactions.valor,
			valorRestante: cashbackProgramTransactions.valorRestante,
		})
		.from(cashbackProgramTransactions)
		.where(importedTransactionFilter(programId));

	const touched = previous.filter((row) => row.status !== "ATIVO" || Math.abs(row.valor - row.valorRestante) > 0.001);
	if (touched.length > 0) {
		throw new Error(
			`${touched.length} acúmulo(s) importado(s) já foram consumidos ou expirados (ex.: ${touched.slice(0, 3).map((row) => row.id).join(", ")}). A virada já aconteceu; reimportar duplicaria pontos. Nada foi alterado.`,
		);
	}
	if (previous.length === 0) return 0;

	for (const batch of chunk(previous, BATCH_SIZE)) {
		await db.transaction(async (tx) => {
			await tx.delete(cashbackProgramTransactions).where(inArray(cashbackProgramTransactions.id, batch.map((row) => row.id)));
			await applyBalanceDeltas(
				tx,
				programId,
				batch.map((row) => ({ clientId: row.clienteId, available: -row.valorRestante, accumulated: -row.valor })),
			);
		});
	}
	return previous.length;
}

async function createMissingClients(matches: TMatch[]) {
	const missing = matches.filter((match) => match.method === "SEM_MATCH" && match.row.document && match.row.name);
	for (const batch of chunk(missing, BATCH_SIZE)) {
		const inserted = await db
			.insert(clients)
			.values(
				batch.map((match) => {
					// Celular sem DDD não é gravado: não dá para garantir o número.
					const phoneBase = match.row.phoneDigits.length >= 10 ? formatPhoneAsBase(match.row.phoneDigits) : "";
					return {
						organizacaoId: ORGANIZATION_ID,
						nome: match.row.name,
						cpfCnpj: formatToCPForCNPJ(match.row.document),
						telefone: phoneBase ? formatToPhone(match.row.phoneDigits) : "",
						telefoneBase: phoneBase,
						canalAquisicao: "IMPORTAÇÃO APP FIDELIDADE ANTERIOR",
					};
				}),
			)
			.returning({ id: clients.id, nome: clients.nome, cpfCnpj: clients.cpfCnpj });

		batch.forEach((match, index) => {
			const client = inserted[index];
			match.method = "NOVO_CLIENTE";
			match.client = { ...client, telefoneBase: "", idExterno: null, totalCompras: 0, ultimaCompraData: null, dataInsercao: new Date() };
		});
	}
	return missing.length;
}

async function importBalances(matches: TMatch[], args: TArgs, program: Awaited<ReturnType<typeof loadProgram>>) {
	// Duas linhas da planilha podem cair no mesmo cliente (ex.: documento + telefone): soma.
	const byClient = new Map<string, { points: number; documents: string[]; lines: number[] }>();
	for (const match of matches) {
		if (!match.client) continue;
		const entry = byClient.get(match.client.id) ?? { points: 0, documents: [], lines: [] };
		entry.points += match.row.points;
		entry.documents.push(match.row.document);
		entry.lines.push(match.row.line);
		byClient.set(match.client.id, entry);
	}

	const now = new Date();
	const validityDays = args.validityDays;
	const expiresAt = dayjs(now).add(validityDays, "day").toDate();
	const entries = [...byClient.entries()]
		.map(([clientId, entry]) => ({ clientId, ...entry, value: roundMoney(entry.points * args.rate) }))
		.filter((entry) => entry.value > 0);

	let processed = 0;
	for (const batch of chunk(entries, BATCH_SIZE)) {
		await db.transaction(async (tx) => {
			await tx
				.insert(cashbackProgramBalances)
				.values(batch.map((entry) => ({ organizacaoId: ORGANIZATION_ID, clienteId: entry.clientId, programaId: program.id })))
				.onConflictDoNothing();

			const balances = await tx
				.select({ clienteId: cashbackProgramBalances.clienteId, saldo: cashbackProgramBalances.saldoValorDisponivel })
				.from(cashbackProgramBalances)
				.where(
					and(
						eq(cashbackProgramBalances.organizacaoId, ORGANIZATION_ID),
						eq(cashbackProgramBalances.programaId, program.id),
						inArray(cashbackProgramBalances.clienteId, batch.map((entry) => entry.clientId)),
					),
				);
			const balanceByClient = new Map(balances.map((balance) => [balance.clienteId, balance.saldo]));

			await tx.insert(cashbackProgramTransactions).values(
				batch.map((entry) => {
					const previous = balanceByClient.get(entry.clientId) ?? 0;
					return {
						organizacaoId: ORGANIZATION_ID,
						clienteId: entry.clientId,
						programaId: program.id,
						tipo: "ACÚMULO" as const,
						status: "ATIVO" as const,
						valor: entry.value,
						valorRestante: entry.value,
						saldoValorAnterior: previous,
						saldoValorPosterior: roundMoney(previous + entry.value),
						expiracaoData: expiresAt,
						dataInsercao: now,
						metadados: {
							importacao: IMPORT_TAG,
							pontosOrigem: roundMoney(entry.points),
							taxa: args.rate,
							documentosOrigem: entry.documents,
							linhasPlanilha: entry.lines,
							arquivo: path.basename(args.file),
						},
					};
				}),
			);

			await applyBalanceDeltas(
				tx,
				program.id,
				batch.map((entry) => ({ clientId: entry.clientId, available: entry.value, accumulated: entry.value })),
			);
		});
		processed += batch.length;
		console.log(`  ${processed}/${entries.length} clientes creditados`);
	}

	return { clients: entries.length, total: roundMoney(entries.reduce((sum, entry) => sum + entry.value, 0)), expiresAt, validityDays };
}

async function verify(programId: string) {
	const [row] = (await db.execute(sql`
		with imported as (
			select cliente_id, sum(valor) as valor
			from ${cashbackProgramTransactions}
			where organizacao_id = ${ORGANIZATION_ID} and programa_id = ${programId} and tipo = 'ACÚMULO' and metadados->>'importacao' = ${IMPORT_TAG}
			group by cliente_id
		), ledger as (
			select cliente_id, sum(valor_restante) filter (where tipo = 'ACÚMULO' and status = 'ATIVO') as restante
			from ${cashbackProgramTransactions}
			where organizacao_id = ${ORGANIZATION_ID} and programa_id = ${programId}
			group by cliente_id
		)
		select
			(select count(*) from imported) as clientes_importados,
			(select round(sum(valor)::numeric, 2) from imported) as valor_importado,
			(select count(*) from ${cashbackProgramBalances} b left join ledger l using (cliente_id)
				where b.organizacao_id = ${ORGANIZATION_ID} and b.programa_id = ${programId}
				and abs(b.saldo_valor_disponivel - coalesce(l.restante, 0)) > 0.01) as saldos_divergentes_do_ledger
	`)) as unknown as Record<string, unknown>[];
	return row;
}

async function main() {
	const program = await loadProgram();
	const args = parseArgs(program.terminologia);
	console.log(
		`Programa: ${program.titulo} (${program.terminologia}, acúmulo ${program.acumuloTipo} ${program.acumuloValor}, validade ${program.expiracaoRegraValidadeValor} dias)`,
	);
	console.log(`Carga: taxa ${args.rate}, validade ${args.validityDays} dias, ${args.createMissingClients ? "cria" : "não cria"} clientes sem match`);
	if (program.terminologia === "PONTOS" && program.modalidadeDescontosPermitida) {
		// Em PONTOS o resgate como desconto trata 1 ponto como R$ 1,00 (describeCashbackDiscount). Com
		// acúmulo de 1 ponto por real, a carga viraria desconto de real por real.
		throw new Error("O programa está em PONTOS com resgate como desconto ligado (1 ponto = R$ 1,00). Desligue os descontos antes de importar.");
	}

	const rows = readSheet(args.file);
	const crmClients = await loadCrmClients();
	console.log(`Planilha: ${rows.length} linhas | CRM: ${crmClients.length} clientes`);

	const matches = matchRows(rows, crmClients);
	const report = writeReport(matches, args);
	console.log(JSON.stringify(report, null, 2));

	if (!args.apply) {
		console.log("\nDry-run: nada foi gravado. Rode com --apply para importar.");
		return;
	}

	console.log("\nRemovendo carga anterior...");
	const removed = await resetPreviousImport(program.id);
	console.log(`  ${removed} acúmulo(s) importado(s) removido(s)`);

	if (args.createMissingClients) {
		const created = await createMissingClients(matches);
		console.log(`  ${created} cliente(s) criado(s) para linhas sem match`);
	}

	console.log("Importando saldos...");
	const result = await importBalances(matches, args, program);
	console.log(`  ${result.clients} clientes, ${result.total.toFixed(2)} ${program.terminologia === "PONTOS" ? "pontos" : "reais"}, validade ${result.validityDays} dias (até ${dayjs(result.expiresAt).format("DD/MM/YYYY")})`);

	console.log("Conferência:", await verify(program.id));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
