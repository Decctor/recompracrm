import type { TCreatePurchaseInput } from "@/app/api/purchases/route";
import { createEmptyPurchaseItem, normalizeItemValues } from "@/components/Modals/Purchases/Blocks/Items";
import { convertLineToProductUnit } from "@/lib/purchase/units";
import type { TPurchaseState } from "@/state-hooks/use-purchase-state";
import { buildSupplierProductMappings, resolveNewProducts, type TReviewLine } from "./review-lines";

export type TNewSupplierDraft = {
	nome: string;
	cpfCnpj: string | null;
	inscricaoEstadual: string | null;
	telefone: string | null;
	email: string | null;
};

type TPurchaseItemState = TPurchaseState["purchaseItems"][number];

/** Turns the reviewed invoice lines into purchase items, already converted to the product's unit. */
export function buildPurchaseItemsFromLines(lines: TReviewLine[], productIdByLineId: Map<string, string>): TPurchaseItemState[] {
	return lines.flatMap((line) => {
		if (!line.incluir) return [];
		const produtoId = line.produto?.id ?? productIdByLineId.get(line.id);
		if (!produtoId) return [];
		const produto = line.produto
			? { nome: line.produto.nome, codigo: line.produto.codigo, unidade: line.produto.unidade ?? "UN", imagemCapaUrl: line.produto.imagemCapaUrl }
			: {
					nome: line.produtoNovo?.nome.trim() ?? line.descricao,
					codigo: line.produtoNovo?.codigo.trim() ?? "",
					unidade: line.produtoNovo?.unidade.trim() || "UN",
					imagemCapaUrl: null,
				};
		const converted = convertLineToProductUnit({ quantidade: line.quantidade, valorUnitario: line.valorUnitario, fatorConversao: line.fatorConversao });
		return [
			normalizeItemValues({
				...createEmptyPurchaseItem(),
				produtoId,
				produtoVarianteId: line.produto ? line.produtoVarianteId : null,
				snapshotProdutoDescricao: line.produtoVariante?.nome ?? produto.nome,
				snapshotProdutoCodigo: line.produtoVariante?.codigo ?? produto.codigo,
				produto,
				produtoVariante: line.produtoVariante ?? undefined,
				quantidade: converted.quantidade,
				valorUnitarioBruto: converted.valorUnitario,
				descontosTotal: line.desconto ?? 0,
				modificadoresCusto: {
					versao: 1,
					modificadores: (line.modificadoresCusto ?? []).flatMap((modifier) =>
						modifier.tratamento
							? [
									{
										...modifier,
										tratamento: modifier.tratamento,
										origem: line.origemImportacao === "XML" ? ("XML" as const) : ("IA" as const),
										documentoRef: line.documentoRef,
										rateio: { metodo: "INFORMADO_ITEM" as const },
									},
								]
							: [],
					),
				},
				// The values read from the invoice stay recorded, whatever the conversion.
				externoQtde: line.extraidoQuantidade,
				externoValor: line.extraidoValorUnitario,
				externoUnidade: line.unidade,
				externoFatorConversao: line.fatorConversao,
				anotacoes: `Importado via ${line.origemImportacao}: ${line.descricao}`,
			}),
		];
	});
}

export function buildCreatePurchaseInput({
	state,
	lines,
	newSupplier,
	received,
}: {
	state: TPurchaseState;
	lines: TReviewLine[];
	newSupplier: TNewSupplierDraft | null;
	received: boolean;
}): TCreatePurchaseInput {
	const { newProducts, productIdByLineId } = resolveNewProducts(lines);
	const hasSupplier = !!newSupplier || !!state.purchase.fornecedorId;
	const purchaseItems = [...buildPurchaseItemsFromLines(lines, productIdByLineId), ...state.purchaseItems.filter((item) => !item.deletar)];

	return {
		purchase: {
			...state.purchase,
			fornecedorId: newSupplier ? null : state.purchase.fornecedorId,
			status: received ? "RECEBIDA" : "CONFIRMADA",
			entregaDataRecebimentoEfetivacao: received ? (state.purchase.entregaDataRecebimentoEfetivacao ?? new Date()) : null,
		},
		importedDocuments: state.purchase.documentosImportados?.documentos ?? [],
		purchaseItems,
		lancamentoContabil: {
			...state.lancamentoContabil,
			titulo: state.lancamentoContabil.titulo.trim() || state.purchase.titulo,
		},
		newSupplier: newSupplier
			? {
					nome: newSupplier.nome.trim(),
					cpfCnpj: newSupplier.cpfCnpj,
					inscricaoEstadual: newSupplier.inscricaoEstadual,
					telefone: newSupplier.telefone,
					email: newSupplier.email,
				}
			: null,
		newProducts: newProducts.map((product) => ({
			id: product.id,
			nome: product.nome.trim(),
			codigo: product.codigo.trim(),
			codigoBarras: product.codigoBarras,
			unidade: product.unidade.trim() || "UN",
			ncm: product.ncm.trim(),
			vendavel: product.vendavel,
			rastreamentoEstoqueAtivo: product.rastreamentoEstoqueAtivo,
			precoCusto: product.precoCusto,
		})),
		// Without a supplier there is nobody to remember the links for.
		supplierProductMappings: hasSupplier ? buildSupplierProductMappings(lines, productIdByLineId) : [],
	};
}
