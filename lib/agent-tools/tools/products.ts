import { resolveChannelAvailability } from "@/lib/products/sales-channels";
import { channelNodePrice, channelProductFilter, loadChannelState } from "@/lib/products/sales-channels-store";
import { createSimilarityExpression, createSimplifiedEqualityCondition, createSimplifiedSearchCondition } from "@/lib/search";
import { db } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
import { and, asc, count, desc, eq, inArray, notInArray, or, type SQL } from "drizzle-orm";
import z from "zod";
import { resolveOrganizationScope } from "../organization-scope";
import { roundForModel } from "../serialization";
import { defineAgentTool } from "../types";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

const SearchProductsInputSchema = z.object({
	termo: z.string({ invalid_type_error: "Tipo inválido para o termo de busca." }).optional().nullable(),
	codigo: z.string({ invalid_type_error: "Tipo inválido para o código." }).optional().nullable(),
	grupo: z.string({ invalid_type_error: "Tipo inválido para o grupo." }).optional().nullable(),
	apenasVendaveis: z.boolean({ invalid_type_error: "Tipo inválido para apenas vendáveis." }).optional().nullable(),
	// Só canais internos: o iFood tem um canal por loja (`ref_externo` = merchant), então
	// "IFOOD" sozinho seria ambíguo numa organização com mais de uma loja conectada.
	canal: z.enum(["POS", "SHOP", "COMANDA"]).optional().nullable(),
	limite: z.number({ invalid_type_error: "Tipo inválido para o limite." }).int().positive().max(MAX_LIMIT).optional().nullable(),
	organizacaoId: z.string({ invalid_type_error: "Tipo inválido para o id da organização." }).optional().nullable(),
});

export const searchProductsTool = defineAgentTool({
	name: "search_products",
	title: "Buscar produtos",
	scopes: ["agent:products:read"],
	modes: ["ORG", "PLATAFORMA"],
	inputSchema: SearchProductsInputSchema,
	describe: (actor) =>
		[
			"Consulta o catálogo da organização por nome, código ou grupo. A busca por `termo` tolera acento e erro de digitação,",
			"e o resultado vem ordenado por semelhança com o termo.",
			"`precoVendaBase` é o preço cadastrado no produto, **não necessariamente o preço praticado**: cada canal de venda",
			"(POS, loja, comanda, iFood) pode ter preço e disponibilidade próprios.",
			"Com `canal`, devolve também `precoVendaEfetivo` e `disponivelNoCanal`, já resolvidos para aquele canal;",
			"sem `canal`, só o `precoVendaBase`.",
			"`vendavel` e `ativo` são coisas diferentes: um produto inativo saiu do catálogo, um não-vendável continua cadastrado",
			"mas não pode ser vendido em canal nenhum.",
			"Preço e quantidade em estoque são **omitidos** quando a organização não os controla: a ausência do campo significa",
			"que o dado não existe, não que o produto esteja sem estoque ou seja gratuito.",
			`Devolve no máximo ${MAX_LIMIT} produtos por chamada, acompanhados do total encontrado.`,
			actor.mode === "PLATAFORMA" ? "`organizacaoId` (id ou slug) escolhe a organização." : "",
		]
			.filter(Boolean)
			.join(" "),
	execute: async (input, actor) => {
		const organizacaoId = await resolveOrganizationScope(actor, input.organizacaoId);
		const limite = input.limite ?? DEFAULT_LIMIT;

		// Canal ainda não materializado é ausência de configuração, não erro: o catálogo cai no
		// comportamento base em vez de devolver vazio e sugerir que a loja não vende nada ali.
		const channelState = input.canal ? await loadChannelState({ orgId: organizacaoId, canal: input.canal }) : null;

		const conditions: SQL[] = [eq(products.organizacaoId, organizacaoId)];

		if (channelState) {
			const { includeIds, excludeIds } = channelProductFilter(channelState);
			if (includeIds) conditions.push(inArray(products.id, includeIds));
			if (excludeIds) conditions.push(notInArray(products.id, excludeIds));
		}

		const codigo = input.codigo?.trim();
		if (codigo) conditions.push(createSimplifiedEqualityCondition(products.codigo, codigo));

		const grupo = input.grupo?.trim();
		if (grupo) conditions.push(createSimplifiedEqualityCondition(products.grupo, grupo));

		// Default liga os dois: a pergunta de quem consulta catálogo é sempre "o que dá para vender".
		// `ativo` e `vendavel` são gates independentes — ver `resolveChannelAvailability`.
		if (input.apenasVendaveis !== false) {
			conditions.push(eq(products.ativo, true));
			conditions.push(eq(products.vendavel, true));
		}

		const termo = input.termo?.trim();
		if (termo && termo.length >= 2) {
			const termCondition = or(
				createSimplifiedSearchCondition(products.nome, termo),
				createSimplifiedSearchCondition(products.descricao, termo),
				createSimplifiedEqualityCondition(products.codigo, termo),
			);
			if (termCondition) conditions.push(termCondition);
		}

		const where = and(...conditions);
		// Com termo, ordena por semelhança (índice trigram em `nome`); sem termo, ordem estável por nome.
		const orderBy = termo && termo.length >= 2 ? [desc(createSimilarityExpression(products.nome, termo))] : [asc(products.nome)];

		const [rows, totalResult] = await Promise.all([
			db.query.products.findMany({
				where,
				orderBy,
				limit: limite,
				columns: {
					id: true,
					nome: true,
					codigo: true,
					grupo: true,
					unidade: true,
					descricao: true,
					precoVenda: true,
					quantidade: true,
					ativo: true,
					vendavel: true,
					rastreamentoEstoqueAtivo: true,
				},
			}),
			db.select({ total: count() }).from(products).where(where),
		]);

		const total = totalResult[0]?.total ?? 0;

		return {
			total,
			exibindo: rows.length,
			truncado: total > rows.length,
			canalConsultado: input.canal ?? undefined,
			produtos: rows.map((product) => ({
				id: product.id,
				nome: product.nome,
				codigo: product.codigo,
				grupo: product.grupo,
				unidade: product.unidade,
				descricao: product.descricao,
				ativo: product.ativo,
				vendavel: product.vendavel,
				precoVendaEfetivo: channelState
					? roundForModel(channelNodePrice(channelState, { produtoId: product.id, precoVenda: product.precoVenda }))
					: undefined,
				disponivelNoCanal: channelState
					? resolveChannelAvailability({
							product,
							channel: channelState.channel,
							overrides: { product: channelState.productOverrides.get(product.id) ?? null },
						})
					: undefined,
				// Nome explícito porque o número é o preço-base do cadastro: canais de venda podem
				// sobrescrevê-lo (`product_channel_settings.preco_venda`). Devolver isto como
				// `precoVenda` faria o agente cotar em nome da loja um preço que talvez não valha
				// no canal em que o cliente está comprando.
				precoVendaBase: roundForModel(product.precoVenda),
				// Estoque só é informação quando a organização rastreia estoque deste produto.
				// Fora disso o número guardado é resíduo, e um resíduo vira alucinação.
				quantidadeEstoque: product.rastreamentoEstoqueAtivo ? roundForModel(product.quantidade, 3) : undefined,
			})),
		};
	},
});
