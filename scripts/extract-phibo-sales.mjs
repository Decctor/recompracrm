/**
 * Exporta a Relação de Vendas do Phibo pela interface, sem chamar endpoints privados.
 * Uso: npm run extract:phibo-sales -- --from 2026-06-28 --to 2026-09-28
 * A primeira execução abre o Chrome para login manual. Aperte Enter no terminal
 * depois que a Relação de Vendas estiver visível.
 */
import { chromium } from "playwright";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const LOCAL_DIR = path.join(ROOT, ".local-analysis", "phibo");
const URL = "https://app.phibo.com.br/vendas/relacao-vendas";

function parseArgs(argv) {
	const args = Object.fromEntries(argv.flatMap((arg, i) => arg.startsWith("--") && argv[i + 1] && !argv[i + 1].startsWith("--") ? [[arg.slice(2), argv[i + 1]]] : []));
	const today = new Date();
	const to = args.to ?? localDate(today);
	const fromDate = parseDate(to);
	fromDate.setMonth(fromDate.getMonth() - 3);
	const from = args.from ?? localDate(fromDate);
	if (parseDate(from) > parseDate(to)) throw new Error("--from deve ser anterior ou igual a --to.");
	return { from, to, output: path.resolve(args.output ?? path.join(LOCAL_DIR, `vendas-${from}-a-${to}.json`)) };
}

function parseDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Data inválida: ${value}. Use AAAA-MM-DD.`);
	const [year, month, day] = value.split("-").map(Number);
	const result = new Date(year, month - 1, day);
	if (localDate(result) !== value) throw new Error(`Data inválida: ${value}.`);
	return result;
}

function localDate(date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateRange(from, to) {
	const result = [];
	for (let date = parseDate(from); date <= parseDate(to); date.setDate(date.getDate() + 1)) result.push(localDate(date));
	return result;
}

async function save(output, data) {
	await mkdir(path.dirname(output), { recursive: true });
	const temporary = `${output}.tmp`;
	await writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
	await rename(temporary, output);
}

async function selectDay(page, date) {
	const [year, month, day] = date.split("-").map(Number);
	const input = page.getByRole("tabpanel", { name: "Dia da Venda" }).getByRole("combobox").first();
	const current = await input.inputValue();
	if (current !== `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`) {
		await page.getByRole("button", { name: "Escolher Data" }).click();
		const calendar = page.locator('.p-datepicker-panel[aria-label="Escolher Data"]');
		await calendar.waitFor({ state: "visible" });
		for (let step = 0; step < 12; step++) {
			const shown = await calendar.locator('[aria-label="Escolher Mês"]').innerText();
			const shownYear = Number((await calendar.locator('[aria-label="Escolher Ano"]').innerText()).trim());
			const shownMonth = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"].indexOf(shown.trim().toLowerCase()) + 1;
			if (!shownMonth) throw new Error(`Mês desconhecido no calendário: ${shown}`);
			const difference = (year - shownYear) * 12 + month - shownMonth;
			if (difference === 0) break;
			await calendar.getByRole("button", { name: difference < 0 ? "Mês Anterior" : "Próximo Mês" }).click();
			if (step === 11) throw new Error(`Não foi possível navegar até ${date}.`);
		}
		await calendar.locator(`[data-date="${year}-${month - 1}-${day}"]`).click();
	}
	await page.waitForFunction(expected => {
		const input = document.querySelector('[role="tabpanel"][aria-labelledby$="tab_0"] input.p-datepicker-input');
		return input?.value === expected;
	}, `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`);
	await page.waitForFunction(() => {
		const panel = document.querySelector('[role="tabpanel"][aria-labelledby$="tab_0"]');
		return panel && (panel.querySelectorAll('.panel button[aria-label="Detalhamento da venda"]').length > 0 || panel.textContent.includes("Nenhuma venda encontrada"));
	}, null, { timeout: 30000 });
	// A troca da data atualiza o campo antes da resposta do relatório.
	await page.waitForTimeout(1200);
}

async function readDay(page, date) {
	await selectDay(page, date);
	const day = await page.evaluate(() => {
		const panel = document.querySelector('[role="tabpanel"][aria-labelledby$="tab_0"]');
		const clean = value => value?.replace(/\s+/g, " ").trim() ?? "";
		const rows = table => [...table.querySelectorAll("tbody tr")].map(row => [...row.querySelectorAll("td")].map(cell => clean(cell.textContent)));
		const summary = {};
		for (const label of ["Total Vendido", "Vendas", "Peças", "Deduções", "Descontos / Cupom", "Trocas", "Cashback", "Total", "Líquido", "Frete"]) {
			const element = [...panel.querySelectorAll("div")].find(el => el.children.length === 0 && clean(el.textContent).toLowerCase() === label.toLowerCase());
			if (element?.nextElementSibling) summary[label] = clean(element.nextElementSibling.textContent);
		}
		const sales = [...panel.querySelectorAll('.panel button[aria-label="Detalhamento da venda"]')].map(button => {
			const card = button.closest(".panel");
			const header = button.parentElement.parentElement;
			const dateAndChannel = clean(header.querySelector("span")?.textContent);
			const invoice = clean(header.querySelector('[title="Nota fiscal da venda"]')?.textContent);
			const client = clean(header.querySelector(".bxs-user-circle + span")?.textContent);
			const phone = clean(header.querySelector(".bx-phone")?.parentElement?.textContent);
			const table = card.querySelector("table");
			const totals = Object.fromEntries([...card.querySelectorAll("tr")].filter(row => row.textContent?.includes("SubTotal")).map(row => {
				const cells = [...row.querySelectorAll("td")].map(cell => clean(cell.textContent));
				return [cells[0]?.replace(/:$/, ""), cells.at(-1)];
			}));
			return {
				dataCanal: dateAndChannel,
				notaFiscal: invoice || null,
				cliente: client || null,
				telefone: phone || null,
				colunasItens: table ? [...table.querySelectorAll("thead th")].map(cell => clean(cell.textContent)) : [],
				itens: table ? rows(table) : [],
				totais: totals,
			};
		});
		return { resumo: summary, vendas: sales, semVendas: panel.textContent.includes("Nenhuma venda encontrada") };
	});
	const expected = Number(day.resumo.Vendas ?? (day.semVendas ? 0 : NaN));
	if (!Number.isFinite(expected) || day.vendas.length !== expected) throw new Error(`${date}: contador ${expected}, cartões ${day.vendas.length}.`);
	const shortDate = `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}`;
	if (day.vendas.some(sale => !sale.dataCanal.includes(shortDate))) throw new Error(`${date}: a página ainda mostra vendas de outra data.`);
	if (day.vendas.some(sale => sale.itens.length === 0)) throw new Error(`${date}: há venda sem itens visíveis.`);
	for (let i = 0; i < day.vendas.length; i++) {
		await page.getByRole("tabpanel", { name: "Dia da Venda" }).getByRole("button", { name: "Detalhamento da venda" }).nth(i).click();
		const dialog = page.getByRole("dialog", { name: "Detalhamento da venda" });
		await dialog.getByText(/Formas de pagamento/i).waitFor({ state: "visible", timeout: 20000 });
		day.vendas[i].detalhamento = await dialog.evaluate(element => {
			const clean = value => value?.replace(/\s+/g, " ").trim() ?? "";
			return {
				texto: clean(element.textContent),
				cupomTroca: clean(element.textContent).match(/Cupom de Troca:\s*(\d+)/i)?.[1] ?? null,
				tabelas: [...element.querySelectorAll("table")].map(table => ({
					colunas: [...table.querySelectorAll("thead th")].map(cell => clean(cell.textContent)),
					linhas: [...table.querySelectorAll("tbody tr")].map(row => [...row.querySelectorAll("td")].map(cell => clean(cell.textContent))),
				})),
			};
		});
		if (day.vendas[i].detalhamento.tabelas.length < 2) throw new Error(`${date}: detalhamento incompleto na venda ${i + 1}.`);
		await dialog.getByRole("button", { name: "Fechar" }).click();
		await dialog.waitFor({ state: "hidden" });
	}
	return day;
}

const { from, to, output } = parseArgs(process.argv.slice(2));
await mkdir(LOCAL_DIR, { recursive: true });
const browser = await chromium.launchPersistentContext(path.join(LOCAL_DIR, "chrome-profile"), { channel: "chrome", headless: false, acceptDownloads: false });
try {
	const page = browser.pages()[0] ?? await browser.newPage();
	await page.goto(URL);
	let ready = false;
	try {
		await page.getByRole("heading", { name: /Relação de Vendas/ }).waitFor({ state: "visible", timeout: 15000 });
		ready = true;
	} catch {
		// A sessão ainda pode exigir login manual.
	}
	if (!ready) {
		const rl = createInterface({ input: stdin, output: stdout });
		await rl.question("Entre no Phibo e abra Relação de Vendas. Depois pressione Enter aqui. ");
		rl.close();
	}
	await page.getByRole("heading", { name: /Relação de Vendas/ }).waitFor({ state: "visible", timeout: 30000 });
	await page.getByRole("tab", { name: "Dia da Venda" }).click();
	let result;
	try { result = JSON.parse(await readFile(output, "utf8")); } catch (error) {
		if (error.code !== "ENOENT") throw error;
		result = { fonte: URL, periodo: { de: from, ate: to }, extraidoEm: null, dias: {}, falhas: {} };
	}
	if (result.periodo?.de !== from || result.periodo?.ate !== to) throw new Error("O período do JSON existente não corresponde aos argumentos.");
	for (const date of dateRange(from, to)) {
		if (result.dias[date]) continue;
		try {
			result.dias[date] = await readDay(page, date);
			delete result.falhas[date];
			result.extraidoEm = new Date().toISOString();
			await save(output, result);
			console.log(`${date}: ${result.dias[date].vendas.length} vendas`);
		} catch (error) {
			result.falhas[date] = String(error.message ?? error);
			await save(output, result);
			console.error(`${date}: ${result.falhas[date]}`);
			throw error;
		}
	}
	console.log(`Concluído: ${Object.keys(result.dias).length} dias, ${Object.values(result.dias).reduce((sum, day) => sum + day.vendas.length, 0)} vendas. Arquivo: ${output}`);
} finally {
	await browser.close();
}
