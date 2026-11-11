// Fotografa as telas reais do produto para os Reels:
//   npm run capture-screens                 → todas as telas
//   npm run capture-screens -- rfm-segments → uma tela
//
// Sobe o `next dev` do app (na raiz do repositório) com variáveis públicas de mentira, abre a rota
// de desenvolvimento /content-studio-screens (app/content-studio-screens), que monta os componentes
// reais do app com as respostas de API fixas do episódio, e tira um print da página inteira na
// largura de um celular. Junto do print, guarda a posição dos elementos que cada episódio destaca
// (episodes/_screens/manifest.json). O vídeo rola esse print e acende o elemento na palavra certa.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT } from "./lib";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright") as typeof import("playwright");

const REPO = path.resolve(ROOT, "..");
const OUT_DIR = path.join(ROOT, "episodes", "_screens");
const PORT = 3100;
const VIEWPORT = { width: 390, height: 844 };

/** Como achar o elemento a destacar: pelo texto e subindo até o campo, o cartão ou a célula da matriz. */
type TMark = { text: string; scope: "field" | "card" | "cell" };
type TCapture = { marks: Record<string, TMark>; prepare?: "scroll-sellers-table" };

// Cada tela e o que se destaca nela. As chaves das marcas são as que src/ui/screens.tsx usa.
const CAPTURES: Record<string, TCapture> = {
	"cashback-settings": {
		marks: {
			acumulo: { text: "ACÚMULO E VALIDADE", scope: "card" },
			valor: { text: "VALOR DE ACUMULAÇÃO", scope: "field" },
			validade: { text: "VALIDADE (DIAS)", scope: "field" },
		},
	},
	"rfm-segments": {
		marks: {
			matriz: { text: "MATRIZ RFM", scope: "card" },
			risco: { text: "EM RISCO", scope: "cell" },
			perdidos: { text: "120", scope: "cell" },
			campeoes: { text: "84", scope: "cell" },
		},
	},
	"product-abc": {
		marks: {
			abc: { text: "CLASSE ABC", scope: "card" },
		},
	},
	"dashboard-ticket": {
		marks: {
			ticket: { text: "TICKET MÉDIO", scope: "card" },
			vendedor: { text: "RESULTADO POR VENDEDOR", scope: "card" },
		},
		prepare: "scroll-sellers-table",
	},
};

type TRect = { x: number; y: number; w: number; h: number };
export type TScreenManifest = Record<string, { image: string; width: number; height: number; marks: Record<string, TRect> }>;

// Roda dentro da página. Fica como texto (JavaScript puro) porque o tsx injeta ajudantes como
// __name nas funções, e eles não existem no navegador.
const IN_PAGE = String.raw`({ marks, prepare }) => {
	document.querySelector("nextjs-portal")?.remove();
	const matchesText = (el, text) => el.innerText?.trim().toUpperCase().startsWith(text.toUpperCase());
	const deepest = (text) => {
		const all = Array.from(document.body.querySelectorAll("*")).filter((el) => matchesText(el, text));
		return all.find((el) => !Array.from(el.children).some((child) => matchesText(child, text))) ?? null;
	};
	const isCard = (el) => {
		const style = getComputedStyle(el);
		return parseFloat(style.borderTopWidth) > 0 && parseFloat(style.borderTopLeftRadius) >= 8 && el.getBoundingClientRect().height > 40;
	};
	const climb = (el, test) => {
		let node = el;
		while (node && node !== document.body) {
			if (test(node)) return node;
			node = node.parentElement;
		}
		return el;
	};
	if (prepare === "scroll-sellers-table") {
		const title = deepest("RESULTADO POR VENDEDOR");
		const card = title ? climb(title, isCard) : null;
		const scroller = card ? Array.from(card.querySelectorAll("*")).find((node) => node.scrollWidth > node.clientWidth + 4) : null;
		const header = scroller ? Array.from(scroller.querySelectorAll("th")).find((th) => th.innerText.trim().toUpperCase().startsWith("TICKET")) : null;
		// Rola só até a coluna de ticket médio encostar na borda direita: a primeira coluna (vendedor) some o mínimo.
		if (scroller && header) scroller.scrollLeft = Math.max(0, header.offsetLeft + header.offsetWidth - scroller.clientWidth + 8);
	}
	const out = {};
	for (const [key, mark] of Object.entries(marks)) {
		const hit = deepest(mark.text);
		if (!hit) continue;
		const target =
			mark.scope === "cell"
				? climb(hit, (node) => Boolean(node.style && node.style.gridArea))
				: mark.scope === "field"
					? climb(hit, (node) => node !== hit && node.querySelector("input, button, [role=combobox]") !== null)
					: climb(hit, isCard);
		const rect = target.getBoundingClientRect();
		out[key] = { x: rect.x + window.scrollX, y: rect.y + window.scrollY, w: rect.width, h: rect.height };
	}
	return out;
}`;

async function startDevServer(): Promise<ChildProcess> {
	const server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
		cwd: REPO,
		env: {
			...process.env,
			// A rota não fala com o Supabase; o cliente só exige as variáveis para nascer.
			NEXT_PUBLIC_SUPABASE_URL: "https://content-studio.invalid",
			NEXT_PUBLIC_SUPABASE_ANON_KEY: "content-studio",
			NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
		},
		stdio: ["ignore", "pipe", "pipe"],
		detached: true,
	});
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("next dev não ficou pronto em 120 s")), 120_000);
		server.stdout?.on("data", (chunk: Buffer) => {
			if (chunk.toString().includes("Ready")) {
				clearTimeout(timer);
				resolve();
			}
		});
		server.on("exit", (code) => reject(new Error(`next dev saiu com código ${code}`)));
	});
	return server;
}

async function main() {
	const only = process.argv[2];
	const names = only ? [only] : Object.keys(CAPTURES);
	mkdirSync(OUT_DIR, { recursive: true });
	const manifestPath = path.join(OUT_DIR, "manifest.json");
	let manifest: TScreenManifest = {};
	try {
		manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	} catch {}

	const external = process.env.CONTENT_STUDIO_APP_URL;
	const server = external ? null : await startDevServer();
	const baseUrl = external ?? `http://localhost:${PORT}`;
	const browser = await chromium.launch();
	try {
		for (const name of names) {
			const capture = CAPTURES[name];
			if (!capture) throw new Error(`Tela desconhecida: ${name}`);
			const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: "light" });
			const missing: string[] = [];
			page.on("console", (message) => {
				if (message.text().startsWith("[content-studio] sem fixture")) missing.push(message.text());
			});
			await page.goto(`${baseUrl}/content-studio-screens?screen=${name}`, { waitUntil: "networkidle", timeout: 240_000 });
			await page.waitForSelector("[data-content-studio-ready]", { timeout: 60_000 });
			await page.evaluate(() => document.fonts.ready);
			await page.waitForTimeout(1200);

			const marks = (await page.evaluate(`(${IN_PAGE})(${JSON.stringify({ marks: capture.marks, prepare: capture.prepare ?? null })})`)) as Record<string, TRect>;

			const notFound = Object.keys(capture.marks).filter((key) => !marks[key]);
			if (notFound.length) console.warn(`  ${name}: marcas não encontradas: ${notFound.join(", ")}`);
			if (missing.length) console.warn(`  ${name}: pedidos sem fixture:\n    ${[...new Set(missing)].join("\n    ")}`);

			const file = `${name}.png`;
			await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: true });
			const height = await page.evaluate(() => document.documentElement.scrollHeight);
			manifest[name] = { image: `_screens/${file}`, width: VIEWPORT.width, height, marks };
			console.log(`✓ ${name} (${VIEWPORT.width}×${height}, ${Object.keys(marks).length} marcas)`);
			await page.close();
		}
	} finally {
		await browser.close();
		if (server?.pid) process.kill(-server.pid);
	}
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
}

await main();
