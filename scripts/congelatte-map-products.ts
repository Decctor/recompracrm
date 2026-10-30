/**
 * Cruza o JSON enriquecido do manual Congelatte com os produtos JA EXISTENTES da organizacao
 * e propoe um mapeamento para revisao manual.
 *
 * NAO ESCREVE NADA NO BANCO — faz apenas SELECT. A migracao final le o arquivo revisado.
 *
 * Uso:
 *   npm run map:congelatte
 *   npm run map:congelatte -- --sobrescrever     (descarta a revisao manual e regera a proposta)
 *
 * Fluxo:
 *   1. `npm run parse:congelatte`  -> extrai/enriquece o manual
 *   2. `npm run map:congelatte`    -> gera a proposta de mapeamento (este script)
 *   3. revisar `mapeamento-produtos.json` na mao: ajustar `acao` e `produtoId`
 *   4. rodar a migracao final (le o arquivo revisado)
 *
 * Para nao perder a revisao, o script se recusa a sobrescrever um mapeamento ja existente
 * a menos que `--sobrescrever` seja passado.
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { connection, db } from "@/services/drizzle";
import { products } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import { distanciaLevenshtein, normalizarNome } from "./congelatte-enrichment";

const ORGANIZACAO_ID_PADRAO = "a4c1ddd5-841a-40d9-986c-2358ddbf29a4";

// ============================================================================
// Tipos
// ============================================================================

type TJsonReceitas = {
	insumos: { nomeCanonico: string; ocorrencias: number; unidade: string; receitas: string[] }[];
	receitas: { codigo: string; categoria: string; nome: string; titulo: string; pesoTotalKg: number }[];
};

type TProdutoExistente = {
	id: string;
	nome: string;
	codigo: string;
	unidade: string;
	grupo: string;
};

type TConfianca = "EXATA" | "ALTA" | "MEDIA" | "NENHUMA";

type TCandidato = {
	produtoId: string;
	produtoNome: string;
	confianca: TConfianca;
	motivo: string;
};

type TItemMapeado = {
	/** Nome vindo do manual. E a CHAVE que liga este item ao JSON de receitas — nao editar. */
	nome: string;
	/** Nome do produto a ser criado. Editavel. */
	nomeParaCriar: string;
	/** "USAR_EXISTENTE" liga ao `produtoId`; "CRIAR" cria produto novo com `nomeParaCriar`/`unidade`. */
	acao: "USAR_EXISTENTE" | "CRIAR";
	produtoId: string | null;
	produtoNome: string | null;
	confianca: TConfianca;
	unidade: string;
	grupo: string;
	tipo: string;
	/** Contexto para a revisao manual. */
	referencia: string;
	alternativas: TCandidato[];
};

// ============================================================================
// Matching
// ============================================================================

/**
 * Contencao por PALAVRA INTEIRA, nao por substring.
 *
 * Sem isso o catalogo de vendas gera lixo: "sal" casa dentro de "torta salgada" e
 * "ovo" dentro de "Ovomaltine".
 */
function contemComoPalavra(texto: string, alvo: string): boolean {
	const escapado = alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(?:^|\\s)${escapado}(?:$|\\s)`).test(texto);
}

/**
 * Procura o produto existente que melhor corresponde ao nome do manual.
 *
 * Nenhuma correspondencia e aplicada automaticamente alem da exata: tudo que for
 * aproximado entra como sugestao com a confianca explicita, para decisao humana.
 */
function encontrarCandidatos(nome: string, produtos: TProdutoExistente[]): TCandidato[] {
	const alvo = normalizarNome(nome);
	const candidatos: TCandidato[] = [];

	for (const produto of produtos) {
		const comparado = normalizarNome(produto.nome);

		if (comparado === alvo) {
			candidatos.push({ produtoId: produto.id, produtoNome: produto.nome, confianca: "EXATA", motivo: "nome identico" });
			continue;
		}

		if (contemComoPalavra(comparado, alvo) || contemComoPalavra(alvo, comparado)) {
			candidatos.push({
				produtoId: produto.id,
				produtoNome: produto.nome,
				confianca: "ALTA",
				motivo: "um nome contem o outro",
			});
			continue;
		}

		const distancia = distanciaLevenshtein(alvo, comparado);
		const limite = Math.max(2, Math.floor(Math.min(alvo.length, comparado.length) * 0.25));
		if (distancia <= limite) {
			candidatos.push({
				produtoId: produto.id,
				produtoNome: produto.nome,
				confianca: "MEDIA",
				motivo: `distancia de edicao ${distancia}`,
			});
		}
	}

	const ordem: Record<TConfianca, number> = { EXATA: 0, ALTA: 1, MEDIA: 2, NENHUMA: 3 };
	return candidatos.sort((a, b) => ordem[a.confianca] - ordem[b.confianca]).slice(0, 5);
}

type TDadosItem = {
	nome: string;
	unidade: string;
	grupo: string;
	tipo: string;
	referencia: string;
	/**
	 * Quando true, o item NUNCA e ligado automaticamente a um produto existente.
	 *
	 * E o caso das saidas de receita: o catalogo da organizacao vende porcao
	 * ("Açaí - 300ml") enquanto a receita rende granel (~4 kg). Ligar as duas coisas
	 * faria uma producao creditar estoque na unidade errada.
	 */
	sempreCriar?: boolean;
};

function mapearItem(dados: TDadosItem, produtos: TProdutoExistente[]): TItemMapeado {
	const candidatos = encontrarCandidatos(dados.nome, produtos);
	const melhor = candidatos[0];

	// So a correspondencia exata vira "USAR_EXISTENTE" sozinha. O resto fica em "CRIAR"
	// com as sugestoes ao lado — assim o default nunca liga o produto errado silenciosamente.
	const usarExistente = !dados.sempreCriar && melhor?.confianca === "EXATA";

	// Se ja existe produto com o mesmo nome e mesmo assim vamos criar, sufixamos para
	// nao deixar dois registros indistinguiveis no catalogo.
	const colideComExistente = candidatos.some((candidato) => candidato.confianca === "EXATA");
	const nomeParaCriar = !usarExistente && colideComExistente ? `${dados.nome} (Granel)` : dados.nome;

	return {
		nome: dados.nome,
		nomeParaCriar,
		acao: usarExistente ? "USAR_EXISTENTE" : "CRIAR",
		produtoId: usarExistente ? melhor.produtoId : null,
		produtoNome: usarExistente ? melhor.produtoNome : null,
		confianca: melhor?.confianca ?? "NENHUMA",
		unidade: dados.unidade,
		grupo: dados.grupo,
		tipo: dados.tipo,
		referencia: dados.referencia,
		alternativas: usarExistente ? candidatos.slice(1) : candidatos,
	};
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
	const organizacaoId = lerArgumento("org", ORGANIZACAO_ID_PADRAO);
	const diretorio = resolve(lerArgumento("out", "../recompracrm-tmpworks/congelatte"));
	const arquivoReceitas = resolve(diretorio, "receitas-congelatte.json");
	const arquivoMapeamento = resolve(diretorio, "mapeamento-produtos.json");
	const sobrescrever = process.argv.includes("--sobrescrever");

	if (!existsSync(arquivoReceitas)) {
		throw new Error(`JSON de receitas nao encontrado em ${arquivoReceitas}. Rode "npm run parse:congelatte" antes.`);
	}
	if (existsSync(arquivoMapeamento) && !sobrescrever) {
		throw new Error(`Ja existe um mapeamento em ${arquivoMapeamento}. Ele pode conter revisao manual — use "--sobrescrever" para regerar do zero.`);
	}

	const dados = JSON.parse(readFileSync(arquivoReceitas, { encoding: "utf-8" })) as TJsonReceitas;

	console.log(`[congelatte] consultando produtos da organizacao ${organizacaoId}...`);
	const produtos = (await db
		.select({
			id: products.id,
			nome: products.nome,
			codigo: products.codigo,
			unidade: products.unidade,
			grupo: products.grupo,
		})
		.from(products)
		.where(eq(products.organizacaoId, organizacaoId))) as TProdutoExistente[];

	console.log(`[congelatte] produtos existentes: ${produtos.length}`);

	const insumos = dados.insumos.map((insumo) =>
		mapearItem(
			{
				nome: insumo.nomeCanonico,
				unidade: insumo.unidade,
				grupo: "Materia Prima",
				tipo: "INSUMO",
				referencia: `usado em ${insumo.ocorrencias} receita(s)`,
			},
			produtos,
		),
	);

	const produtosFinais = dados.receitas.map((receita) =>
		mapearItem(
			{
				nome: receita.nome,
				unidade: "KG",
				grupo: receita.categoria === "GELATO" ? "Gelato" : "Sobremesa",
				tipo: "INSUMO",
				referencia: `${receita.codigo} — rendimento aproximado ${receita.pesoTotalKg.toFixed(3).replace(".", ",")} kg`,
				sempreCriar: true,
			},
			produtos,
		),
	);

	const contar = (itens: TItemMapeado[], confianca: TConfianca) => itens.filter((item) => item.confianca === confianca).length;

	const resultado = {
		organizacaoId,
		instrucoes: [
			"Revise cada item: `acao` = USAR_EXISTENTE (liga ao produtoId) ou CRIAR (cria produto novo).",
			"Ao trocar para USAR_EXISTENTE, copie o `produtoId` de `alternativas` para o campo `produtoId`.",
			"Somente correspondencias EXATAS ja vieram marcadas como USAR_EXISTENTE.",
			"A migracao final le este arquivo — nada e gravado no banco ate la.",
		],
		resumo: {
			produtosExistentesNaOrg: produtos.length,
			insumos: {
				total: insumos.length,
				jaLigados: insumos.filter((item) => item.acao === "USAR_EXISTENTE").length,
				aCriar: insumos.filter((item) => item.acao === "CRIAR").length,
				comSugestaoParaRevisar: insumos.filter((item) => item.acao === "CRIAR" && item.alternativas.length > 0).length,
			},
			produtosFinais: {
				total: produtosFinais.length,
				jaLigados: produtosFinais.filter((item) => item.acao === "USAR_EXISTENTE").length,
				aCriar: produtosFinais.filter((item) => item.acao === "CRIAR").length,
				comSugestaoParaRevisar: produtosFinais.filter((item) => item.acao === "CRIAR" && item.alternativas.length > 0).length,
			},
		},
		insumos,
		produtosFinais,
	};

	mkdirSync(dirname(arquivoMapeamento), { recursive: true });
	writeFileSync(arquivoMapeamento, JSON.stringify(resultado, null, 2), { encoding: "utf-8" });

	console.log("");
	console.log(`[congelatte] insumos ................ ${insumos.length}`);
	console.log(`[congelatte]   exatos (ja ligados) .. ${contar(insumos, "EXATA")}`);
	console.log(`[congelatte]   sugestao ALTA ........ ${contar(insumos, "ALTA")}`);
	console.log(`[congelatte]   sugestao MEDIA ....... ${contar(insumos, "MEDIA")}`);
	console.log(`[congelatte]   sem correspondencia .. ${contar(insumos, "NENHUMA")}`);
	console.log(`[congelatte] produtos finais ....... ${produtosFinais.length}`);
	console.log(`[congelatte]   exatos (ja ligados) .. ${contar(produtosFinais, "EXATA")}`);
	console.log(`[congelatte]   sugestao ALTA ........ ${contar(produtosFinais, "ALTA")}`);
	console.log(`[congelatte]   sugestao MEDIA ....... ${contar(produtosFinais, "MEDIA")}`);
	console.log(`[congelatte]   sem correspondencia .. ${contar(produtosFinais, "NENHUMA")}`);
	console.log("");
	console.log(`[congelatte] mapeamento gerado em: ${arquivoMapeamento}`);
}

main()
	.catch((error) => {
		console.error("[congelatte] falha no mapeamento:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
