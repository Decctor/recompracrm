import type { TFilterTree } from "@/schemas/campaign-audiences";
import type { DBTransaction } from "@/services/drizzle";
import { clients, saleItems } from "@/services/drizzle/schema";
import { type SQL, and, count, eq, gte, inArray, isNotNull, lte, ne, sql, sum, desc } from "drizzle-orm";

/**
 * Resolves an audience filter tree into a list of matching client IDs.
 */
export async function resolveAudience({
	tx,
	organizacaoId,
	filtros,
}: {
	tx: DBTransaction;
	organizacaoId: string;
	filtros: TFilterTree;
}): Promise<string[]> {
	const whereClause = buildFilterClause(filtros, organizacaoId);

	const result = await tx
		.select({ id: clients.id })
		.from(clients)
		.where(and(eq(clients.organizacaoId, organizacaoId), whereClause));

	return result.map((r) => r.id);
}

/**
 * Checks if a single client matches the audience filters.
 */
export async function checkClientInAudience({
	tx,
	organizacaoId,
	clienteId,
	filtros,
}: {
	tx: DBTransaction;
	organizacaoId: string;
	clienteId: string;
	filtros: TFilterTree;
}): Promise<boolean> {
	const whereClause = buildFilterClause(filtros, organizacaoId);

	const result = await tx
		.select({ id: clients.id })
		.from(clients)
		.where(and(eq(clients.organizacaoId, organizacaoId), eq(clients.id, clienteId), whereClause))
		.limit(1);

	return result.length > 0;
}

/**
 * Preview an audience: returns count + sample of matching clients.
 */
export async function previewAudience({
	tx,
	organizacaoId,
	filtros,
	sampleSize = 10,
}: {
	tx: DBTransaction;
	organizacaoId: string;
	filtros: TFilterTree;
	sampleSize?: number;
}): Promise<{
	total: number;
	amostra: { id: string; nome: string; telefone: string }[];
}> {
	const whereClause = buildFilterClause(filtros, organizacaoId);
	const baseWhere = and(eq(clients.organizacaoId, organizacaoId), whereClause);

	const [countResult, sampleResult] = await Promise.all([
		tx.select({ total: count() }).from(clients).where(baseWhere),
		tx
			.select({ id: clients.id, nome: clients.nome, telefone: clients.telefone })
			.from(clients)
			.where(baseWhere)
			.limit(sampleSize),
	]);

	return {
		total: countResult[0]?.total ?? 0,
		amostra: sampleResult,
	};
}

// ============================================================================
// FILTER CLAUSE BUILDER
// ============================================================================

function buildFilterClause(filtros: TFilterTree, organizacaoId: string): SQL | undefined {
	const conditions: (SQL | undefined)[] = [];

	// Process direct conditions
	for (const condicao of filtros.condicoes) {
		const clause = buildConditionClause(condicao.tipo, condicao.configuracao, organizacaoId);
		if (clause) conditions.push(clause);
	}

	// Process nested groups
	if (filtros.grupos) {
		for (const grupo of filtros.grupos) {
			const groupClause = buildFilterClause(grupo, organizacaoId);
			if (groupClause) conditions.push(groupClause);
		}
	}

	const validConditions = conditions.filter((c): c is SQL => c !== undefined);
	if (validConditions.length === 0) return undefined;

	if (filtros.logica === "AND") {
		return and(...validConditions);
	}
	// OR
	return sql`(${sql.join(validConditions, sql` OR `)})`;
}

function buildConditionClause(tipo: string, config: Record<string, unknown>, organizacaoId: string): SQL | undefined {
	switch (tipo) {
		case "SEGMENTO-RFM": {
			const segmentos = config.segmentos as string[];
			if (!segmentos?.length) return undefined;
			return inArray(clients.analiseRFMTitulo, segmentos);
		}

		case "LOCALIZACAO-CIDADE": {
			const cidades = config.cidades as string[];
			if (!cidades?.length) return undefined;
			return inArray(clients.localizacaoCidade, cidades);
		}

		case "LOCALIZACAO-ESTADO": {
			const estados = config.estados as string[];
			if (!estados?.length) return undefined;
			return inArray(clients.localizacaoEstado, estados);
		}

		case "FAIXA-ETARIA": {
			const idadeMinima = config.idadeMinima as number | undefined;
			const idadeMaxima = config.idadeMaxima as number | undefined;
			const ageClauses: SQL[] = [];
			if (idadeMinima != null) {
				ageClauses.push(sql`EXTRACT(YEAR FROM AGE(NOW(), ${clients.dataNascimento})) >= ${idadeMinima}`);
			}
			if (idadeMaxima != null) {
				ageClauses.push(sql`EXTRACT(YEAR FROM AGE(NOW(), ${clients.dataNascimento})) <= ${idadeMaxima}`);
			}
			if (ageClauses.length === 0) return undefined;
			return and(isNotNull(clients.dataNascimento), ...ageClauses);
		}

		case "TOTAL-COMPRAS-QUANTIDADE": {
			return buildComparisonClause(clients.metadataTotalCompras, config);
		}

		case "TOTAL-COMPRAS-VALOR": {
			return buildComparisonClause(clients.metadataValorTotalCompras, config);
		}

		case "ULTIMA-COMPRA": {
			return buildDateClause(clients.ultimaCompraData, config);
		}

		case "PRIMEIRA-COMPRA": {
			return buildDateClause(clients.primeiraCompraData, config);
		}

		case "TEM-TELEFONE": {
			return and(isNotNull(clients.telefone), ne(clients.telefone, ""));
		}

		case "TEM-EMAIL": {
			return and(isNotNull(clients.email), ne(clients.email, ""));
		}

		case "TOP-N-COMPRADORES": {
			const quantidade = config.quantidade as number;
			const criterio = config.criterio as "VALOR" | "QUANTIDADE";
			if (!quantidade) return undefined;
			return buildTopNClause({ organizacaoId, quantidade, criterio });
		}

		case "TOP-N-PRODUTO": {
			const quantidade = config.quantidade as number;
			const produtoId = config.produtoId as string;
			const criterio = config.criterio as "VALOR" | "QUANTIDADE";
			if (!quantidade || !produtoId) return undefined;
			return buildTopNClause({ organizacaoId, quantidade, criterio, produtoId });
		}

		case "PRODUTO-COMPRADO": {
			const produtoId = config.produtoId as string;
			if (!produtoId) return undefined;
			return sql`${clients.id} IN (
				SELECT DISTINCT ${saleItems.clienteId}
				FROM ${saleItems}
				WHERE ${saleItems.produtoId} = ${produtoId}
				AND ${saleItems.organizacaoId} = ${organizacaoId}
			)`;
		}

		case "GRUPO-PRODUTO-COMPRADO": {
			const grupo = config.grupo as string;
			if (!grupo) return undefined;
			return sql`${clients.id} IN (
				SELECT DISTINCT si.cliente_id
				FROM ampmais_sale_items si
				JOIN ampmais_products p ON p.id = si.produto_id
				WHERE p.grupo = ${grupo}
				AND si.organizacao_id = ${organizacaoId}
			)`;
		}

		case "SALDO-CASHBACK": {
			const operador = config.operador as string;
			const valor = config.valor as number;
			if (valor == null) return undefined;
			const op = operador === "MAIOR" ? ">=" : operador === "MENOR" ? "<=" : "=";
			return sql`${clients.id} IN (
				SELECT cliente_id FROM ampmais_cashback_program_balances
				WHERE organizacao_id = ${organizacaoId}
				AND saldo_valor_disponivel ${sql.raw(op)} ${valor}
			)`;
		}

		default:
			console.warn(`[AUDIENCE_RESOLVER] Unknown filter type: ${tipo}`);
			return undefined;
	}
}

// ============================================================================
// HELPERS
// ============================================================================

function buildComparisonClause(column: typeof clients.metadataTotalCompras, config: Record<string, unknown>): SQL | undefined {
	const operador = config.operador as string;
	const valor = config.valor as number;
	const valorMax = config.valorMax as number | undefined;

	if (valor == null) return undefined;

	switch (operador) {
		case "MAIOR":
			return gte(column, valor);
		case "MENOR":
			return lte(column, valor);
		case "IGUAL":
			return eq(column, valor);
		case "ENTRE":
			if (valorMax == null) return gte(column, valor);
			return and(gte(column, valor), lte(column, valorMax));
		default:
			return gte(column, valor);
	}
}

function buildDateClause(column: typeof clients.ultimaCompraData, config: Record<string, unknown>): SQL | undefined {
	const operador = config.operador as string;
	const valor = config.valor as string | number;

	if (valor == null) return undefined;

	switch (operador) {
		case "ULTIMOS_N_DIAS":
			return sql`${column} >= NOW() - INTERVAL '${sql.raw(String(valor))} days'`;
		case "ANTES":
			return sql`${column} < ${String(valor)}::timestamp`;
		case "DEPOIS":
			return sql`${column} > ${String(valor)}::timestamp`;
		case "ENTRE": {
			const valorMax = config.valorMax as string;
			if (!valorMax) return sql`${column} > ${String(valor)}::timestamp`;
			return sql`${column} BETWEEN ${String(valor)}::timestamp AND ${valorMax}::timestamp`;
		}
		default:
			return undefined;
	}
}

function buildTopNClause({
	organizacaoId,
	quantidade,
	criterio,
	produtoId,
}: {
	organizacaoId: string;
	quantidade: number;
	criterio: "VALOR" | "QUANTIDADE";
	produtoId?: string;
}): SQL {
	const aggregation = criterio === "VALOR" ? "SUM(si.valor_venda_total_liquido)" : "COUNT(si.id)";
	const productFilter = produtoId ? sql.raw(`AND si.produto_id = '${produtoId}'`) : sql.raw("");

	return sql`${clients.id} IN (
		SELECT si.cliente_id
		FROM ampmais_sale_items si
		WHERE si.organizacao_id = ${organizacaoId}
		AND si.cliente_id IS NOT NULL
		${productFilter}
		GROUP BY si.cliente_id
		ORDER BY ${sql.raw(aggregation)} DESC
		LIMIT ${quantidade}
	)`;
}
