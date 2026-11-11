import type { TGetProductsOutputById } from "@/app/api/products/route";
import { DEMO_ORGANIZATION_ID } from "./session";

// Episódio g003 (curva ABC): o picolé de morango, item A, 1º em faturamento.
export const DEMO_PRODUCT_ID = "content-studio-picole-morango";

export const DEMO_PRODUCT = {
	id: DEMO_PRODUCT_ID,
	organizacaoId: DEMO_ORGANIZATION_ID,
	ativo: true,
	vendavel: true,
	nome: "PICOLÉ DE MORANGO",
	descricao: "Picolé de fruta, 70 g.",
	imagemCapaUrl: null,
	codigo: "PIC-001",
	unidade: "UN",
	quantidade: 186,
	precoVenda: 10,
	precoVendaAnterior: null,
	dataAlteracaoPrecoVenda: null,
	precoCusto: 7,
	codigoBarras: null,
	conteudoQuantidade: null,
	conteudoUnidade: null,
	ncm: "21050010",
	tipo: "PRODUTO",
	grupo: "PICOLÉS",
	rastreamentoEstoqueAtivo: true,
	baixaEstoqueModo: "ESTOQUE_PROPRIO",
	fichaTecnicaReceitaId: null,
	fornecedorPrincipalId: null,
	dataUltimaSincronizacao: null,
	dataInsercao: new Date("2026-02-01T12:00:00Z"),
	dataAtualizacao: new Date("2026-10-30T12:00:00Z"),
	variantes: [],
	opcoes: [],
	addOnsReferencias: [],
	perfisFiscais: [],
	fornecedorPrincipal: null,
} satisfies TGetProductsOutputById;
