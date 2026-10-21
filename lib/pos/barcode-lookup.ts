import { normalizeProductBarcode } from "@/lib/products/barcode";
import { db } from "@/services/drizzle";
import { organizations, productVariants, products } from "@/services/drizzle/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { hydratePOSProducts, type THydratedPOSProduct } from "./hydrate-pos-products";
import { DEFAULT_SCALE_BARCODE_CONFIG, normalizeScalePlu, readScaleBarcode, SCALE_BARCODE_LENGTH, type TScaleBarcodeReading } from "./scale-barcode";

// Resolução de um código lido no PDV para o item do catálogo. A ordem das camadas é a da
// especificidade: a variante com o GTIN próprio ganha do produto; o código de barras cadastrado
// ganha do SKU — mas o SKU conta, porque as etiquetas da loja (kits visuais) imprimem `codigo`
// em Code 128 e o backfill copiou `codigo` para `codigo_barras` só onde estava vazio.

export const BarcodeMatchedByValues = ["VARIANTE_CODIGO_BARRAS", "PRODUTO_CODIGO_BARRAS", "VARIANTE_CODIGO", "PRODUTO_CODIGO"] as const;
export type TBarcodeMatchedBy = (typeof BarcodeMatchedByValues)[number];

export type TBarcodeMatch = {
	product: THydratedPOSProduct;
	/** Variante identificada pelo código; `null` quando o código é do produto. */
	variantId: string | null;
	matchedBy: TBarcodeMatchedBy;
	/** Etiqueta de balança: o código casou pelo PLU e traz o valor da pesagem. */
	scaleReading: TScaleBarcodeReading | null;
};

/**
 * Formas equivalentes do código lido. O leitor pode emitir um UPC-A de 12 dígitos como EAN-13
 * com zero à esquerda (ou o contrário), e o cadastro pode ter guardado qualquer uma das duas.
 * O texto cru fica na lista porque um código interno não GTIN é comparado como digitado.
 */
export function barcodeLookupForms(raw: string): string[] {
	const trimmed = raw.trim();
	if (!trimmed) return [];
	const forms = new Set<string>([trimmed]);
	const normalized = normalizeProductBarcode(trimmed);
	if (normalized) forms.add(normalized);
	const digits = normalized && /^\d+$/.test(normalized) ? normalized : null;
	if (digits) {
		if (digits.length === 12) forms.add(`0${digits}`);
		if (digits.length === 13 && digits.startsWith("0")) forms.add(digits.slice(1));
	}
	return [...forms];
}

type TProductCandidate = { id: string; codigo: string; codigoBarras: string | null };
type TVariantCandidate = { id: string; produtoId: string; codigo: string | null; codigoBarras: string | null };

/**
 * Classifica os candidatos crus na camada mais específica que o código atingiu e devolve só
 * essa camada. Pura, para o ranking ser testável sem banco.
 */
export function rankBarcodeCandidates({
	forms,
	productRows,
	variantRows,
}: {
	forms: readonly string[];
	productRows: readonly TProductCandidate[];
	variantRows: readonly TVariantCandidate[];
}): Array<{ productId: string; variantId: string | null; matchedBy: TBarcodeMatchedBy }> {
	const formSet = new Set(forms);
	const hit = (value: string | null | undefined) => value != null && formSet.has(value.trim());

	const tiers: Array<Array<{ productId: string; variantId: string | null; matchedBy: TBarcodeMatchedBy }>> = [
		variantRows
			.filter((row) => hit(row.codigoBarras))
			.map((row) => ({ productId: row.produtoId, variantId: row.id, matchedBy: "VARIANTE_CODIGO_BARRAS" })),
		productRows.filter((row) => hit(row.codigoBarras)).map((row) => ({ productId: row.id, variantId: null, matchedBy: "PRODUTO_CODIGO_BARRAS" })),
		variantRows.filter((row) => hit(row.codigo)).map((row) => ({ productId: row.produtoId, variantId: row.id, matchedBy: "VARIANTE_CODIGO" })),
		productRows.filter((row) => hit(row.codigo)).map((row) => ({ productId: row.id, variantId: null, matchedBy: "PRODUTO_CODIGO" })),
	];
	return tiers.find((tier) => tier.length > 0) ?? [];
}

type TRankedMatch = ReturnType<typeof rankBarcodeCandidates>[number];

export async function lookupPOSProductsByBarcode({
	orgId,
	code,
	canal,
}: {
	orgId: string;
	code: string;
	canal: "POS" | "COMANDA";
}): Promise<TBarcodeMatch[]> {
	const forms = barcodeLookupForms(code);
	if (forms.length === 0) return [];

	// O código inteiro cadastrado ganha da leitura como balança: é o vínculo mais específico, e um
	// EAN interno começando com 2 continua valendo mesmo com a balança ligada.
	const exact = await findExactCandidates({ orgId, forms });
	if (exact.length > 0) return hydrateMatches({ orgId, canal, ranked: exact, scaleReading: null });

	const scaleReading = await readOrganizationScaleBarcode({ orgId, code });
	if (!scaleReading) return [];
	const plu = normalizeScalePlu(scaleReading.plu);
	if (!plu) return [];
	const byPlu = await findPluCandidates({ orgId, plu });
	return hydrateMatches({ orgId, canal, ranked: byPlu, scaleReading });
}

const activeProductConditions = (orgId: string) => and(eq(products.organizacaoId, orgId), eq(products.ativo, true), eq(products.vendavel, true));
const activeVariantConditions = (orgId: string) =>
	and(eq(productVariants.organizacaoId, orgId), eq(productVariants.ativo, true), eq(products.ativo, true), eq(products.vendavel, true));

async function findExactCandidates({ orgId, forms }: { orgId: string; forms: string[] }) {
	const [productRows, variantRows] = await Promise.all([
		db
			.select({ id: products.id, codigo: products.codigo, codigoBarras: products.codigoBarras })
			.from(products)
			.where(and(activeProductConditions(orgId), or(inArray(products.codigoBarras, forms), inArray(products.codigo, forms)))),
		db
			.select({
				id: productVariants.id,
				produtoId: productVariants.produtoId,
				codigo: productVariants.codigo,
				codigoBarras: productVariants.codigoBarras,
			})
			.from(productVariants)
			.innerJoin(products, eq(productVariants.produtoId, products.id))
			.where(and(activeVariantConditions(orgId), or(inArray(productVariants.codigoBarras, forms), inArray(productVariants.codigo, forms)))),
	]);
	return rankBarcodeCandidates({ forms, productRows, variantRows });
}

async function readOrganizationScaleBarcode({ orgId, code }: { orgId: string; code: string }) {
	// Só um EAN-13 numérico pode ser etiqueta: evita ler a configuração a cada código comum.
	if (code.trim().length !== SCALE_BARCODE_LENGTH || !/^\d+$/.test(code.trim())) return null;
	const organization = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId), columns: { configuracao: true } });
	const config = organization?.configuracao.preferencias.balanca ?? DEFAULT_SCALE_BARCODE_CONFIG;
	return readScaleBarcode(code, config);
}

/**
 * O PLU da balança fica no código de barras (ou no código) do produto ou da variante, digitado
 * com ou sem zeros à esquerda; a comparação ignora os zeros dos dois lados. As camadas são as
 * mesmas da leitura comum, com os valores já normalizados.
 */
async function findPluCandidates({ orgId, plu }: { orgId: string; plu: string }) {
	const stripped = (
		column: typeof products.codigo | typeof products.codigoBarras | typeof productVariants.codigo | typeof productVariants.codigoBarras,
	) => sql`ltrim(trim(${column}), '0')`;
	const [productRows, variantRows] = await Promise.all([
		db
			.select({ id: products.id, codigo: products.codigo, codigoBarras: products.codigoBarras })
			.from(products)
			.where(and(activeProductConditions(orgId), or(sql`${stripped(products.codigoBarras)} = ${plu}`, sql`${stripped(products.codigo)} = ${plu}`))),
		db
			.select({
				id: productVariants.id,
				produtoId: productVariants.produtoId,
				codigo: productVariants.codigo,
				codigoBarras: productVariants.codigoBarras,
			})
			.from(productVariants)
			.innerJoin(products, eq(productVariants.produtoId, products.id))
			.where(
				and(
					activeVariantConditions(orgId),
					or(sql`${stripped(productVariants.codigoBarras)} = ${plu}`, sql`${stripped(productVariants.codigo)} = ${plu}`),
				),
			),
	]);
	const normalizeRow = <T extends { codigo: string | null; codigoBarras: string | null }>(row: T): T => ({
		...row,
		codigo: normalizeScalePlu(row.codigo) ?? "",
		codigoBarras: normalizeScalePlu(row.codigoBarras),
	});
	return rankBarcodeCandidates({ forms: [plu], productRows: productRows.map(normalizeRow), variantRows: variantRows.map(normalizeRow) });
}

async function hydrateMatches({
	orgId,
	canal,
	ranked,
	scaleReading,
}: {
	orgId: string;
	canal: "POS" | "COMANDA";
	ranked: TRankedMatch[];
	scaleReading: TScaleBarcodeReading | null;
}): Promise<TBarcodeMatch[]> {
	if (ranked.length === 0) return [];

	// A hidratação aplica a disponibilidade e o preço do canal: um produto fora da vitrine do canal
	// (ou a variante indisponível nele) some daqui como some da grade.
	const hydrated = await hydratePOSProducts({ orgId, productIds: [...new Set(ranked.map((match) => match.productId))], canal });
	const byId = new Map(hydrated.map((product) => [product.id, product]));

	const matches: TBarcodeMatch[] = [];
	for (const match of ranked) {
		const product = byId.get(match.productId);
		if (!product) continue;
		if (match.variantId && !product.variantes.some((variant) => variant.id === match.variantId)) continue;
		matches.push({ product, variantId: match.variantId, matchedBy: match.matchedBy, scaleReading });
	}
	return matches;
}
