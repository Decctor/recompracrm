// Partes do fornecedor principal sem dependência de banco: usadas pela rota e pelo client.

// Compras que de fato aconteceram: rascunho ainda não é compra e cancelada não conta.
export const MAIN_SUPPLIER_EFFECTIVE_PURCHASE_STATUSES = ["CONFIRMADA", "RECEBIMENTO_PARCIAL", "RECEBIDA"] as const;
// Janela da frequência recente: quem fornece hoje pesa mais do que quem fornecia há dois anos.
export const MAIN_SUPPLIER_SUGGESTION_WINDOW_MONTHS = 12;

export type TMainSupplierCandidateRow = {
	fornecedorId: string;
	fornecedorNome: string;
	fornecedorCpfCnpj: string | null;
	fornecedorAtivo: boolean;
	comprasRecentes: number | string;
	comprasTotal: number | string;
	quantidadeTotal: number | string;
	valorTotal: number | string;
	dataUltimaCompra: string | Date | null;
	comprasTotalProduto: number | string;
	posicao: number | string;
};

// Agregações do Postgres chegam como string (bigint/numeric): normaliza para o payload.
export function formatMainSupplierCandidate(row: TMainSupplierCandidateRow) {
	const comprasTotal = Number(row.comprasTotal);
	const comprasTotalProduto = Number(row.comprasTotalProduto);
	return {
		fornecedor: { id: row.fornecedorId, nome: row.fornecedorNome, cpfCnpj: row.fornecedorCpfCnpj, ativo: row.fornecedorAtivo },
		comprasRecentes: Number(row.comprasRecentes),
		comprasTotal,
		quantidadeTotal: Number(row.quantidadeTotal),
		valorTotal: Number(row.valorTotal),
		dataUltimaCompra: row.dataUltimaCompra ? new Date(row.dataUltimaCompra) : null,
		// Fração das compras do produto feitas com este fornecedor (0–1).
		participacao: comprasTotalProduto > 0 ? comprasTotal / comprasTotalProduto : 0,
		sugerido: Number(row.posicao) === 1,
	};
}
export type TMainSupplierCandidate = ReturnType<typeof formatMainSupplierCandidate>;
