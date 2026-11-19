import {
	createSimilarityExpression,
	createSimplifiedEqualityCondition,
	createSimplifiedSearchCondition,
	createWordSimilarityExpression,
	extractSearchTokens,
} from "@/lib/search";
import { resolveProductAvailability, resolveVariantAvailability } from "@/lib/products/availability";
import type { TAiAgentStockConfig } from "@/schemas/ai-agents";
import type { TProductStockDeductionModeEnum } from "@/schemas/enums";
import { products, productVariants } from "@/services/drizzle/schema";
import { and, asc, count, desc, eq, exists, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import z from "zod";
import { findProductGroupByName, listActiveProductGroups } from "../shared/product-groups";
import { defineAgentTool } from "./define-tool";
import { formatAvailabilityForClient } from "./product-availability";
import { normalizeProductQueryInput } from "./product-query-policy";
import type { TAgentToolContext } from "./types";

/**
 * Consulta unificada do catálogo da organização.
 *
 * Substitui `search_products`, `get_products_by_group`, `get_product_by_code` e
 * `get_available_product_groups` — todas variações da mesma consulta.
 *
 * Corrige o furo multi-tenant do módulo antigo: as consultas de produto rodavam sem filtro de
 * organização e podiam devolver o catálogo de outra empresa. Aqui `organizacaoId` vem do
 * contexto e entra em todos os `where`.
 *
 * A busca por `termo` segue o mesmo padrão da conciliação de notas fiscais
 * (`lib/purchase/match-products.ts`): tokens sem acento sobre o índice trigram de
 * `products.nome`, ranking por `similarity`, e — quando nada casa — uma passada de
 * aproximação por `word_similarity` que devolve os mais parecidos em vez de um vazio seco.
 */

/**
 * Limiar de "parecido o suficiente" para a passada de aproximação. Baixo de propósito: ela só
 * roda quando a busca normal deu vazio, o resultado é ranqueado e o agente é instruído a
 * confirmar com o cliente antes de assumir o produto.
 */
const APPROXIMATE_MATCH_MIN_WORD_SIMILARITY = 0.35;

type TFoundProduct = {
	id: string;
	nome: string;
	codigo: string;
	grupo: string;
	unidade: string;
	precoVenda: number | null;
	descricao: string | null;
	quantidade: number | null;
	rastreamentoEstoqueAtivo: boolean | null;
	baixaEstoqueModo: TProductStockDeductionModeEnum | null;
	variantes: Array<{
		id: string;
		nome: string;
		codigo: string | null;
		precoVenda: number;
		quantidade: number | null;
		rastreamentoEstoqueAtivo: boolean | null;
	}>;
};

/**
 * Campos sensíveis são **omitidos**, nunca nulos.
 *
 * Vale para o preço e para o estoque pela mesma razão: `preco: null` e `quantidade: null` chegam ao
 * modelo como zero, e um zero inventado é a origem do bug em que o agente nega um produto que
 * existe. Sem o campo, não há o que alucinar — ele pergunta ou consulta.
 */
function formatProducts(
	found: TFoundProduct[],
	{ pricesVisible, stockVisibility }: { pricesVisible: boolean; stockVisibility: TAiAgentStockConfig["visibilidade"] },
) {
	return found.map((product) => ({
		produtoId: product.id,
		nome: product.nome,
		codigo: product.codigo,
		grupo: product.grupo,
		unidade: product.unidade,
		...(pricesVisible && product.precoVenda !== null ? { preco: product.precoVenda } : {}),
		...formatAvailabilityForClient(resolveProductAvailability(product), stockVisibility),
		descricao: product.descricao,
		variacoes: product.variantes.map((variant) => ({
			produtoVarianteId: variant.id,
			nome: variant.nome,
			codigo: variant.codigo,
			...(pricesVisible ? { preco: variant.precoVenda } : {}),
			...formatAvailabilityForClient(resolveVariantAvailability(variant, product), stockVisibility),
		})),
	}));
}

/**
 * Condição do termo: cada token precisa casar em algum lugar visível do produto — nome do
 * produto, nome/código de uma variação ativa, ou o código do produto por prefixo. O OR entre
 * tokens é deliberado (o padrão da conciliação de notas): recall alto, e o ranking por
 * similaridade coloca os melhores no topo.
 */
function buildTermCondition({
	db,
	organizacaoId,
	termo,
	activeOnly,
}: {
	db: TAgentToolContext["db"];
	organizacaoId: string;
	termo: string;
	activeOnly: boolean;
}): SQL | undefined {
	const tokens = extractSearchTokens(termo);
	// Termo sem token aproveitável (ex.: "a b"): cai para a substring do termo inteiro.
	const nameTerms = tokens.length > 0 ? tokens : [termo];
	const codePrefix = `${termo}%`;

	const variantConditions = [eq(productVariants.produtoId, products.id), eq(productVariants.organizacaoId, organizacaoId)];
	if (activeOnly) variantConditions.push(eq(productVariants.ativo, true));
	const variantTermCondition = or(
		...nameTerms.map((term) => createSimplifiedSearchCondition(productVariants.nome, term)),
		ilike(productVariants.codigo, codePrefix),
	);
	if (variantTermCondition) variantConditions.push(variantTermCondition);
	const variantMatch = exists(
		db
			.select({ id: productVariants.id })
			.from(productVariants)
			.where(and(...variantConditions)),
	);

	return or(...nameTerms.map((term) => createSimplifiedSearchCondition(products.nome, term)), ilike(products.codigo, codePrefix), variantMatch);
}

/**
 * Busca em duas fases, e não por acaso: o `findMany` relacional apelida a tabela
 * (`FROM "ampmais_products" "products"`), e um `EXISTS` construído com `db.select()` serializa a
 * correlação pelo nome bruto (`"ampmais_products"."id"`) — que sai de escopo quando o alias
 * existe, quebrando a query. A fase 1 resolve os IDs ranqueados no select builder (tabela sem
 * alias, correlação válida); a fase 2 usa o relacional só com `IN (ids)` para montar as variações.
 */
async function fetchRankedProducts({
	db,
	organizacaoId,
	where,
	orderBy,
	limit,
	activeOnly,
}: {
	db: TAgentToolContext["db"];
	organizacaoId: string;
	where: SQL | undefined;
	orderBy: SQL[];
	limit: number;
	activeOnly: boolean;
}): Promise<TFoundProduct[]> {
	const ranked = await db
		.select({ id: products.id })
		.from(products)
		.where(where)
		.orderBy(...orderBy)
		.limit(limit);
	if (ranked.length === 0) return [];
	const ids = ranked.map((row) => row.id);

	const rows = await db.query.products.findMany({
		where: and(eq(products.organizacaoId, organizacaoId), inArray(products.id, ids)),
		columns: {
			id: true,
			nome: true,
			codigo: true,
			grupo: true,
			unidade: true,
			precoVenda: true,
			descricao: true,
			quantidade: true,
			rastreamentoEstoqueAtivo: true,
			baixaEstoqueModo: true,
		},
		with: {
			variantes: {
				where: activeOnly ? (variante, { eq: equals }) => equals(variante.ativo, true) : undefined,
				columns: { id: true, nome: true, codigo: true, precoVenda: true, quantidade: true, rastreamentoEstoqueAtivo: true },
				limit: 20,
			},
		},
	});

	// O IN não preserva ordem: reordena pelo ranking da fase 1.
	const rankById = new Map(ids.map((id, index) => [id, index]));
	return rows.sort((a, b) => (rankById.get(a.id) ?? 0) - (rankById.get(b.id) ?? 0));
}

export const productsTool = defineAgentTool({
	name: "produtos.consultar",
	description: `Consulta o catálogo da empresa. É a única fonte de verdade sobre o que existe, como se
chama e quanto custa.

visao="LISTA" (padrão) devolve produtos com produtoId, nome, código, grupo, variações e preço
(quando a política comercial do agente expõe preços).
visao="GRUPOS" devolve as categorias com a contagem de cada uma — use quando o cliente pergunta
"o que vocês vendem?".

Exemplos:
- "quanto custa um chuveiro 127V?" → { termo: "chuveiro 127", grupo: "CHUVEIRO E DUCHAS" }
- "tem algum até 300 reais?" → { termo: "chuveiro", grupo: "CHUVEIRO E DUCHAS", faixaPreco: { max: 300, origem: "PEDIDA_PELO_CLIENTE" } }
- "o que vocês vendem?" → { visao: "GRUPOS" }

Como buscar:
- termo: palavras-chave curtas ("chuveiro 127", "vinho tinto"), não frases. Ignora acentos e
  maiúsculas, aceita as palavras em qualquer ordem e também casa código por prefixo.
- grupo: uma das grafias exatas da seção "Grupos de produtos do catálogo" do seu contexto.
- faixaPreco: apenas quando o cliente disser um valor. Para buscar sem limite de preço, omita o
  objeto inteiro — não existe faixa "sem limite".
- limite: até 50 produtos por consulta (padrão 10).

Lendo a resposta:
- "totalEncontrado" maior que o limite significa que há mais produtos: refine os filtros em vez
  de pedir páginas.
- "correspondenciaAproximada": true significa que nada casou exatamente e estes são os mais
  parecidos — confirme com o cliente antes de assumir o produto.
- Resultado vazio prova apenas que os filtros não casaram, nunca que a empresa não vende o item.
  Antes de dizer ao cliente que não temos, refaça a busca sem filtros (ou com visao="GRUPOS").
- Campo ausente significa dado não disponível, nunca zero. Sem "preco", o item está sem preço
  cadastrado: não estime valor. Sem "disponibilidade", você não tem informação de estoque.

Lendo a disponibilidade (quando o campo vem):
- "DISPONIVEL": há saldo agora. Não é reserva — o saldo pode mudar até o cliente fechar.
- "ESGOTADO": o saldo está zerado. Pode informar a falta.
- "NAO_RASTREADO": a empresa não controla saldo desse item. Não afirme que tem nem que faltou;
  se o cliente insistir na disponibilidade, diga que a equipe confirma.`,
	inputSchema: z.object({
		termo: z.string().min(2).optional().describe("Palavras-chave curtas do nome do produto/variação, ou o código por prefixo."),
		grupo: z.string().min(1).optional().describe("Restringe a uma categoria/grupo de produtos (grafia exata da lista de grupos do contexto)."),
		faixaPreco: z
			.object({
				min: z.number().positive("O preço mínimo deve ser maior que zero.").optional().describe("Piso em reais, quando o cliente deu um valor mínimo."),
				max: z.number().positive("O preço máximo deve ser maior que zero.").optional().describe("Teto em reais, quando o cliente deu um valor máximo."),
				origem: z.literal("PEDIDA_PELO_CLIENTE").describe('Declara que a faixa saiu da fala do cliente. Único valor aceito: "PEDIDA_PELO_CLIENTE".'),
			})
			.refine((range) => range.min !== undefined || range.max !== undefined, "Informe min, max ou os dois.")
			.refine((range) => range.min === undefined || range.max === undefined || range.min <= range.max, "O preço mínimo não pode ser maior que o máximo.")
			.optional()
			.describe('Faixa de preço pedida pelo cliente ("até 300 reais", "entre 100 e 200"). Omita quando ele não falou de valores.'),
		apenasAtivos: z.boolean().optional().describe("Considerar apenas produtos ativos. Padrão: true."),
		limite: z.number().int().min(1).max(50).optional().describe("Máximo de produtos retornados. Padrão: 10."),
		visao: z.enum(["LISTA", "GRUPOS"]).optional().describe("LISTA para produtos, GRUPOS para as categorias disponíveis."),
	}),
	async execute(input, context) {
		const { db, organizacaoId } = context;
		const normalized = normalizeProductQueryInput(input, context.turn.mensagensRecentesCliente);
		const queryInput = normalized.input;
		if (normalized.faixaPrecoIgnorada) {
			// Alarme de regressão do contrato: com `faixaPreco` declarativa, isto deveria ser raro.
			console.warn(`[AI_AGENT] faixaPreco descartada (nenhum pedido do cliente na janela recente). Run ${context.run.id}.`);
		}
		const pricesVisible = context.capacidades.comercial.precos.visiveis;
		const stockVisibility = context.capacidades.comercial.estoque.visibilidade;
		if (!pricesVisible && queryInput.faixaPreco) {
			return {
				success: false,
				message: "A consulta por faixa de preço não está disponível para este agente.",
				result: { codigo: "PRECOS_NAO_VISIVEIS" },
			};
		}
		const limit = queryInput.limite ?? 10;
		const view = queryInput.visao ?? "LISTA";
		const activeOnly = queryInput.apenasAtivos ?? true;
		const termo = queryInput.termo;

		// Escopo (tenant/ativo/grupo) separado da faixa de preço: quando a busca dá vazio, é a
		// faixa de preço o filtro que o modelo mais manda errado — e o diagnóstico precisa
		// reconsultar o escopo sem ela para apontar o culpado.
		// Só o que se vende: insumos e material de uso interno (vendavel = false) nunca chegam ao cliente.
		const scopeConditions = [eq(products.organizacaoId, organizacaoId), eq(products.vendavel, true)];
		if (activeOnly) scopeConditions.push(eq(products.ativo, true));
		if (queryInput.grupo) scopeConditions.push(createSimplifiedEqualityCondition(products.grupo, queryInput.grupo));

		const priceConditions = [];
		if (typeof queryInput.faixaPreco?.min === "number") priceConditions.push(gte(products.precoVenda, queryInput.faixaPreco.min));
		if (typeof queryInput.faixaPreco?.max === "number") priceConditions.push(lte(products.precoVenda, queryInput.faixaPreco.max));

		// Condições sem o termo: são a base da consulta principal e da passada de aproximação.
		const baseConditions = [...scopeConditions, ...priceConditions];

		const termCondition = termo ? buildTermCondition({ db, organizacaoId, termo, activeOnly }) : undefined;
		const where = and(...baseConditions, ...(termCondition ? [termCondition] : []));

		if (view === "GRUPOS") {
			const groups = await db
				.select({ grupo: products.grupo, quantidade: count() })
				.from(products)
				.where(where)
				.groupBy(products.grupo)
				.orderBy(desc(sql`count(*)`))
				.limit(50);

			if (groups.length === 0) {
				return { success: true, message: "Nenhuma categoria de produto encontrada com os filtros informados.", result: { grupos: [] } };
			}

			return {
				success: true,
				message: `${groups.length} categoria(s) de produto encontrada(s).`,
				result: { grupos: groups.map((g) => ({ grupo: g.grupo, quantidadeProdutos: Number(g.quantidade) })) },
			};
		}

		const [totalRow] = await db.select({ total: count() }).from(products).where(where);
		const totalEncontrado = Number(totalRow?.total ?? 0);

		if (totalEncontrado === 0) {
			// Grupo que não existe no catálogo: devolve a lista válida para o modelo se corrigir
			// na mesma execução, em vez de um vazio que ele não sabe interpretar.
			if (queryInput.grupo) {
				const groups = await listActiveProductGroups(db, organizacaoId);
				if (!findProductGroupByName(groups, queryInput.grupo)) {
					return {
						success: false,
						message: `O grupo "${queryInput.grupo}" não existe no catálogo. Refaça a consulta usando um dos grupos disponíveis.`,
						result: { codigo: "GRUPO_INEXISTENTE", gruposDisponiveis: groups.map((group) => group.grupo) },
					};
				}
			}

			// Faixa de preço que excluiu tudo: reconsulta o mesmo escopo sem ela. Se existem
			// produtos, o culpado é o filtro de preço — devolvemos a faixa real para o modelo se
			// corrigir, em vez de um vazio que ele interpreta como "não vendemos isso". (Só
			// alcançável com preços visíveis: o guard no topo já barrou o filtro caso contrário.)
			if (priceConditions.length > 0) {
				const scopeWhere = and(...scopeConditions, ...(termCondition ? [termCondition] : []));
				const [scopeRow] = await db
					.select({
						total: count(),
						precoMinimo: sql<number | null>`MIN(${products.precoVenda})`,
						precoMaximo: sql<number | null>`MAX(${products.precoVenda})`,
					})
					.from(products)
					.where(scopeWhere);
				const totalForaDaFaixa = Number(scopeRow?.total ?? 0);
				if (totalForaDaFaixa > 0) {
					const minimo = scopeRow?.precoMinimo ?? null;
					const maximo = scopeRow?.precoMaximo ?? null;
					const faixaTexto = minimo !== null && maximo !== null ? `, com preços entre R$ ${minimo.toFixed(2)} e R$ ${maximo.toFixed(2)}` : "";
					return {
						success: false,
						message: `A faixa de preço informada não retornou nada, mas existem ${totalForaDaFaixa} produto(s) para os demais filtros${faixaTexto}. Refaça a consulta com uma faixa compatível com esses valores, ou omita faixaPreco se o cliente não pediu limite de preço.`,
						result: {
							codigo: "FILTRO_PRECO_EXCLUIU_TUDO",
							totalForaDaFaixa,
							faixaPrecoDisponivel: { minimo, maximo },
						},
					};
				}
			}

			// "Você quis dizer": nada casou por substring, então tentamos por word_similarity —
			// pega erro de digitação ("vhinho" → "Vinho") sem exigir nova rodada do modelo.
			if (termo) {
				const wordSimilarity = createWordSimilarityExpression(products.nome, termo);
				const approximate = await fetchRankedProducts({
					db,
					organizacaoId,
					where: and(...baseConditions, sql`${wordSimilarity} > ${APPROXIMATE_MATCH_MIN_WORD_SIMILARITY}`),
					orderBy: [sql`${wordSimilarity} DESC`],
					limit,
					activeOnly,
				});

				if (approximate.length > 0) {
					return {
						success: true,
						message: `Nenhum produto casa exatamente com "${termo}". Retornando os ${approximate.length} mais parecidos — confirme com o cliente antes de assumir o produto.`,
						result: {
							totalEncontrado: approximate.length,
							correspondenciaAproximada: true,
							produtos: formatProducts(approximate, { pricesVisible, stockVisibility }),
						},
					};
				}
			}

			return {
				success: true,
				message: termo
					? `Nenhum produto encontrado (nem por aproximação) para "${termo}". Verifique a grafia com o cliente ou consulte visao="GRUPOS" para explorar o catálogo.`
					: "Nenhum produto encontrado com os filtros informados.",
				result: { totalEncontrado: 0, produtos: [] },
			};
		}

		const found = await fetchRankedProducts({
			db,
			organizacaoId,
			where,
			// Com termo, relevância primeiro; alfabético é só critério de desempate.
			orderBy: termo ? [sql`${createSimilarityExpression(products.nome, termo)} DESC`, asc(products.nome)] : [asc(products.nome)],
			limit,
			activeOnly,
		});

		return {
			success: true,
			message: `${found.length} de ${totalEncontrado} produto(s) retornado(s).${
				normalized.faixaPrecoIgnorada ? " A faixaPreco enviada foi ignorada porque o cliente não pediu limite de preço nesta conversa." : ""
			}`,
			result: {
				totalEncontrado,
				...(normalized.faixaPrecoIgnorada ? { faixaPrecoIgnorada: true } : {}),
				produtos: formatProducts(found, { pricesVisible, stockVisibility }),
			},
		};
	},
});
