import type { TProductExportEntry } from "@/app/api/products/export/route";
import { formatDateAsLocale } from "@/lib/formatting";

const yesNo = (value: boolean | null) => (value === null ? "" : value ? "Sim" : "Não");
const date = (value: string | Date | null) => (value ? (formatDateAsLocale(value, true) ?? "") : "");

export function buildProductExportSheets(products: TProductExportEntry[]) {
	const fiscal = products.some((product) => "perfisFiscais" in product);
	const suppliers = products.some((product) => "fornecedorPrincipal" in product);
	const identity = (product: TProductExportEntry) => ({ "ID DO PRODUTO": product.id, "CÓDIGO DO PRODUTO": product.codigo, PRODUTO: product.nome });
	const sheets = [
		{
			name: "Produtos",
			rows: products.map((product) => ({
				...identity(product),
				"CÓDIGO DE BARRAS": product.codigoBarras ?? "",
				DESCRIÇÃO: product.descricao ?? "",
				GRUPO: product.grupo,
				TIPO: product.tipo,
				UNIDADE: product.unidade,
				ATIVO: yesNo(product.ativo),
				VENDÁVEL: yesNo(product.vendavel),
				"PREÇO DE VENDA": product.precoVenda,
				"PREÇO DE CUSTO": product.precoCusto,
				ESTOQUE: product.quantidade,
				"RASTREAMENTO DE ESTOQUE": yesNo(product.rastreamentoEstoqueAtivo),
				...(suppliers ? { "FORNECEDOR PRINCIPAL": product.fornecedorPrincipal?.nome ?? "" } : {}),
				...(fiscal
					? { "NCM DO CADASTRO": product.ncm ?? "", "NCM DO PERFIL BASE": product.perfisFiscais?.find((profile) => !profile.produtoVarianteId)?.ncm ?? "" }
					: {}),
				"VALOR VENDIDO NO PERÍODO": product.estatisticas.vendasValorTotal,
				"QUANTIDADE VENDIDA NO PERÍODO": product.estatisticas.vendasQtdeTotal,
				"CUSTO DAS VENDAS NO PERÍODO": product.estatisticas.vendasCustoTotal,
				"CURVA ABC": product.estatisticas.curvaABC,
				"PRIMEIRA VENDA NO PERÍODO": date(product.estatisticas.dataPrimeiraVenda),
				"ÚLTIMA VENDA NO PERÍODO": date(product.estatisticas.dataUltimaVenda),
				"DATA DE CADASTRO": date(product.dataInsercao),
				"ÚLTIMA ALTERAÇÃO": date(product.dataAtualizacao),
				"ÚLTIMA SINCRONIZAÇÃO": date(product.dataUltimaSincronizacao),
			})),
		},
		{
			name: "Variantes",
			rows: products.flatMap((product) =>
				product.variantes.map((variant) => ({
					...identity(product),
					"ID DA VARIANTE": variant.id,
					VARIANTE: variant.nome,
					"CÓDIGO DA VARIANTE": variant.codigo ?? "",
					"CÓDIGO DE BARRAS": variant.codigoBarras ?? "",
					"PREÇO DE VENDA": variant.precoVenda,
					"PREÇO DE CUSTO": variant.precoCusto,
					ESTOQUE: variant.quantidade,
					ATIVO: yesNo(variant.ativo),
					"RASTREAMENTO DE ESTOQUE": yesNo(variant.rastreamentoEstoqueAtivo),
				})),
			),
		},
		...(fiscal
			? [
					{
						name: "Perfis fiscais",
						rows: products.flatMap((product) =>
							(product.perfisFiscais ?? []).map((profile) => ({
								...identity(product),
								"ID DO PERFIL": profile.id,
								"ID DA VARIANTE": profile.produtoVarianteId ?? "",
								VARIANTE: profile.produtoVarianteId
									? (product.variantes.find((variant) => variant.id === profile.produtoVarianteId)?.nome ?? profile.produtoVarianteId)
									: "Produto base",
								NCM: profile.ncm,
								"EX TIPI": profile.exTipi ?? "",
								CEST: profile.cest ?? "",
								"CFOP PADRÃO": profile.cfopPadrao ?? "",
								"ORIGEM DA MERCADORIA": profile.origemMercadoria.replaceAll("_", " "),
								"UNIDADE COMERCIAL": profile.unidadeComercial,
								"CÓDIGO DE BENEFÍCIO FISCAL": profile.codigoBeneficioFiscal ?? "",
								"GRUPO TRIBUTÁRIO": profile.grupoTributario?.nome ?? "",
							})),
						),
					},
				]
			: []),
	];
	return sheets.map((sheet) => {
		const headers = sheet.rows.length
			? Object.keys(sheet.rows[0])
			: sheet.name === "Variantes"
				? [
						"ID DO PRODUTO",
						"C\u00d3DIGO DO PRODUTO",
						"PRODUTO",
						"ID DA VARIANTE",
						"VARIANTE",
						"C\u00d3DIGO DA VARIANTE",
						"C\u00d3DIGO DE BARRAS",
						"PRE\u00c7O DE VENDA",
						"PRE\u00c7O DE CUSTO",
						"ESTOQUE",
						"ATIVO",
						"RASTREAMENTO DE ESTOQUE",
					]
				: [
						"ID DO PRODUTO",
						"C\u00d3DIGO DO PRODUTO",
						"PRODUTO",
						"ID DO PERFIL",
						"ID DA VARIANTE",
						"VARIANTE",
						"NCM",
						"EX TIPI",
						"CEST",
						"CFOP PADR\u00c3O",
						"ORIGEM DA MERCADORIA",
						"UNIDADE COMERCIAL",
						"C\u00d3DIGO DE BENEF\u00cdCIO FISCAL",
						"GRUPO TRIBUT\u00c1RIO",
					];
		return { ...sheet, headers, columnWidths: headers.map((header) => Math.min(42, Math.max(16, header.length + 2))) };
	});
}
