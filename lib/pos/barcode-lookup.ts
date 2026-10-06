import { normalizeProductBarcode } from "@/lib/products/barcode";
import { db } from "@/services/drizzle";
import { productVariants, products } from "@/services/drizzle/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { hydratePOSProducts, type THydratedPOSProduct } from "./hydrate-pos-products";

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
		variantRows.filter((row) => hit(row.codigoBarras)).map((row) => ({ productId: row.produtoId, variantId: row.id, matchedBy: "VARIANTE_CODIGO_BARRAS" })),
		productRows.filter((row) => hit(row.codigoBarras)).map((row) => ({ productId: row.id, variantId: null, matchedBy: "PRODUTO_CODIGO_BARRAS" })),
		variantRows.filter((row) => hit(row.codigo)).map((row) => ({ productId: row.produtoId, variantId: row.id, matchedBy: "VARIANTE_CODIGO" })),
		productRows.filter((row) => hit(row.codigo)).map((row) => ({ productId: row.id, variantId: null, matchedBy: "PRODUTO_CODIGO" })),
	];
	return tiers.find((tier) => tier.length > 0) ?? [];
}

export async function lookupPOSProductsByBarcode({ orgId, code, canal }: { orgId: string; code: string; canal: "POS" | "COMANDA" }): Promise<TBarcodeMatch[]> {
	const forms = barcodeLookupForms(code);
	if (forms.length === 0) return [];

	const [productRows, variantRows] = await Promise.all([
		db
			.select({ id: products.id, codigo: products.codigo, codigoBarras: products.codigoBarras })
			.from(products)
			.where(
				and(
					eq(products.organizacaoId, orgId),
					eq(products.ativo, true),
					eq(products.vendavel, true),
					or(inArray(products.codigoBarras, forms), inArray(products.codigo, forms)),
				),
			),
		db
			.select({ id: productVariants.id, produtoId: productVariants.produtoId, codigo: productVariants.codigo, codigoBarras: productVariants.codigoBarras })
			.from(productVariants)
			.innerJoin(products, eq(productVariants.produtoId, products.id))
			.where(
				and(
					eq(productVariants.organizacaoId, orgId),
					eq(productVariants.ativo, true),
					eq(products.ativo, true),
					eq(products.vendavel, true),
					or(inArray(productVariants.codigoBarras, forms), inArray(productVariants.codigo, forms)),
				),
			),
	]);

	const ranked = rankBarcodeCandidates({ forms, productRows, variantRows });
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
		matches.push({ product, variantId: match.variantId, matchedBy: match.matchedBy });
	}
	return matches;
}
