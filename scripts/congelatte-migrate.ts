/**
 * Cria, na organizacao alvo, os produtos e as receitas de producao extraidos do manual Congelatte.
 *
 * POR PADRAO NAO GRAVA NADA: roda em simulacao e imprime o plano. Para efetivar,
 * passe `--executar` explicitamente.
 *
 * Uso:
 *   npm run migrate:congelatte                 (simulacao — nao toca no banco)
 *   npm run migrate:congelatte -- --executar   (grava, em uma unica transacao)
 *
 * Entradas (geradas pelos passos anteriores):
 *   ../recompracrm-tmpworks/congelatte/receitas-congelatte.json   -> npm run parse:congelatte
 *   ../recompracrm-tmpworks/congelatte/mapeamento-produtos.json   -> npm run map:congelatte (revisado a mao)
 *
 * Idempotencia: produtos sao procurados por nome normalizado dentro da organizacao e
 * receitas por titulo. Rodar duas vezes nao duplica — o que ja existe e reaproveitado.
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { connection, db } from "@/services/drizzle";
import { productionRecipeInputs, productionRecipeOutputs, productionRecipes, products } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import { converterDeKg, normalizarNome } from "./congelatte-enrichment";

const ORGANIZACAO_ID_PADRAO = "a4c1ddd5-841a-40d9-986c-2358ddbf29a4";

/** Colunas NOT NULL de `products` que o manual nao fornece. */
const PREENCHIMENTO_PRODUTO = {
	codigo: "",
	ncm: "",
} as const;

// ============================================================================
// Tipos das entradas
// ============================================================================

type TIngrediente = { nomeCanonico: string; quantidade: number };

type TReceitaJson = {
	codigo: string;
	categoria: string;
	nome: string;
	titulo: string;
	pesoTotalKg: number;
	ingredientes: TIngrediente[];
	modoPreparoMarkdown: string;
};

type TJsonReceitas = { receitas: TReceitaJson[] };

type TItemMapeado = {
	nome: string;
	nomeParaCriar: string;
	acao: "USAR_EXISTENTE" | "CRIAR";
	produtoId: string | null;
	unidade: string;
	grupo: string;
	tipo: string;
};

type TJsonMapeamento = {
	organizacaoId: string;
	insumos: TItemMapeado[];
	produtosFinais: TItemMapeado[];
};

type TPlanoProduto = {
	chave: string;
	nome: string;
	unidade: string;
	grupo: string;
	tipo: string;
	situacao: "JA_MAPEADO" | "JA_EXISTE_NA_ORG" | "CRIAR";
	produtoId: string | null;
};

// ============================================================================
// Resolucao de produtos
// ============================================================================

/**
 * Decide, para cada item do mapeamento, se ele ja aponta para um produto, se existe
 * um produto homonimo na organizacao, ou se precisa ser criado.
 */
function planejarProdutos(itens: TItemMapeado[], produtosDaOrg: { id: string; nome: string }[]): TPlanoProduto[] {
	const porNomeNormalizado = new Map(produtosDaOrg.map((produto) => [normalizarNome(produto.nome), produto.id]));

	return itens.map((item) => {
		if (item.acao === "USAR_EXISTENTE" && item.produtoId) {
			return {
				chave: item.nome,
				nome: item.nomeParaCriar,
				unidade: item.unidade,
				grupo: item.grupo,
				tipo: item.tipo,
				situacao: "JA_MAPEADO",
				produtoId: item.produtoId,
			};
		}

		// Reaproveita o que uma execucao anterior deste mesmo script ja criou.
		const existente = porNomeNormalizado.get(normalizarNome(item.nomeParaCriar));
		if (existente) {
			return {
				chave: item.nome,
				nome: item.nomeParaCriar,
				unidade: item.unidade,
				grupo: item.grupo,
				tipo: item.tipo,
				situacao: "JA_EXISTE_NA_ORG",
				produtoId: existente,
			};
		}

		return {
			chave: item.nome,
			nome: item.nomeParaCriar,
			unidade: item.unidade,
			grupo: item.grupo,
			tipo: item.tipo,
			situacao: "CRIAR",
			produtoId: null,
		};
	});
}

// ============================================================================
// CLI
// ============================================================================

function lerArgumento(nome: string, padrao: string): string {
	const indice = process.argv.indexOf(`--${nome}`);
	if (indice === -1) return padrao;
	return process.argv[indice + 1] ?? padrao;
}

async function main() {
	const diretorio = resolve(lerArgumento("out", "../recompracrm-tmpworks/congelatte"));
	const arquivoReceitas = resolve(diretorio, "receitas-congelatte.json");
	const arquivoMapeamento = resolve(diretorio, "mapeamento-produtos.json");
	const executar = process.argv.includes("--executar");

	for (const arquivo of [arquivoReceitas, arquivoMapeamento]) {
		if (!existsSync(arquivo)) throw new Error(`Arquivo obrigatorio nao encontrado: ${arquivo}`);
	}

	const dados = JSON.parse(readFileSync(arquivoReceitas, { encoding: "utf-8" })) as TJsonReceitas;
	const mapeamento = JSON.parse(readFileSync(arquivoMapeamento, { encoding: "utf-8" })) as TJsonMapeamento;
	const organizacaoId = lerArgumento("org", mapeamento.organizacaoId || ORGANIZACAO_ID_PADRAO);

	console.log(`[congelatte] organizacao: ${organizacaoId}`);
	console.log(`[congelatte] modo: ${executar ? "EXECUCAO (grava no banco)" : "SIMULACAO (nao grava nada)"}`);

	const produtosDaOrg = await db.select({ id: products.id, nome: products.nome }).from(products).where(eq(products.organizacaoId, organizacaoId));

	const receitasDaOrg = await db
		.select({ id: productionRecipes.id, titulo: productionRecipes.titulo })
		.from(productionRecipes)
		.where(eq(productionRecipes.organizacaoId, organizacaoId));

	const planoInsumos = planejarProdutos(mapeamento.insumos, produtosDaOrg);
	const planoFinais = planejarProdutos(mapeamento.produtosFinais, produtosDaOrg);
	const planoProdutos = [...planoInsumos, ...planoFinais];

	// Toda receita precisa achar produto para cada ingrediente e para a propria saida.
	const titulosExistentes = new Set(receitasDaOrg.map((receita) => normalizarNome(receita.titulo)));
	const receitasNovas = dados.receitas.filter((receita) => !titulosExistentes.has(normalizarNome(receita.titulo)));

	// A unidade do mapeamento e a autoridade: os vinculos convertem kg -> unidade a partir dela.
	const unidadePorChave = new Map(planoProdutos.map((produto) => [produto.chave, produto.unidade]));
	const chavesConhecidas = new Set(planoProdutos.map((produto) => produto.chave));
	const pendencias: string[] = [];
	for (const receita of dados.receitas) {
		for (const ingrediente of receita.ingredientes) {
			if (!chavesConhecidas.has(ingrediente.nomeCanonico)) {
				pendencias.push(`Receita ${receita.codigo}: insumo "${ingrediente.nomeCanonico}" nao esta no mapeamento.`);
				continue;
			}
			const unidade = unidadePorChave.get(ingrediente.nomeCanonico) ?? "KG";
			if (converterDeKg(ingrediente.quantidade, unidade) === null) {
				pendencias.push(`Receita ${receita.codigo}: nao sei converter "${ingrediente.nomeCanonico}" de kg para "${unidade}".`);
			}
		}
		if (!chavesConhecidas.has(receita.nome)) {
			pendencias.push(`Receita ${receita.codigo}: produto final "${receita.nome}" nao esta no mapeamento.`);
		}
	}

	const aCriar = planoProdutos.filter((produto) => produto.situacao === "CRIAR");
	const reaproveitados = planoProdutos.filter((produto) => produto.situacao !== "CRIAR");

	console.log("");
	console.log(`[congelatte] produtos no mapeamento .. ${planoProdutos.length}`);
	console.log(`[congelatte]   a criar ............... ${aCriar.length}`);
	console.log(`[congelatte]   reaproveitados ........ ${reaproveitados.length}`);
	console.log(`[congelatte] receitas no manual ..... ${dados.receitas.length}`);
	console.log(`[congelatte]   a criar ............... ${receitasNovas.length}`);
	console.log(`[congelatte]   ja existentes ......... ${dados.receitas.length - receitasNovas.length}`);
	console.log(`[congelatte] vinculos de insumo ..... ${receitasNovas.reduce((total, receita) => total + receita.ingredientes.length, 0)}`);

	if (pendencias.length > 0) {
		console.log("");
		console.log(`[congelatte] PENDENCIAS (${pendencias.length}) — corrija o mapeamento antes de executar:`);
		for (const pendencia of pendencias.slice(0, 20)) console.log(`  - ${pendencia}`);
		throw new Error("Mapeamento incompleto: ha itens do manual sem produto correspondente.");
	}

	if (!executar) {
		console.log("");
		console.log("[congelatte] amostra dos produtos a criar:");
		for (const produto of aCriar.slice(0, 10)) console.log(`  + ${produto.nome} (${produto.unidade}, ${produto.grupo})`);
		if (aCriar.length > 10) console.log(`  ... e mais ${aCriar.length - 10}`);
		console.log("");
		console.log("[congelatte] simulacao concluida. Nada foi gravado. Use --executar para efetivar.");
		return;
	}

	await db.transaction(async (tx) => {
		const idPorChave = new Map<string, string>();
		for (const produto of planoProdutos) {
			if (produto.produtoId) idPorChave.set(produto.chave, produto.produtoId);
		}

		for (const produto of aCriar) {
			const [criado] = await tx
				.insert(products)
				.values({
					organizacaoId,
					nome: produto.nome,
					unidade: produto.unidade,
					grupo: produto.grupo,
					tipo: produto.tipo,
					...PREENCHIMENTO_PRODUTO,
				})
				.returning({ id: products.id });

			if (!criado?.id) throw new Error(`Falha ao criar produto "${produto.nome}".`);
			idPorChave.set(produto.chave, criado.id);
		}

		console.log(`[congelatte] produtos criados: ${aCriar.length}`);

		for (const receita of receitasNovas) {
			const [criada] = await tx
				.insert(productionRecipes)
				.values({
					organizacaoId,
					titulo: receita.titulo,
					modoPreparo: receita.modoPreparoMarkdown,
					ativo: true,
				})
				.returning({ id: productionRecipes.id });

			if (!criada?.id) throw new Error(`Falha ao criar receita "${receita.titulo}".`);

			await tx.insert(productionRecipeInputs).values(
				receita.ingredientes.map((ingrediente) => {
					const produtoId = idPorChave.get(ingrediente.nomeCanonico);
					if (!produtoId) throw new Error(`Insumo sem produto resolvido: "${ingrediente.nomeCanonico}".`);
					const unidade = unidadePorChave.get(ingrediente.nomeCanonico) ?? "KG";
					const quantidade = converterDeKg(ingrediente.quantidade, unidade);
					if (quantidade === null) throw new Error(`Conversao invalida de "${ingrediente.nomeCanonico}" para "${unidade}".`);
					return { organizacaoId, receitaId: criada.id, produtoId, quantidade };
				}),
			);

			const produtoFinalId = idPorChave.get(receita.nome);
			if (!produtoFinalId) throw new Error(`Produto final sem produto resolvido: "${receita.nome}".`);

			await tx.insert(productionRecipeOutputs).values({
				organizacaoId,
				receitaId: criada.id,
				produtoId: produtoFinalId,
				quantidade: receita.pesoTotalKg,
			});
		}

		console.log(`[congelatte] receitas criadas: ${receitasNovas.length}`);
	});

	console.log("");
	console.log("[congelatte] migracao concluida.");
}

main()
	.catch((error) => {
		console.error("[congelatte] falha na migracao:", error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
