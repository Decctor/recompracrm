import "dotenv/config";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { formatPhoneAsBase, formatToCPForCNPJ, formatToPhone } from "@/lib/formatting";
import { normalizeProductBarcode } from "@/lib/products/barcode";
import { isValidCPF } from "@/lib/validation";
import { connection, db } from "@/services/drizzle";
import { clients, organizations, products } from "@/services/drizzle/schema";

/**
 * Importa clientes e produtos exportados do SysPro ERP (TriLink) em JSON.
 *
 * - Clientes: `codigo` → idExterno; documento embutido no nome é removido (CPF válido vai para
 *   cpfCnpj); telefone passa por uma limpeza antes do formatToPhone (DDD repetido, zeros à
 *   esquerda, DDI 55, vários números no campo) e celular antigo de 8 dígitos ganha o 9.
 * - Produtos: `quantidadeEstoque` é ignorado (não confiável); grupo inferido do nome; unidade
 *   mapeada para as padronizadas (UnitsOfMeasurementOptions).
 * - Idempotente: cliente já existente (mesmo idExterno) e produto já existente (mesmo codigo)
 *   são pulados.
 *
 * DRY-RUN por padrão: sem --apply nada é gravado. O relatório vai para scripts/output/.
 * Uso: npx tsx ./scripts/import-syspro-catalog.ts --org=<id> --expected-name=<nome> \
 *        --clients=<clientes.json> --products=<produtos.json> [--apply]
 */

function arg(name: string) {
	const found = process.argv.find((value) => value.startsWith(`--${name}=`));
	return found ? found.slice(name.length + 3) : undefined;
}
const apply = process.argv.includes("--apply");
const organizationId = arg("org");
const expectedName = arg("expected-name");
const clientsPath = arg("clients");
const productsPath = arg("products");

type TSysProClient = { codigo: string; nome: string; cidade: string | null; telefone: string | null; email: string | null };
type TSysProProduct = {
	codigo: string;
	codigoFabricante: string | null;
	codigoBarras: string | null;
	descricao: string;
	unidade: string;
	quantidadeEstoque: number;
	preco: number;
};

// -----------------------------------------------------------------------------
// PHONES
// -----------------------------------------------------------------------------

const VALID_DDDS = new Set([
	11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53,
	54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96,
	97, 98, 99,
]);

function stripNoise(digits: string, ddd: string | null) {
	let current = digits;
	let previous = "";
	while (current !== previous) {
		previous = current;
		current = current.replace(/^0+/, "");
		if (current.startsWith("55") && current.length >= 12) current = current.slice(2);
		// O SysPro prefixa o DDD ao que foi digitado, que muitas vezes já trazia o DDD.
		if (ddd && current.length > 11 && current.startsWith(ddd)) current = current.slice(2);
	}
	return current;
}

function isValidPhoneDigits(digits: string) {
	if (!VALID_DDDS.has(Number(digits.slice(0, 2)))) return false;
	if (digits.length === 11) return digits[2] === "9";
	if (digits.length === 10) return /[2-9]/.test(digits[2]);
	return false;
}

/** Devolve DDD + número (10/11 dígitos) do primeiro número aproveitável do campo, ou null. */
export function cleanSysProPhone(raw: string | null): string | null {
	if (!raw) return null;
	for (const segment of raw.split(/[/,;]/)) {
		const match = segment.trim().match(/^(\d{2,3})\s+(.+)$/);
		const dddCandidate = match ? match[1].replace(/^0+/, "") : null;
		let digits: string;
		if (match && dddCandidate && dddCandidate.length === 2) {
			const rest = stripNoise(match[2].replace(/\D/g, ""), dddCandidate);
			digits = rest.length >= 10 ? rest : dddCandidate + rest;
		} else {
			digits = segment.replace(/\D/g, "");
			digits = stripNoise(digits, null);
			if (digits.length > 11) digits = digits.slice(0, 2) + stripNoise(digits.slice(2), digits.slice(0, 2));
		}
		// Celular antigo (8 dígitos começando em 6-9) ganha o nono dígito.
		if (digits.length === 10 && /[6-9]/.test(digits[2])) digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
		if (isValidPhoneDigits(digits)) return digits;
	}
	return null;
}

// -----------------------------------------------------------------------------
// NAMES
// -----------------------------------------------------------------------------

/** Remove o documento embutido no nome ("16.670.391 FULANA", "FULANO 01614277664"). */
export function splitSysProClientName(raw: string): { nome: string; cpf: string | null } {
	let nome = raw.trim().replace(/\s+/g, " ");
	// Raiz de CNPJ de MEI no início: incompleta, só descarta.
	nome = nome.replace(/^\d{2}\.\d{3}\.\d{3}\s+/, "");
	let cpf: string | null = null;
	const suffix = nome.match(/\s+(\d{11})$/);
	if (suffix) {
		nome = nome.slice(0, suffix.index).trim();
		if (isValidCPF(suffix[1])) cpf = suffix[1];
	}
	return { nome, cpf };
}

// -----------------------------------------------------------------------------
// PRODUCTS
// -----------------------------------------------------------------------------

/** Preço nas caixas (CX6, CX12...) é unitário: a caixa é a unidade de compra, a venda é por UN. */
export function mapSysProUnit(product: TSysProProduct): string {
	const unit = product.unidade.trim().toUpperCase();
	if (unit === "UNID" || unit === "UN") return "UN";
	if (/^CX\d+$/.test(unit)) return "UN";
	// "CX" sem quantidade é misto no SysPro: caixa fechada (Chocomil 27/200ml a R$ 31,71) ou item
	// avulso (Fini 12x15g a R$ 1,50). O preço separa os dois casos nesta base.
	if (unit === "CX") return product.preco >= 15 ? "CX" : "UN";
	if (unit === "PT") return "PACOTE";
	if (unit === "KG" || unit === "DZ") return unit;
	throw new Error(`Unidade sem mapeamento: ${product.unidade} (${product.descricao})`);
}

const GROUP_RULES: { grupo: string; pattern: RegExp }[] = [
	{ grupo: "AMOSTRAS", pattern: /^AMOSTRA\b/ },
	{
		grupo: "EMBALAGENS E DESCARTAVEIS",
		pattern:
			/\b(SACO|SACOLA|BANDEJA ISOPOR|COPO DESCARTAVEL|BELLO COPO|PAPEL MANTEIGA|FECHO PLASTICO|ETIQUETA|BOBINA|GUARD MESA|MEXEDOR|TOUCA|ISOFORT)\b/,
	},
	{
		grupo: "LIMPEZA E USO INTERNO",
		pattern:
			/\b(ESPONJA|FLANELA|LAVA LOUCAS|DESINFETANTE|DETERGENTE|ALCOOL|TOALHA PAPEL|NOBRE|ACENDEDOR|EXTINTOR|ETIQUETADORA|GARRAFA TERMICA|FERVEDOR|RECARGA DE GAS|COADOR)\b/,
	},
	{ grupo: "MASSAS E MOLHOS", pattern: /^OUTROS\/|^MOLHO (DE TOMATE|PESTO)\b/ },
	// "QUEIJO MUSSARELA FATIADA BANDEJA" é frios, não bandeja de salgado.
	{ grupo: "BANDEJAS DE SALGADO", pattern: /^(?!QUEIJO).*(\b(BANDEJA|BDJ)\b|\(?15 ?UN\)?|SALGADOS? \((MEIO )?CENTO\))/ },
	{
		grupo: "CONGELADOS",
		pattern: /\bCONG(ELAD[OA]S?)?\b|\b(PAO DE QUEIJO|BROA|ROSCA|PAO DE BATATA|PAO DE MILHO|PARMESAO PALITO|BISCOITO CHIPA)\b.*\b\d+ ?KG\b/,
	},
	{
		grupo: "SALGADOS",
		pattern: /\b(COXINHA|ESFIRRA|RISOLE|QUIBE|TROUXINHA|ENROLADINHO|SALGADOS?|MINI PIZZA|DISCO PIZZA|TORTA DE LEGUMES)\b/,
	},
	{
		grupo: "SORVETES",
		pattern: /\b(CLASSICO|MAGNUM|CORNETTO|CREMOSISSIMO|FRUTTARE|KIDS FRUTILLY|CHICABON|ESKIBON)\b/,
	},
	{ grupo: "BEBIDAS ALCOOLICAS", pattern: /\b(EISENBAHN|ESTRELLA GALICIA|ESTRELA GALICIA|SOL PREMIUN)\b/ },
	{
		grupo: "BEBIDAS",
		pattern:
			/\b(AGUA|COCA COLA|FANTA|SPRITE|PEPSI|GUARANA|KUAT|DEL VALLE|DV|KAPO|SUCO|NECTAR|MONSTER|RED BULL|POWERADE|GATOREDE|SCHWEPPES|ICE TEA|COTUBA|ZAP|TODDYNHO|ACHOCOLATADO|BEB LACTEA|BEBIDA LACTEA|COPO DE CAFE)\b/,
	},
	{ grupo: "SALGADINHOS", pattern: /\b(CHEETOS|DORITOS|RUFFLES|FANDANGOS|CEBOLITOS)\b/ },
	// Produção própria com sabor de chocolate continua sendo padaria; biscoito industrial é mercearia.
	{ grupo: "PADARIA", pattern: /^(BOLO|CAROLINA|PETIT FOUR)\b/ },
	{ grupo: "MERCEARIA", pattern: /\b(BISCOITOS? (RECHEADO|WAFER|DO BRAZ|NIKITO)|COOKIES)\b/ },
	{
		grupo: "DOCES E CHOCOLATES",
		pattern: /\b(CHOC|CHOCOLATE|CHOCLATE|KIT KAT|BIS|BATON|FINI|TUBES|HALLS|TRIDENT|PIRULITO|PACOCA|BARRA WAFER|NUTELLA)\b/,
	},
	{
		grupo: "FRIOS E LATICINIOS",
		pattern:
			/\b(APRESUNTADO|PRESUNTO|PRES|MORTADELA|MUSSARELA|MANT|MANTEIGA|MARGARINA|REQ|REQUEIJAO|IOG|IOGURTE|QJ|LEITE (L V|LONGA VIDA|PASTEURIZADO)|WHEY)\b/,
	},
	{
		grupo: "MERCEARIA",
		pattern: /\b(CAFE|CAPSULA|TORRADA|MOLHO PIMENTA|CATCHUP|MAIONESE|ACUCAR SACHET|OVOS?|MIST BOLO)\b/,
	},
	{
		grupo: "PADARIA",
		pattern:
			/\b(PAO|PAES|ROSCA|ROSQUINHA|BOLO|BROA|CROISSANT|FOCACCIA|PALMIER|BAGUETTE|BISNAGA|PAIN|CASADINHO|PETIT FOUR|SEQUILHOS|CAROLINA|BOLACHA|BISCOITO|PATE)\b/,
	},
];

function normalizeForMatching(value: string) {
	return value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase();
}

export function inferSysProGroup(descricao: string): string {
	const name = normalizeForMatching(descricao);
	return GROUP_RULES.find((rule) => rule.pattern.test(name))?.grupo ?? "OUTROS";
}

// -----------------------------------------------------------------------------
// MAIN
// -----------------------------------------------------------------------------

const PLACEHOLDER_CLIENT_NAMES = new Set(["CONSUMIDOR", "OPERADOR"]);
// Insumos de operação: ficam no catálogo (compras, estoque), mas fora do PDV e da loja.
const NON_SELLABLE_GROUPS = new Set(["EMBALAGENS E DESCARTAVEIS", "LIMPEZA E USO INTERNO"]);

async function main() {
	assert.ok(organizationId && expectedName, "Informe --org e --expected-name.");
	assert.ok(clientsPath && productsPath, "Informe --clients e --products.");

	const sourceClients: TSysProClient[] = JSON.parse(readFileSync(clientsPath, "utf8")).clientes;
	const sourceProducts: TSysProProduct[] = JSON.parse(readFileSync(productsPath, "utf8")).produtos;

	const organization = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) });
	assert.equal(organization?.nome.trim().toLowerCase(), expectedName.trim().toLowerCase(), "Organização diferente da esperada.");

	// Cadastros genéricos do ERP (venda de balcão, operador de caixa), com o telefone da loja.
	const placeholderClients = sourceClients.filter((c) => PLACEHOLDER_CLIENT_NAMES.has(c.nome.trim().toUpperCase()));
	const clientReport = sourceClients.filter((c) => !placeholderClients.includes(c)).map((source) => {
		const { nome, cpf } = splitSysProClientName(source.nome);
		const phoneDigits = cleanSysProPhone(source.telefone);
		return {
			source,
			row: {
				organizacaoId: organizationId,
				idExterno: source.codigo,
				nome,
				cpfCnpj: cpf ? formatToCPForCNPJ(cpf) : null,
				telefone: phoneDigits ? formatToPhone(phoneDigits) : "",
				telefoneBase: phoneDigits ? formatPhoneAsBase(phoneDigits) : "",
				email: source.email?.trim().toLowerCase() || null,
				localizacaoCidade: source.cidade?.trim() || null,
			},
			phoneDiscarded: !!source.telefone && !phoneDigits,
		};
	});

	const productReport = sourceProducts.map((source) => {
		const grupo = inferSysProGroup(source.descricao);
		return {
			source,
			row: {
				organizacaoId: organizationId,
				nome: source.descricao.trim(),
				codigo: source.codigo,
				codigoBarras: normalizeProductBarcode(source.codigoBarras),
				unidade: mapSysProUnit(source),
				precoVenda: source.preco,
				ncm: "",
				tipo: "PRODUTO",
				grupo,
				vendavel: !NON_SELLABLE_GROUPS.has(grupo),
			},
		};
	});

	const existingClientCodes = new Set(
		(
			await db
				.select({ idExterno: clients.idExterno })
				.from(clients)
				.where(
					and(
						eq(clients.organizacaoId, organizationId),
						inArray(
							clients.idExterno,
							sourceClients.map((c) => c.codigo),
						),
					),
				)
		).map((r) => r.idExterno),
	);
	const existingProductCodes = new Set(
		(
			await db
				.select({ codigo: products.codigo })
				.from(products)
				.where(
					and(
						eq(products.organizacaoId, organizationId),
						inArray(
							products.codigo,
							sourceProducts.map((p) => p.codigo),
						),
					),
				)
		).map((r) => r.codigo),
	);

	const clientsToInsert = clientReport.filter((c) => !existingClientCodes.has(c.row.idExterno)).map((c) => c.row);
	const productsToInsert = productReport.filter((p) => !existingProductCodes.has(p.row.codigo)).map((p) => p.row);

	const outputDir = path.join("scripts", "output");
	mkdirSync(outputDir, { recursive: true });
	const reportPath = path.join(outputDir, `syspro-import-${organizationId}.json`);
	writeFileSync(
		reportPath,
		JSON.stringify(
			{
				clients: clientReport.map((c) => ({
					codigo: c.source.codigo,
					nomeOriginal: c.source.nome,
					nome: c.row.nome,
					cpfCnpj: c.row.cpfCnpj,
					telefoneOriginal: c.source.telefone,
					telefone: c.row.telefone,
					telefoneBase: c.row.telefoneBase,
					phoneDiscarded: c.phoneDiscarded,
				})),
				products: productReport.map((p) => ({
					codigo: p.source.codigo,
					nome: p.row.nome,
					unidadeOriginal: p.source.unidade,
					unidade: p.row.unidade,
					grupo: p.row.grupo,
					vendavel: p.row.vendavel,
					precoVenda: p.row.precoVenda,
					codigoBarras: p.row.codigoBarras,
				})),
			},
			null,
			2,
		),
	);

	const countBy = <T>(items: T[], key: (item: T) => string) =>
		items.reduce<Record<string, number>>((acc, item) => {
			acc[key(item)] = (acc[key(item)] ?? 0) + 1;
			return acc;
		}, {});

	console.log(`[SYSPRO] Organização: ${organization?.nome.trim()}`);
	console.log(
		`[SYSPRO] Clientes: ${sourceClients.length} no arquivo, ${placeholderClients.length} genéricos ignorados (${placeholderClients.map((c) => c.nome).join(", ")}),`,
	);
	console.log(
		`[SYSPRO]   ${clientReport.length} considerados, ${existingClientCodes.size} já existentes, ${clientsToInsert.length} a inserir.`,
	);
	console.log(
		`[SYSPRO]   com telefone: ${clientReport.filter((c) => c.row.telefone).length}, telefone descartado: ${clientReport.filter((c) => c.phoneDiscarded).length}, sem telefone na origem: ${clientReport.filter((c) => !c.source.telefone).length}, com CPF: ${clientReport.filter((c) => c.row.cpfCnpj).length}`,
	);
	console.log(
		`[SYSPRO] Produtos: ${productReport.length} no arquivo, ${existingProductCodes.size} já existentes, ${productsToInsert.length} a inserir.`,
	);
	console.log("[SYSPRO]   por grupo:", countBy(productReport, (p) => p.row.grupo));
	console.log("[SYSPRO]   por unidade:", countBy(productReport, (p) => p.row.unidade));
	console.log(`[SYSPRO]   não vendáveis: ${productReport.filter((p) => !p.row.vendavel).length}`);
	console.log(`[SYSPRO] Relatório: ${reportPath}`);

	if (!apply) {
		console.log("[SYSPRO] DRY-RUN: nada foi gravado. Use --apply para importar.");
		return;
	}

	await db.transaction(async (tx) => {
		if (clientsToInsert.length) await tx.insert(clients).values(clientsToInsert);
		if (productsToInsert.length) await tx.insert(products).values(productsToInsert);
	});
	console.log(`[SYSPRO] Importados ${clientsToInsert.length} clientes e ${productsToInsert.length} produtos.`);
}

main()
	.catch((error) => {
		console.error("[SYSPRO] Erro na importação", error);
		process.exitCode = 1;
	})
	.finally(() => connection.end());
