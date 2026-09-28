/** Extrai os dados usados pela tela Relação de Vendas do Phibo. */
import { chromium } from "playwright";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const base = "https://www.phibo-api.com.br";
const pageUrl = "https://app.phibo.com.br/vendas/relacao-vendas";
const localDir = path.resolve(".local-analysis/phibo");
const profileDir = path.join(localDir, "chrome-profile");

function date(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`))) throw new Error(`Data inválida: ${value}`);
	return value;
}

function dates(from, to) {
	const result = [];
	for (let value = new Date(`${from}T12:00:00Z`); value <= new Date(`${to}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + 1)) result.push(value.toISOString().slice(0, 10));
	return result;
}

const args = process.argv.slice(2);
const option = key => args[args.indexOf(key) + 1];
const today = new Date();
const defaultTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const to = date(args.includes("--to") ? option("--to") : defaultTo);
const defaultFromDate = new Date(`${to}T12:00:00Z`);
defaultFromDate.setUTCMonth(defaultFromDate.getUTCMonth() - 3);
const from = date(args.includes("--from") ? option("--from") : defaultFromDate.toISOString().slice(0, 10));
if (from > to) throw new Error("--from deve ser anterior a --to.");
const output = path.resolve(args.includes("--output") ? option("--output") : path.join(localDir, `vendas-raw-${from}-a-${to}.json`));

async function save(value) {
	await mkdir(path.dirname(output), { recursive: true });
	await writeFile(`${output}.tmp`, JSON.stringify(value, null, 2), "utf8");
	await rename(`${output}.tmp`, output);
}

async function getJson(context, url, headers) {
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const response = await context.request.get(url, { headers, timeout: 30000 });
			if (response.ok()) return response.json();
			if (![429, 500, 502, 503, 504].includes(response.status())) throw new Error(`${response.status()} em ${new URL(url).pathname}`);
			if (attempt === 3) throw new Error(`${response.status()} em ${new URL(url).pathname}`);
		} catch (error) {
			if (attempt === 3) throw error;
		}
		await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
	}
}

async function mapLimited(values, concurrency, fn) {
	const result = Array(values.length);
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
		while (next < values.length) {
			const index = next++;
			result[index] = await fn(values[index], index);
		}
	}));
	return result;
}

await mkdir(localDir, { recursive: true });
const context = await chromium.launchPersistentContext(profileDir, { channel: "chrome", headless: true, acceptDownloads: false });
try {
	const page = context.pages()[0] ?? await context.newPage();
	const bootstrap = page.waitForResponse(response => new URL(response.url()).pathname === "/relacaoVendas/dia", { timeout: 45000 });
	await page.goto(pageUrl);
	await page.getByRole("heading", { name: /Relação de Vendas/ }).waitFor({ timeout: 45000 });
	const observed = await bootstrap;
	if (!observed.ok()) throw new Error(`A consulta inicial do Phibo retornou ${observed.status()}.`);
	const headers = observed.request().headers();
	if (!headers.authorization) throw new Error("Sessão do Phibo sem autorização. Entre novamente pelo navegador do extrator.");
	let result;
	try { result = JSON.parse(await readFile(output, "utf8")); } catch (error) {
		if (error.code !== "ENOENT") throw error;
		result = { fonte: pageUrl, periodo: { de: from, ate: to }, extraidoEm: null, dias: {}, falhas: {} };
	}
	if (result.periodo?.de !== from || result.periodo?.ate !== to) throw new Error("O período do arquivo existente não corresponde ao solicitado.");
	for (const day of dates(from, to)) {
		if (result.dias[day]) continue;
		try {
			const sales = await getJson(context, `${base}/relacaoVendas/dia?data=${day}`, headers);
			if (!Array.isArray(sales)) throw new Error("A lista de vendas não é um array.");
			const ids = sales.map(sale => sale.vendasUuid);
			if (ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) throw new Error("IDs de venda ausentes ou repetidos.");
			const enriched = await mapLimited(sales, 4, async sale => {
				const details = await getJson(context, `${base}/detalharVenda/getDetalharVendaByVenda/${encodeURIComponent(sale.vendasUuid)}`, headers);
				if (!details || !Array.isArray(details.itensVenda) || !Array.isArray(details.formasPagamento)) throw new Error(`Detalhamento incompleto: ${sale.vendasUuid}`);
				return { ...sale, detalhamento: details };
			});
			result.dias[day] = { quantidade: enriched.length, vendas: enriched };
			delete result.falhas[day];
			result.extraidoEm = new Date().toISOString();
			await save(result);
			console.log(`${day}: ${enriched.length} vendas`);
		} catch (error) {
			result.falhas[day] = String(error.message ?? error);
			await save(result);
			throw new Error(`${day}: ${result.falhas[day]}`);
		}
	}
	console.log(`Concluído: ${Object.keys(result.dias).length} dias, ${Object.values(result.dias).reduce((total, day) => total + day.quantidade, 0)} vendas. ${output}`);
} finally {
	await context.close();
}
