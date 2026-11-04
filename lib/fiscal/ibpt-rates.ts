import { db } from "@/services/drizzle";
import { fiscalIbptRates, organizations } from "@/services/drizzle/schema";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";

const IBPT_API_BASE_URL = "https://api-ibpt.seunegocionanuvem.com.br/api_ibpt_json.php";
const IBPT_MINIMUM_NCM_ROWS = 10_000;
const IBPT_INSERT_CHUNK_SIZE = 1_000;
const IBPT_REQUEST_TIMEOUT_MS = 20_000;

export const IBPT_REFRESH_MAX_RETRIES = 3;
export const IBPT_REFRESH_RETRY_BASE_DELAY_MS = 1_000;

// How long emission keeps using the installed table after it expires. IBPT usually publishes the
// next table around the 20th, before the current one ends, but it has run late: 26.2.B ended on
// 31/10/2026 with no successor published on any source. A UF only ever has one installed version,
// so filtering strictly by validity zeroed vTotTrib on every note instead of using the last
// published values. Past the grace window the table counts as abandoned and stops being used; the
// daily cron alert reports the deadline until then.
export const IBPT_EXPIRED_TABLE_GRACE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export const IBPT_UFS = [
	"AC",
	"AL",
	"AP",
	"AM",
	"BA",
	"CE",
	"DF",
	"ES",
	"GO",
	"MA",
	"MT",
	"MS",
	"MG",
	"PA",
	"PB",
	"PR",
	"PE",
	"PI",
	"RJ",
	"RN",
	"RS",
	"RO",
	"RR",
	"SC",
	"SP",
	"SE",
	"TO",
] as const;

export type TIbptUf = (typeof IBPT_UFS)[number];
type TIbptInsert = typeof fiscalIbptRates.$inferInsert;

type TIbptApiItem = {
	codigo?: unknown;
	ex?: unknown;
	tipo?: unknown;
	descricao?: unknown;
	nacionalfederal?: unknown;
	importadosfederal?: unknown;
	estadual?: unknown;
	municipal?: unknown;
	vigenciainicio?: unknown;
	vigenciafim?: unknown;
	chave?: unknown;
	versao?: unknown;
	fonte?: unknown;
};

type TIbptApiPayload = {
	versao?: unknown;
	uf?: unknown;
	total?: unknown;
	ncm?: unknown;
};

export type TIbptTableSnapshot = {
	uf: TIbptUf;
	versao: string;
	vigenciaInicio: Date;
	vigenciaFim: Date;
	rows: TIbptInsert[];
};

export type TIbptRefreshSuccess = {
	uf: TIbptUf;
	status: "ATUALIZADA" | "SEM_ALTERACAO" | "VALIDADA";
	tentativas: number;
	versao: string;
	vigenciaInicio: Date;
	vigenciaFim: Date;
	registros: number;
};

export type TIbptRefreshFailure = {
	uf: TIbptUf;
	status: "FALHA";
	tentativas: number;
	erro: string;
};

export type TIbptRefreshResult = TIbptRefreshSuccess | TIbptRefreshFailure;

function parseString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const parsed = String(value).trim();
	return parsed.length > 0 ? parsed : null;
}

function parseRate(value: unknown): number {
	if (value === null || value === undefined || value === "") return 0;
	const raw = String(value).trim();
	const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
	const parsed = Number(normalized);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
		throw new Error(`Alíquota IBPT inválida: ${String(value)}.`);
	}
	return parsed;
}

function parseDateOnly(value: unknown, boundary: "START" | "END"): Date {
	const raw = parseString(value);
	const isoMatch = raw?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	const brMatch = raw?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
	const parts = isoMatch
		? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
		: brMatch
			? { year: Number(brMatch[3]), month: Number(brMatch[2]), day: Number(brMatch[1]) }
			: null;
	if (!parts) throw new Error(`Data de vigência IBPT inválida: ${String(value)}.`);

	const date = new Date(
		Date.UTC(
			parts.year,
			parts.month - 1,
			parts.day,
			boundary === "END" ? 23 : 0,
			boundary === "END" ? 59 : 0,
			boundary === "END" ? 59 : 0,
			boundary === "END" ? 999 : 0,
		),
	);
	if (date.getUTCFullYear() !== parts.year || date.getUTCMonth() !== parts.month - 1 || date.getUTCDate() !== parts.day) {
		throw new Error(`Data de vigência IBPT inválida: ${String(value)}.`);
	}
	return date;
}

export function normalizeIbptUf(value: string | null | undefined): TIbptUf {
	const uf = value?.trim().toUpperCase();
	if (!uf || !IBPT_UFS.includes(uf as TIbptUf)) {
		throw new Error(`UF IBPT inválida: ${value ?? "não informada"}.`);
	}
	return uf as TIbptUf;
}

export function parseIbptApiPayload(
	payload: TIbptApiPayload,
	fallbackUf: TIbptUf,
	options: { minimumRows?: number; now?: Date } = {},
): TIbptTableSnapshot {
	const items = Array.isArray(payload.ncm) ? (payload.ncm as TIbptApiItem[]) : [];
	const uf = normalizeIbptUf(parseString(payload.uf) ?? fallbackUf);
	if (uf !== fallbackUf) throw new Error(`A API IBPT retornou a UF ${uf} ao consultar ${fallbackUf}.`);

	const payloadVersion = parseString(payload.versao);
	const rows = items
		.filter((item) => Number(item.tipo) === 0)
		.map((item) => {
			const ncm = parseString(item.codigo)?.replace(/\D/g, "") ?? "";
			if (!/^\d{8}$/.test(ncm)) throw new Error(`Registro IBPT com NCM inválido: ${String(item.codigo)}.`);
			const versao = parseString(item.versao) ?? payloadVersion;
			if (!versao) throw new Error(`Registro IBPT ${ncm} sem versão.`);

			return {
				ncm,
				uf,
				exTipi: parseString(item.ex),
				descricao: parseString(item.descricao),
				aliqNacionalFederal: parseRate(item.nacionalfederal),
				aliqImportadosFederal: parseRate(item.importadosfederal),
				aliqEstadual: parseRate(item.estadual),
				aliqMunicipal: parseRate(item.municipal),
				versao,
				vigenciaInicio: parseDateOnly(item.vigenciainicio, "START"),
				vigenciaFim: parseDateOnly(item.vigenciafim, "END"),
				chave: parseString(item.chave),
				fonte: parseString(item.fonte),
			};
		});

	const minimumRows = options.minimumRows ?? IBPT_MINIMUM_NCM_ROWS;
	if (rows.length < minimumRows) {
		throw new Error(`Tabela IBPT de ${uf} incompleta: ${rows.length} NCMs; mínimo esperado ${minimumRows}.`);
	}
	const reportedTotal = Number(payload.total);
	if (payload.total != null && Number.isFinite(reportedTotal) && reportedTotal !== items.length) {
		throw new Error(`Resposta IBPT de ${uf} diverge do total informado pela API: ${items.length}/${reportedTotal} registros.`);
	}

	const versions = new Set(rows.map((row) => row.versao));
	const starts = new Set(rows.map((row) => row.vigenciaInicio.getTime()));
	const ends = new Set(rows.map((row) => row.vigenciaFim.getTime()));
	if (versions.size !== 1 || starts.size !== 1 || ends.size !== 1) {
		throw new Error(`Tabela IBPT de ${uf} mistura versões ou períodos de vigência.`);
	}

	const uniqueKeys = new Set<string>();
	for (const row of rows) {
		const key = `${row.ncm}:${row.exTipi ?? ""}`;
		if (uniqueKeys.has(key)) throw new Error(`Tabela IBPT de ${uf} contém NCM/EX duplicado: ${key}.`);
		uniqueKeys.add(key);
	}

	const vigenciaInicio = rows[0].vigenciaInicio;
	const vigenciaFim = rows[0].vigenciaFim;
	if (vigenciaFim < vigenciaInicio) throw new Error(`Tabela IBPT de ${uf} possui vigência invertida.`);
	if (vigenciaFim < (options.now ?? new Date())) throw new Error(`A API IBPT retornou uma tabela vencida para ${uf}.`);

	return {
		uf,
		versao: rows[0].versao!,
		vigenciaInicio,
		vigenciaFim,
		rows,
	};
}

async function fetchIbptTable(uf: TIbptUf, fetcher: typeof fetch = fetch, now = new Date()): Promise<TIbptTableSnapshot> {
	const url = new URL(IBPT_API_BASE_URL);
	url.searchParams.set("uf", uf);
	const response = await fetcher(url, {
		headers: { accept: "application/json" },
		cache: "no-store",
		signal: AbortSignal.timeout(IBPT_REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) throw new Error(`API IBPT retornou HTTP ${response.status} para ${uf}.`);
	return parseIbptApiPayload((await response.json()) as TIbptApiPayload, uf, { now });
}

function formatTimestampSignature(value: Date) {
	return value.toISOString().replace("T", " ").replace("Z", "");
}

async function persistIbptTable(snapshot: TIbptTableSnapshot): Promise<"ATUALIZADA" | "SEM_ALTERACAO"> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ibpt-rates:${snapshot.uf}`}))`);
		const [installed] = await tx
			.select({
				registros: sql<number>`count(*)::int`,
				versoes: sql<number>`count(distinct ${fiscalIbptRates.versao})::int`,
				versao: sql<string | null>`min(${fiscalIbptRates.versao})`,
				vigenciaInicio: sql<string | null>`to_char(min(${fiscalIbptRates.vigenciaInicio}), 'YYYY-MM-DD HH24:MI:SS.MS')`,
				vigenciaFim: sql<string | null>`to_char(max(${fiscalIbptRates.vigenciaFim}), 'YYYY-MM-DD HH24:MI:SS.MS')`,
			})
			.from(fiscalIbptRates)
			.where(eq(fiscalIbptRates.uf, snapshot.uf));

		const unchanged =
			installed.registros === snapshot.rows.length &&
			installed.versoes === 1 &&
			installed.versao === snapshot.versao &&
			installed.vigenciaInicio === formatTimestampSignature(snapshot.vigenciaInicio) &&
			installed.vigenciaFim === formatTimestampSignature(snapshot.vigenciaFim);
		if (unchanged) return "SEM_ALTERACAO";
		if (installed.registros > 0 && installed.vigenciaFim && installed.vigenciaFim > formatTimestampSignature(snapshot.vigenciaFim)) {
			throw new Error(`A API IBPT retornou uma vigência anterior à tabela instalada para ${snapshot.uf}.`);
		}

		await tx.delete(fiscalIbptRates).where(eq(fiscalIbptRates.uf, snapshot.uf));
		for (let index = 0; index < snapshot.rows.length; index += IBPT_INSERT_CHUNK_SIZE) {
			await tx.insert(fiscalIbptRates).values(snapshot.rows.slice(index, index + IBPT_INSERT_CHUNK_SIZE));
		}
		return "ATUALIZADA";
	});
}

// Oldest vigenciaFim emission still accepts at `now`.
export function getIbptUsableVigenciaFimFloor(now: Date) {
	return new Date(now.getTime() - IBPT_EXPIRED_TABLE_GRACE_DAYS * DAY_MS);
}

export type TIbptInstalledTable = { uf: TIbptUf; versao: string | null; vigenciaFim: Date | null };

export type TIbptInstalledTableStatus =
	| { status: "VIGENTE"; versao: string | null; vigenciaFim: Date }
	| { status: "VENCIDA_EM_USO"; versao: string | null; vigenciaFim: Date; usoAte: Date }
	| { status: "INDISPONIVEL"; versao: string | null; vigenciaFim: Date | null };

// What emission is doing for a UF given its installed table. A table without vigenciaFim (manual
// CSV import with an unparseable date) is used indefinitely by emission, so it counts as VIGENTE.
export function resolveIbptInstalledTableStatus(installed: TIbptInstalledTable | null, now: Date): TIbptInstalledTableStatus {
	if (!installed) return { status: "INDISPONIVEL", versao: null, vigenciaFim: null };
	const { versao, vigenciaFim } = installed;
	if (!vigenciaFim || vigenciaFim >= now) return { status: "VIGENTE", versao, vigenciaFim: vigenciaFim ?? now };
	if (vigenciaFim >= getIbptUsableVigenciaFimFloor(now)) {
		return { status: "VENCIDA_EM_USO", versao, vigenciaFim, usoAte: new Date(vigenciaFim.getTime() + IBPT_EXPIRED_TABLE_GRACE_DAYS * DAY_MS) };
	}
	return { status: "INDISPONIVEL", versao, vigenciaFim };
}

// Validity dates are date-only values stored at UTC midnight/end of day.
function formatIbptDate(value: Date) {
	const [year, month, day] = value.toISOString().slice(0, 10).split("-");
	return `${day}/${month}/${year}`;
}

export function describeIbptEmissionImpact(uf: TIbptUf, status: TIbptInstalledTableStatus) {
	const versao = status.versao ? ` (versão ${status.versao})` : "";
	switch (status.status) {
		case "VIGENTE":
			return `${uf}: a tabela instalada${versao} segue vigente até ${formatIbptDate(status.vigenciaFim)}; a emissão não foi afetada.`;
		case "VENCIDA_EM_USO":
			return `${uf}: a tabela instalada${versao} venceu em ${formatIbptDate(status.vigenciaFim)} e segue em uso na emissão até ${formatIbptDate(status.usoAte)}. Depois disso, as notas sairão sem os tributos aproximados (Lei 12.741).`;
		case "INDISPONIVEL":
			return `${uf}: não há tabela IBPT utilizável${status.vigenciaFim ? `; a última instalada${versao} venceu em ${formatIbptDate(status.vigenciaFim)}` : ""}. As notas estão saindo sem os tributos aproximados (Lei 12.741).`;
	}
}

export async function getInstalledIbptTables(ufs: TIbptUf[]): Promise<TIbptInstalledTable[]> {
	if (ufs.length === 0) return [];
	const rows = await db
		.select({
			uf: fiscalIbptRates.uf,
			versao: sql<string | null>`max(${fiscalIbptRates.versao})`,
			vigenciaFim: sql<Date | null>`max(${fiscalIbptRates.vigenciaFim})`.mapWith(fiscalIbptRates.vigenciaFim),
		})
		.from(fiscalIbptRates)
		.where(inArray(fiscalIbptRates.uf, ufs))
		.groupBy(fiscalIbptRates.uf);
	return rows.map((row) => ({ uf: row.uf as TIbptUf, versao: row.versao, vigenciaFim: row.vigenciaFim }));
}

export function getIbptRetryDelayMs(attempt: number) {
	return IBPT_REFRESH_RETRY_BASE_DELAY_MS * 2 ** Math.max(attempt - 1, 0);
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export async function refreshIbptUf({
	uf,
	apply = true,
	maxRetries = IBPT_REFRESH_MAX_RETRIES,
	fetcher = fetch,
	sleepFn = sleep,
	now = new Date(),
}: {
	uf: TIbptUf;
	apply?: boolean;
	maxRetries?: number;
	fetcher?: typeof fetch;
	sleepFn?: (ms: number) => Promise<unknown>;
	now?: Date;
}): Promise<TIbptRefreshResult> {
	let lastError: unknown = null;
	const attempts = Math.max(0, maxRetries) + 1;

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const snapshot = await fetchIbptTable(uf, fetcher, now);
			const status = apply ? await persistIbptTable(snapshot) : "VALIDADA";
			return {
				uf,
				status,
				tentativas: attempt,
				versao: snapshot.versao,
				vigenciaInicio: snapshot.vigenciaInicio,
				vigenciaFim: snapshot.vigenciaFim,
				registros: snapshot.rows.length,
			};
		} catch (error) {
			lastError = error;
			console.error(`[IBPT] Atualização de ${uf} falhou na tentativa ${attempt}/${attempts}: ${errorMessage(error)}`);
			if (attempt < attempts) await sleepFn(getIbptRetryDelayMs(attempt));
		}
	}

	return { uf, status: "FALHA", tentativas: attempts, erro: errorMessage(lastError) };
}

export async function listFiscalIbptUfsInUse(): Promise<TIbptUf[]> {
	const configuredOrganizations = await db.query.organizations.findMany({
		where: isNotNull(organizations.fiscalConfiguracao),
		columns: { fiscalConfiguracao: true },
	});
	const ufs = new Set<TIbptUf>();
	for (const organization of configuredOrganizations) {
		const rawUf = organization.fiscalConfiguracao?.endereco?.uf;
		try {
			ufs.add(normalizeIbptUf(rawUf));
		} catch (error) {
			console.error(`[IBPT] Organização com UF fiscal inválida ignorada: ${errorMessage(error)}`);
		}
	}
	return [...ufs].sort();
}

export async function refreshIbptRates({ ufs, apply = true }: { ufs: TIbptUf[]; apply?: boolean }): Promise<TIbptRefreshResult[]> {
	const results: TIbptRefreshResult[] = [];
	for (const uf of new Set(ufs)) {
		results.push(await refreshIbptUf({ uf, apply }));
	}
	return results;
}
