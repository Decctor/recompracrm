import type { DB } from "@/services/drizzle";
import { products, purchaseItems, purchases, suppliers } from "@/services/drizzle/schema";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import {
	formatMainSupplierCandidate,
	MAIN_SUPPLIER_EFFECTIVE_PURCHASE_STATUSES,
	MAIN_SUPPLIER_SUGGESTION_WINDOW_MONTHS,
} from "./main-supplier-shared";

// ============================================================================
// Fornecedor principal do produto — SUGESTÕES a partir do histórico de compras.
//
// Nada aqui escreve em `products.fornecedorPrincipalId`: a atribuição é sempre uma ação do usuário
// (PUT /api/products/main-supplier). Inferir e gravar sozinho sobrescreveria uma escolha consciente
// (ex.: o fornecedor de contrato, não o que entregou a última compra emergencial).
// ============================================================================

type TBuildCandidatesParams = {
	organizacaoId: string;
	// Restringe a esses produtos (sugestão de um produto); ausente = todos os produtos da organização.
	productIds?: string[];
	// Só produtos ainda sem fornecedor principal (sugestão em lote: nunca propõe trocar uma escolha feita).
	onlyUnassigned?: boolean;
};

// Uma linha por (produto, fornecedor) com as estatísticas de compra e a posição do fornecedor no ranking
// do produto. Critério: compras na janela recente → compra mais recente → compras no total.
// `posicao = 1` é o fornecedor sugerido.
export function buildMainSupplierCandidatesSubquery(database: DB, { organizacaoId, productIds, onlyUnassigned }: TBuildCandidatesParams) {
	const windowStart = new Date();
	windowStart.setMonth(windowStart.getMonth() - MAIN_SUPPLIER_SUGGESTION_WINDOW_MONTHS);

	// Data do pedido quando informada; senão, a de lançamento da compra.
	const purchaseDate = sql`coalesce(${purchases.pedidoData}, ${purchases.dataInsercao})`;
	const recentPurchasesCount = sql<number>`count(distinct ${purchases.id}) filter (where ${purchaseDate} >= ${windowStart.toISOString()}::timestamp)`;
	const totalPurchasesCount = sql<number>`count(distinct ${purchases.id})`;
	const lastPurchaseDate = sql`max(${purchaseDate})`;

	const conditions: SQL[] = [
		eq(purchaseItems.organizacaoId, organizacaoId),
		eq(purchases.organizacaoId, organizacaoId),
		inArray(purchases.status, [...MAIN_SUPPLIER_EFFECTIVE_PURCHASE_STATUSES]),
	];
	if (productIds && productIds.length > 0) conditions.push(inArray(purchaseItems.produtoId, productIds));
	if (onlyUnassigned) conditions.push(isNull(products.fornecedorPrincipalId));

	return database
		.select({
			// Aliases explícitos: a consulta externa junta `products`, que também tem `id`/`nome`.
			produtoId: sql<string>`${purchaseItems.produtoId}`.as("candidato_produto_id"),
			fornecedorId: sql<string>`${suppliers.id}`.as("fornecedor_id"),
			fornecedorNome: sql<string>`${suppliers.nome}`.as("fornecedor_nome"),
			fornecedorCpfCnpj: sql<string | null>`${suppliers.cpfCnpj}`.as("fornecedor_cpf_cnpj"),
			fornecedorAtivo: sql<boolean>`${suppliers.ativo}`.as("fornecedor_ativo"),
			comprasRecentes: recentPurchasesCount.as("compras_recentes"),
			comprasTotal: totalPurchasesCount.as("compras_total"),
			quantidadeTotal: sql<number>`coalesce(sum(${purchaseItems.quantidade}), 0)`.as("quantidade_total"),
			valorTotal: sql<number>`coalesce(sum(coalesce(${purchaseItems.valorTotalLiquido}, ${purchaseItems.valorTotalBruto})), 0)`.as("valor_total"),
			dataUltimaCompra: sql<string>`${lastPurchaseDate}`.as("data_ultima_compra"),
			// Total de compras do produto (todos os fornecedores): base da participação do sugerido.
			comprasTotalProduto: sql<number>`sum(${totalPurchasesCount}) over (partition by ${purchaseItems.produtoId})`.as("compras_total_produto"),
			fornecedoresCandidatos: sql<number>`count(*) over (partition by ${purchaseItems.produtoId})`.as("fornecedores_candidatos"),
			posicao: sql<number>`row_number() over (
				partition by ${purchaseItems.produtoId}
				order by ${recentPurchasesCount} desc, ${lastPurchaseDate} desc nulls last, ${totalPurchasesCount} desc, ${suppliers.nome} asc
			)`.as("posicao"),
		})
		.from(purchaseItems)
		.innerJoin(purchases, eq(purchases.id, purchaseItems.compraId))
		.innerJoin(suppliers, and(eq(suppliers.id, purchases.fornecedorId), eq(suppliers.organizacaoId, organizacaoId)))
		.innerJoin(products, eq(products.id, purchaseItems.produtoId))
		.where(and(...conditions))
		.groupBy(purchaseItems.produtoId, suppliers.id, suppliers.nome, suppliers.cpfCnpj, suppliers.ativo)
		.as("main_supplier_candidates");
}

export async function getMainSupplierCandidatesForProduct(database: DB, { organizacaoId, productId }: { organizacaoId: string; productId: string }) {
	const candidates = buildMainSupplierCandidatesSubquery(database, { organizacaoId, productIds: [productId] });
	const rows = await database.select().from(candidates).orderBy(asc(candidates.posicao));
	return rows.map(formatMainSupplierCandidate);
}

// Sugestão em lote: produtos SEM fornecedor principal que têm histórico de compra, com o fornecedor sugerido.
export async function getMainSupplierSuggestionsPage(
	database: DB,
	{ organizacaoId, page, pageSize }: { organizacaoId: string; page: number; pageSize: number },
) {
	const candidates = buildMainSupplierCandidatesSubquery(database, { organizacaoId, onlyUnassigned: true });
	const rows = await database
		.select({
			fornecedorId: candidates.fornecedorId,
			fornecedorNome: candidates.fornecedorNome,
			fornecedorCpfCnpj: candidates.fornecedorCpfCnpj,
			fornecedorAtivo: candidates.fornecedorAtivo,
			comprasRecentes: candidates.comprasRecentes,
			comprasTotal: candidates.comprasTotal,
			quantidadeTotal: candidates.quantidadeTotal,
			valorTotal: candidates.valorTotal,
			dataUltimaCompra: candidates.dataUltimaCompra,
			comprasTotalProduto: candidates.comprasTotalProduto,
			fornecedoresCandidatos: candidates.fornecedoresCandidatos,
			posicao: candidates.posicao,
			produto: { id: products.id, nome: products.nome, codigo: products.codigo, grupo: products.grupo, imagemCapaUrl: products.imagemCapaUrl },
			total: sql<number>`count(*) over ()`,
		})
		.from(candidates)
		.innerJoin(products, eq(products.id, candidates.produtoId))
		.where(eq(candidates.posicao, 1))
		// Os mais evidentes primeiro: mais compras recentes, depois o nome.
		.orderBy(desc(candidates.comprasRecentes), desc(candidates.comprasTotal), asc(products.nome), asc(products.id))
		.offset(pageSize * (page - 1))
		.limit(pageSize);

	const total = rows.length > 0 ? Number(rows[0].total) : 0;
	return {
		suggestions: rows.map((row) => ({
			produto: row.produto,
			fornecedoresCandidatos: Number(row.fornecedoresCandidatos),
			sugestao: formatMainSupplierCandidate(row),
		})),
		total,
		totalPages: Math.ceil(total / pageSize),
	};
}
