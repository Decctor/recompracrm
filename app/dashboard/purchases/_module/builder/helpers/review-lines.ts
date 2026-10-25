import type { TImportPurchaseCompositionOutput } from "@/app/api/purchases/import-composition/route";
import type { TAcquisitionNatureEnum, TPurchaseCostTreatmentEnum } from "@/schemas/enums";
import { convertLineToProductUnit, unitsAreEquivalent } from "@/lib/purchase/units";
import { computeFiscoComponents, replaceCalculatedFiscoComponents, type TEntryFiscoContext } from "@/lib/fiscal/entry/fisco-components";

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
	natureza: TAcquisitionNatureEnum;
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
	/** Para que esta aquisição serve. Sugerida pelo de-para/produto; a pessoa pode trocar. */
	destinacao: TAcquisitionNatureEnum;
};

export type TReviewIssue = "unmapped" | "suggested" | "unit" | "tax";
export type TReviewLineStatus = "ignored" | "pending" | "ready";

export const REVIEW_ISSUE_ORDER: TReviewIssue[] = ["unmapped", "suggested", "unit", "tax"];

export function createReviewLines(result: TImportResult, createId: () => string): TReviewLine[] {
	return result.itens.map((item) => ({
		...item,
		id: createId(),
		// Consignação, remessa, devolução: a linha fica visível com o motivo, mas não entra.
		incluir: !item.foraDaCompra,
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
		destinacao: item.destinacaoSugerida,
	}));
}

/** Troca a destinação e refaz o que é devido ao fisco por ela (DIFAL para uso e consumo, por exemplo). */
export function applyLineDestination({
	lines,
	lineId,
	destinacao,
	context,
}: {
	lines: TReviewLine[];
	lineId: string;
	destinacao: TAcquisitionNatureEnum;
	context: TEntryFiscoContext | null | undefined;
}) {
	return lines.map((line) => {
		if (line.id !== lineId) return line;
		if (!context || line.origemImportacao !== "XML") return { ...line, destinacao };
		const computed = computeFiscoComponents({ destinacao, valorLinha: line.valorTotal, facts: line.tributacao, context });
		return { ...line, destinacao, modificadoresCusto: replaceCalculatedFiscoComponents(line.modificadoresCusto ?? [], computed) };
	});
}

export type TFiscoObligationSummary = { chave: string; valor: number; linhas: number; uf: string | null; descricao: string | null };

/** O que a compra deve ao fisco, agregado por tributo, nas linhas incluídas. */
export function getFiscoObligations(lines: TReviewLine[]): TFiscoObligationSummary[] {
	const byKey = new Map<string, TFiscoObligationSummary>();
	for (const line of lines) {
		if (!line.incluir) continue;
		for (const modifier of line.modificadoresCusto ?? []) {
			if (modifier.contrapartida !== "FISCO") continue;
			const current = byKey.get(modifier.chave) ?? {
				chave: modifier.chave,
				valor: 0,
				linhas: 0,
				uf: modifier.memoriaCalculo?.uf ?? null,
				descricao: modifier.descricao ?? null,
			};
			current.valor = Math.round((current.valor + modifier.valorCentavos / 100) * 100) / 100;
			current.linhas += 1;
			byKey.set(modifier.chave, current);
		}
	}
	return [...byKey.values()];
}

/** A destinação escolhida difere do que o cadastro diz que o produto é: aviso, não bloqueio. */
export function lineHasDestinationDivergence(line: TReviewLine) {
	return !!line.produto && line.produto.natureza !== line.destinacao;
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
		// Embedded taxes (INCLUSO_NO_VALOR) are already inside the printed price.
		return (
			line.quantidade * line.valorUnitario +
			line.modificadoresCusto
				// Só o que o fornecedor cobra: embutido já está no preço; o devido ao fisco é outra guia.
				.filter((modifier) => !modifier.contrapartida || modifier.contrapartida === "FORNECEDOR")
				.reduce((total, modifier) => total + (modifier.efeito === "REDUCAO" ? -1 : 1) * (modifier.valorCentavos / 100), 0)
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
		// tracking on — the purchase itself gives the first stock entry.
		vendavel: false,
		rastreamentoEstoqueAtivo: true,
		// O cadastro nasce com o que a compra diz que o item é.
		natureza: line.destinacao,
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
				destinacao: line.destinacao,
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
	// "Fica no custo" para um tributo embutido significa "deixa no preço": o componente some.
	const dropsEmbedded = tratamento === "CUSTO_ESTOQUE";
	return lines.map((line) => {
		if (line.id !== lineId && !applyToWholeDocument) return line;
		return {
			...line,
			modificadoresCusto: (line.modificadoresCusto ?? []).flatMap((modifier, index) => {
				const isTarget = line.id === lineId && index === modifierIndex;
				const isSameTaxInDocument = applyToWholeDocument && modifier.chave === target.chave && modifier.tratamento === null;
				if (!isTarget && !isSameTaxInDocument) return [modifier];
				if (modifier.contrapartida === "INCLUSO_NO_VALOR" && dropsEmbedded) return [];
				return [{ ...modifier, tratamento }];
			}),
		};
	});
}
