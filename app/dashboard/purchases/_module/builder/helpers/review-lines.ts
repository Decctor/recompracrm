import type { TImportPurchaseCompositionOutput } from "@/app/api/purchases/import-composition/route";
import type { TPurchaseCostTreatmentEnum } from "@/schemas/enums";
import { adjustTaxTreatmentsForDestination } from "@/lib/purchase/destination";
import { convertLineToProductUnit, unitsAreEquivalent } from "@/lib/purchase/units";

export type TImportResult = TImportPurchaseCompositionOutput["data"];
export type TImportSupplier = TImportResult["fornecedor"];
export type TImportDocument = TImportResult["documento"];
export type TImportedLine = TImportResult["itens"][number];

/**
 * Product to be created for a line with no catalog match. Like the supplier, it is only created
 * together with the purchase, so abandoning the builder never leaves an orphan product behind.
 * The id is generated here and becomes the purchase item's `produtoId`.
 */
export type TNewProductDraft = {
	id: string;
	nome: string;
	codigo: string;
	codigoBarras: string | null;
	unidade: string;
	ncm: string;
	vendavel: boolean;
	rastreamentoEstoqueAtivo: boolean;
};

export type TReviewLine = TImportedLine & {
	id: string;
	/** False = "Não incluído": the line stays visible but is not sent with the purchase. */
	incluir: boolean;
	/** The operator accepted a SUGERIDO match. */
	vinculoConfirmado: boolean;
	/** The operator picked the product by hand: no suggestion left to confirm. */
	manualOverride: boolean;
	produtoNovo: TNewProductDraft | null;
	produtoVariante: { nome: string; codigo: string; imagemCapaUrl: string | null } | null;
	/** How many internal units fit in one unit of the invoice. Null when the units match. */
	fatorConversao: number | null;
	/** Remember this supplier code/EAN → product link for the supplier's next invoices. */
	lembrarVinculo: boolean;
	/** Raw extracted values, frozen before edits, persisted as externo* on the item. */
	extraidoQuantidade: number;
	extraidoValorUnitario: number;
	documentoRef: string;
	origemImportacao: "XML" | "IA";
	/**
	 * Conta de destino do custo. Nulo = estoque (o padrão). Preenchida, o item não entra no estoque e o
	 * custo vai direto para a conta (manutenção, reforma, uso e consumo). Ver lib/purchase/destination.ts.
	 */
	contaContabilId: string | null;
};

export type TReviewIssue = "unmapped" | "suggested" | "unit" | "tax";
export type TReviewLineStatus = "ignored" | "pending" | "ready";

export const REVIEW_ISSUE_ORDER: TReviewIssue[] = ["unmapped", "suggested", "unit", "tax"];

/** Título sugerido para a compra lida de um documento: fornecedor e número da nota, quando houver. */
export function buildImportedPurchaseTitle({ supplierName, documentNumber }: { supplierName: string | null; documentNumber: string | null }) {
	if (supplierName) return documentNumber ? `Compra ${supplierName} - NF ${documentNumber}` : `Compra ${supplierName}`;
	return documentNumber ? `Compra - NF ${documentNumber}` : "";
}

/** Quantas linhas lidas já estão prontas e o que falta decidir, por tipo de pendência. */
export function summarizeReviewLines(lines: TReviewLine[]) {
	const issues: Record<TReviewIssue, number> = { unmapped: 0, suggested: 0, unit: 0, tax: 0 };
	let ready = 0;
	for (const line of lines) {
		const issue = getLineIssue(line);
		if (issue) issues[issue] += 1;
		else if (line.incluir) ready += 1;
	}
	return { ready, issues, pending: issues.unmapped + issues.suggested + issues.unit + issues.tax };
}

export function createReviewLines(result: TImportResult, createId: () => string): TReviewLine[] {
	return result.itens.map((item) => ({
		...item,
		id: createId(),
		incluir: true,
		vinculoConfirmado: false,
		manualOverride: false,
		produtoNovo: null,
		produtoVariante: null,
		fatorConversao: item.fatorConversaoSugerido && item.matchTipo === "MAPEADO" ? item.fatorConversaoSugerido : null,
		lembrarVinculo: true,
		extraidoQuantidade: item.quantidade,
		extraidoValorUnitario: item.valorUnitario,
		documentoRef: result.documento.importado.referencia,
		origemImportacao: result.documento.origem,
		contaContabilId: null,
	}));
}

/**
 * Muda o destino do custo de uma linha e o que depende dele: fora do estoque, o produto novo nasce sem
 * rastreio de estoque e não vendável, e os tributos passam a compor o custo (sem crédito). De volta ao
 * estoque, o produto novo volta a rastrear estoque — a compra é quem dá a entrada.
 */
export function setLineDestination(line: TReviewLine, contaContabilId: string | null): TReviewLine {
	const entersStock = contaContabilId == null;
	return {
		...line,
		contaContabilId,
		produtoNovo: line.produtoNovo
			? entersStock
				? { ...line.produtoNovo, rastreamentoEstoqueAtivo: true }
				: { ...line.produtoNovo, rastreamentoEstoqueAtivo: false, vendavel: false }
			: null,
		modificadoresCusto: line.modificadoresCusto ? adjustTaxTreatmentsForDestination({ modifiers: line.modificadoresCusto, entersStock }) : line.modificadoresCusto,
	};
}

/** Destino comum às linhas incluídas: a conta (ou nulo = estoque) quando todas concordam, `undefined` quando divergem. */
export function getSharedLinesDestination(lines: TReviewLine[]): string | null | undefined {
	const included = lines.filter((line) => line.incluir);
	if (included.length === 0) return null;
	const first = included[0]?.contaContabilId ?? null;
	return included.every((line) => (line.contaContabilId ?? null) === first) ? first : undefined;
}

/** Internal unit of the line: the linked product's, or the draft's. */
export function getLineInternalUnit(line: TReviewLine) {
	if (line.produto) return line.produto.unidade ?? "UN";
	if (line.produtoNovo) return line.produtoNovo.unidade.trim() || "UN";
	return null;
}

/** The server only computes the divergence for existing products; for a draft it is computed here. */
export function lineHasUnitDivergence(line: TReviewLine) {
	if (line.produto) return line.divergenciaUnidade;
	if (line.produtoNovo) return !unitsAreEquivalent(line.unidade, line.produtoNovo.unidade);
	return false;
}

export function getPendingModifierIndex(line: TReviewLine) {
	return (line.modificadoresCusto ?? []).findIndex((modifier) => modifier.tratamento === null);
}

/** The single next thing the operator has to decide for this line, in queue order. */
export function getLineIssue(line: TReviewLine): TReviewIssue | null {
	if (!line.incluir) return null;
	if (!line.produto && !line.produtoNovo) return "unmapped";
	if (line.produto && line.matchTipo === "SUGERIDO" && !line.vinculoConfirmado && !line.manualOverride) return "suggested";
	if (lineHasUnitDivergence(line) && !(line.fatorConversao && line.fatorConversao > 0)) return "unit";
	if (getPendingModifierIndex(line) !== -1) return "tax";
	return null;
}

export function getLineStatus(line: TReviewLine): TReviewLineStatus {
	if (!line.incluir) return "ignored";
	return getLineIssue(line) ? "pending" : "ready";
}

/** Line total as printed on the invoice. The conversion factor never changes it. */
export function getLineTotal(line: Pick<TReviewLine, "quantidade" | "valorUnitario" | "desconto" | "modificadoresCusto">) {
	if (line.modificadoresCusto)
		return (
			line.quantidade * line.valorUnitario +
			line.modificadoresCusto.reduce((total, modifier) => total + (modifier.efeito === "REDUCAO" ? -1 : 1) * (modifier.valorCentavos / 100), 0)
		);
	return line.quantidade * line.valorUnitario - (line.desconto ?? 0);
}

export function getIncludedLinesTotal(lines: TReviewLine[]) {
	return Math.round(lines.filter((line) => line.incluir).reduce((total, line) => total + getLineTotal(line), 0) * 100) / 100;
}

export function buildNewProductDraft(line: TReviewLine, id: string): TNewProductDraft {
	const ean = line.ean?.trim() || null;
	return {
		id,
		nome: line.descricao,
		codigo: line.codigoFornecedor?.trim() || ean || "",
		codigoBarras: ean,
		unidade: line.unidade?.trim() || "UN",
		ncm: line.ncm?.trim() ?? "",
		// Purchases mostly bring raw material: born outside the sales surfaces, but with stock
		// tracking on — the purchase itself gives the first stock entry. A line with its own
		// destination (maintenance, renovation…) never enters stock, so its product doesn't track it.
		vendavel: false,
		rastreamentoEstoqueAtivo: line.contaContabilId == null,
	};
}

function getNewProductKey(line: TReviewLine) {
	return (line.ean?.trim() || line.codigoFornecedor?.trim() || line.produtoNovo?.nome.trim() || line.id).toUpperCase();
}

/**
 * Lines with the same EAN/code become ONE product: the same merchandise may show up in more than
 * one line or file. Returns the products to create and the product id each line ends up with.
 */
export function resolveNewProducts(lines: TReviewLine[]) {
	const productByKey = new Map<string, TNewProductDraft & { precoCusto: number | null }>();
	const productIdByLineId = new Map<string, string>();
	for (const line of lines) {
		if (!line.incluir || line.produto || !line.produtoNovo) continue;
		const key = getNewProductKey(line);
		let product = productByKey.get(key);
		if (!product) {
			const converted = convertLineToProductUnit({
				quantidade: line.quantidade,
				valorUnitario: line.valorUnitario,
				fatorConversao: line.fatorConversao,
			});
			product = { ...line.produtoNovo, precoCusto: converted.valorUnitario };
			productByKey.set(key, product);
		}
		productIdByLineId.set(line.id, product.id);
	}
	return { newProducts: [...productByKey.values()], productIdByLineId };
}

export function buildSupplierProductMappings(lines: TReviewLine[], productIdByLineId: Map<string, string>) {
	return lines.flatMap((line) => {
		if (!line.incluir || !line.lembrarVinculo) return [];
		if (!line.codigoFornecedor?.trim() && !line.ean?.trim()) return [];
		const produtoId = line.produto?.id ?? productIdByLineId.get(line.id);
		if (!produtoId) return [];
		return [
			{
				codigoFornecedor: line.codigoFornecedor,
				ean: line.ean,
				produtoId,
				produtoVarianteId: line.produto ? line.produtoVarianteId : null,
				unidadeExterna: line.unidade,
				fatorConversao: line.fatorConversao,
			},
		];
	});
}

/** Applies a tax treatment to one modifier, or to every untreated modifier of the same tax in the invoice. */
export function applyTaxTreatment({
	lines,
	lineId,
	modifierIndex,
	tratamento,
	applyToWholeDocument,
}: {
	lines: TReviewLine[];
	lineId: string;
	modifierIndex: number;
	tratamento: TPurchaseCostTreatmentEnum;
	applyToWholeDocument: boolean;
}) {
	const target = lines.find((line) => line.id === lineId)?.modificadoresCusto?.[modifierIndex];
	if (!target) return lines;
	return lines.map((line) => {
		if (line.id !== lineId && !applyToWholeDocument) return line;
		return {
			...line,
			modificadoresCusto: (line.modificadoresCusto ?? []).map((modifier, index) => {
				if (line.id === lineId && index === modifierIndex) return { ...modifier, tratamento };
				if (applyToWholeDocument && modifier.chave === target.chave && modifier.tratamento === null) return { ...modifier, tratamento };
				return modifier;
			}),
		};
	});
}
