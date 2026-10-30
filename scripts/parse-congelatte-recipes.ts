/**
 * Extrai as receitas do "Manual de Producao — Congelatte" (PDF) para um JSON local,
 * pronto para ser iterado/revisado antes de virar receitas + produtos (insumos) da organizacao.
 *
 * Uso:
 *   npm run parse:congelatte
 *   tsx scripts/parse-congelatte-recipes.ts --pdf ./receitas-congelatte.pdf --out ../recompracrm-tmpworks/congelatte
 *
 * Como o PDF foi feito no Canva, a extracao "achatada" de texto vem com tracking
 * (letras separadas por espaco). Por isso lemos os itens posicionados do pdf.js e
 * remontamos o layout por coordenadas:
 *
 *   - Cada pagina de receita tem um rotulo canonico ("Gelato 1.0 - Laka") que define codigo + nome.
 *   - A tabela de ingredientes tem duas colunas: nome (esquerda) e quantidade (direita).
 *   - Nomes longos quebram em 2 linhas e a quantidade fica VERTICALMENTE CENTRALIZADA entre elas,
 *     logo o pareamento e feito por proximidade de Y (banda), e nao por linha exata.
 *   - O cabecalho da tabela ("KG"/"Original") e tratado como uma ancora do mesmo tipo,
 *     o que reaproveita o pareamento para montar o titulo do bloco.
 *   - Paginas sem rotulo que vem depois de uma receita sao o "modo de preparo" dela.
 *
 * O JSON de saida inclui um bloco `diagnosticos` (textos ignorados, receitas sem ingredientes,
 * possiveis duplicidades de insumo) — e por ele que se avalia a qualidade do parsing a cada rodada.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import {
	canonizarNomeInsumo,
	converterDeKg,
	distanciaLevenshtein,
	embelezarPasso,
	inferirUnidadeInsumo,
	normalizarNome,
	formatarQuantidade,
	gerarMarkdownModoPreparo,
	gerarMarkdownReceita,
	titularTexto,
	type TOrigemCanonizacao,
} from "./congelatte-enrichment";

// ============================================================================
// Tipos
// ============================================================================

type TCategoriaReceita = "GELATO" | "SOBREMESA";

type TIngredienteExtraido = {
	/** Nome exatamente como sai do PDF. */
	nome: string;
	nomeNormalizado: string;
	/** Nome canonico, ja apresentavel — e o que vira produto da organizacao. */
	nomeCanonico: string;
	origemNomeCanonico: TOrigemCanonizacao;
	/** Quantidade sempre em kg (fiel a extracao — e a fonte para conversao). */
	quantidade: number;
	quantidadeTexto: string;
	quantidadeExibicao: string;
	/** Unidade do insumo (herdada da consolidacao). */
	unidade: string;
	/** Quantidade ja convertida para `unidade` — e o valor que vai para o vinculo da receita. */
	quantidadeNaUnidade: number;
};

type TReceitaExtraida = {
	codigo: string;
	categoria: TCategoriaReceita;
	nome: string;
	titulo: string;
	tituloBloco: string | null;
	unidadeRendimento: string;
	paginaIngredientes: number;
	paginasPreparo: number[];
	pesoTotalKg: number;
	ingredientes: TIngredienteExtraido[];
	modoPreparo: string[];
	/** Conteudo do campo `modoPreparo` (Markdown) de `productionRecipes`. */
	modoPreparoMarkdown: string;
	/** Documento completo (titulo + ingredientes + preparo), para revisao e preview. */
	receitaMarkdown: string;
	alertas: string[];
};

type TInsumoExtraido = {
	nomeCanonico: string;
	origemNomeCanonico: TOrigemCanonizacao;
	/** Todas as grafias do PDF que colapsaram neste insumo. */
	variacoes: string[];
	unidade: string;
	ocorrencias: number;
	quantidadeMinima: number;
	quantidadeMaxima: number;
	receitas: string[];
};

type TTextItem = {
	texto: string;
	x: number;
	y: number;
	largura: number;
	altura: number;
};

type TLinha = {
	texto: string;
	x: number;
	y: number;
	altura: number;
};

type TPaginaExtraida = {
	numero: number;
	itens: TTextItem[];
	linhas: TLinha[];
};

// ============================================================================
// Helpers de texto
// ============================================================================

const REGEX_ROTULO = /^(gelato|sobremesa)\s*(\d+\.\d+)\s*[-–—]?\s*(.+)$/i;
const REGEX_QUANTIDADE = /^\d+[.,]\d+$/;
const REGEX_CABECALHO_UNIDADE = /^(kg|original)$/i;
const REGEX_RUIDO = /^(ingredientes|modo\s*de\s*preparo|sum[áa]rio.*|\d{1,3})$/i;

function parseQuantidade(valor: string): number {
	return Number(valor.trim().replace(/\./g, "").replace(",", "."));
}

// ============================================================================
// Leitura do PDF
// ============================================================================

async function extrairPaginas(caminhoPdf: string): Promise<TPaginaExtraida[]> {
	const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const data = new Uint8Array(await readFile(caminhoPdf));
	const documento = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

	const paginas: TPaginaExtraida[] = [];
	for (let numero = 1; numero <= documento.numPages; numero++) {
		const pagina = await documento.getPage(numero);
		const conteudo = await pagina.getTextContent();

		const itens: TTextItem[] = [];
		for (const item of conteudo.items) {
			if (!("str" in item)) continue;
			const texto = item.str.replace(/\s+/g, " ").trim();
			if (!texto) continue;
			itens.push({
				texto,
				x: item.transform[4],
				y: item.transform[5],
				largura: item.width,
				altura: item.height || 10,
			});
		}

		paginas.push({ numero, itens, linhas: agruparEmLinhas(itens) });
	}

	return paginas;
}

/** Agrupa itens por proximidade de Y (ordem de leitura) para reconstruir linhas de prosa. */
function agruparEmLinhas(itens: TTextItem[]): TLinha[] {
	const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);
	const grupos: TTextItem[][] = [];

	for (const item of ordenados) {
		const grupoAtual = grupos[grupos.length - 1];
		const referencia = grupoAtual?.[0];
		const tolerancia = referencia ? Math.max(referencia.altura * 0.5, 3) : 0;
		if (referencia && Math.abs(referencia.y - item.y) <= tolerancia) grupoAtual.push(item);
		else grupos.push([item]);
	}

	return grupos.map((grupo) => {
		const emOrdem = grupo.sort((a, b) => a.x - b.x);
		return {
			texto: emOrdem
				.map((item) => item.texto)
				.join(" ")
				.replace(/\s+/g, " ")
				.trim(),
			x: emOrdem[0].x,
			y: emOrdem[0].y,
			altura: Math.max(...emOrdem.map((item) => item.altura)),
		};
	});
}

/**
 * Reagrupa linhas visuais em passos logicos.
 *
 * No manual o espacamento entre linhas de um mesmo passo e o mesmo entre passos diferentes
 * (~1.4x a altura da fonte), entao o gap sozinho nao separa nada. O sinal confiavel e
 * ortografico: todo passo comeca com maiuscula e toda quebra de linha continua em minuscula.
 * O gap entra apenas para impedir que balloes de aviso (deslocados na pagina) sejam colados
 * ao passo anterior.
 */
function agruparEmPassos(linhas: TLinha[]): string[] {
	const passos: string[] = [];
	let linhaAnterior: TLinha | null = null;

	for (const linha of linhas) {
		const primeiroCaractere = linha.texto[0] ?? "";
		// Continuacao = comeca em minuscula ou em conector de continuidade ("+ 10 g de...", "(gianduia)...").
		const continuaFrase = primeiroCaractere !== primeiroCaractere.toUpperCase() || /^[+(),;]/.test(linha.texto);
		const gap = linhaAnterior ? linhaAnterior.y - linha.y : Number.POSITIVE_INFINITY;
		const mesmoBloco = gap <= Math.max(linha.altura, linhaAnterior?.altura ?? 0) * 2.2;

		if (passos.length > 0 && continuaFrase && mesmoBloco) passos[passos.length - 1] = `${passos[passos.length - 1]} ${linha.texto}`;
		else passos.push(linha.texto);

		linhaAnterior = linha;
	}

	return passos.map((passo) => passo.replace(/\s+/g, " ").trim());
}

// ============================================================================
// Parsing de uma pagina de receita
// ============================================================================

type TAncora = { item: TTextItem; tipo: "QUANTIDADE" | "UNIDADE"; nomes: TTextItem[] };

function parsearPaginaDeReceita(pagina: TPaginaExtraida, rotulo: RegExpMatchArray) {
	const alertas: string[] = [];

	const ancoras: TAncora[] = [];
	const candidatosNome: TTextItem[] = [];

	for (const item of pagina.itens) {
		if (REGEX_ROTULO.test(item.texto)) continue;
		if (REGEX_QUANTIDADE.test(item.texto)) {
			ancoras.push({ item, tipo: "QUANTIDADE", nomes: [] });
			continue;
		}
		if (REGEX_CABECALHO_UNIDADE.test(item.texto)) {
			ancoras.push({ item, tipo: "UNIDADE", nomes: [] });
			continue;
		}
		if (REGEX_RUIDO.test(item.texto)) continue;
		candidatosNome.push(item);
	}

	// Cada texto vai para a ancora mais proxima verticalmente, desde que esteja a esquerda dela.
	const ignorados: TTextItem[] = [];
	for (const nome of candidatosNome) {
		let melhor: TAncora | null = null;
		let melhorDistancia = Number.POSITIVE_INFINITY;

		for (const ancora of ancoras) {
			if (nome.x >= ancora.item.x) continue;
			const distancia = Math.abs(nome.y - ancora.item.y);
			const banda = Math.max(nome.altura, ancora.item.altura) * 1.35;
			if (distancia > banda) continue;
			if (distancia < melhorDistancia) {
				melhor = ancora;
				melhorDistancia = distancia;
			}
		}

		if (melhor) melhor.nomes.push(nome);
		else ignorados.push(nome);
	}

	const juntarNomes = (nomes: TTextItem[]) =>
		nomes
			.sort((a, b) => b.y - a.y || a.x - b.x)
			.map((item) => item.texto)
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();

	const ancoraUnidade = ancoras.find((ancora) => ancora.tipo === "UNIDADE");
	const unidadeRendimento = ancoraUnidade ? ancoraUnidade.item.texto.toUpperCase() : "KG";
	const tituloBloco = ancoraUnidade && ancoraUnidade.nomes.length > 0 ? juntarNomes(ancoraUnidade.nomes) : null;
	if (!ancoraUnidade) alertas.push("Cabecalho de unidade (KG) nao encontrado; assumido KG.");

	// Ordena as linhas da tabela de cima para baixo (ordem visual do manual).
	const ancorasDeQuantidade = ancoras.filter((ancora) => ancora.tipo === "QUANTIDADE").sort((a, b) => b.item.y - a.item.y);

	const ingredientes: TIngredienteExtraido[] = [];
	for (const ancora of ancorasDeQuantidade) {
		const nome = juntarNomes(ancora.nomes);
		const quantidade = parseQuantidade(ancora.item.texto);

		if (!nome) {
			alertas.push(`Quantidade "${ancora.item.texto}" sem nome de ingrediente associado.`);
			continue;
		}
		if (!Number.isFinite(quantidade)) {
			alertas.push(`Quantidade invalida para "${nome}": "${ancora.item.texto}".`);
			continue;
		}

		const nomeNormalizado = normalizarNome(nome);
		const canonico = canonizarNomeInsumo(nomeNormalizado, nome);

		ingredientes.push({
			nome,
			nomeNormalizado,
			nomeCanonico: canonico.nome,
			origemNomeCanonico: canonico.origem,
			quantidade,
			quantidadeTexto: ancora.item.texto,
			quantidadeExibicao: formatarQuantidade(quantidade),
			// Preenchidos por aplicarUnidadesAosIngredientes, apos a consolidacao decidir a unidade.
			unidade: "KG",
			quantidadeNaUnidade: quantidade,
		});
	}

	for (const item of ignorados) alertas.push(`Texto ignorado na pagina de ingredientes: "${item.texto}".`);
	if (ingredientes.length === 0) alertas.push("Nenhum ingrediente extraido nesta receita.");

	const categoria: TCategoriaReceita = rotulo[1].toLowerCase() === "gelato" ? "GELATO" : "SOBREMESA";
	const pesoTotalKg = Number(ingredientes.reduce((total, item) => total + item.quantidade, 0).toFixed(3));

	const nome = titularTexto(rotulo[3].trim());
	const prefixo = categoria === "GELATO" ? "Gelato" : "Sobremesa";

	return {
		receita: {
			codigo: rotulo[2],
			categoria,
			nome,
			titulo: `${prefixo} ${rotulo[2]} — ${nome}`,
			tituloBloco,
			unidadeRendimento,
			paginaIngredientes: pagina.numero,
			paginasPreparo: [] as number[],
			pesoTotalKg,
			ingredientes,
			modoPreparo: [] as string[],
			modoPreparoMarkdown: "",
			receitaMarkdown: "",
			alertas,
		} satisfies TReceitaExtraida,
	};
}

// ============================================================================
// Montagem do resultado
// ============================================================================

function extrairReceitas(paginas: TPaginaExtraida[]): TReceitaExtraida[] {
	const receitas: TReceitaExtraida[] = [];

	for (const pagina of paginas) {
		const linhaRotulo = pagina.linhas.map((linha) => linha.texto.match(REGEX_ROTULO)).find((match) => match !== null);

		if (linhaRotulo) {
			receitas.push(parsearPaginaDeReceita(pagina, linhaRotulo).receita);
			continue;
		}

		// Pagina de continuacao: pertence ao modo de preparo da ultima receita encontrada.
		const receitaAtual = receitas[receitas.length - 1];
		if (!receitaAtual) continue;

		const passos = agruparEmPassos(pagina.linhas.filter((linha) => !REGEX_RUIDO.test(linha.texto))).filter((passo) => passo.length > 1);

		if (passos.length === 0) continue;
		receitaAtual.paginasPreparo.push(pagina.numero);
		receitaAtual.modoPreparo.push(...passos);
	}

	return receitas;
}

/**
 * Segunda passada sobre as receitas ja extraidas: normaliza a prosa dos passos e
 * monta os Markdowns. Fica separada da extracao porque e aqui que se itera.
 */
function enriquecerReceitas(receitas: TReceitaExtraida[]): Map<string, number> {
	const correcoesAplicadas = new Map<string, number>();

	for (const receita of receitas) {
		receita.modoPreparo = receita.modoPreparo.map((passo) => {
			const { texto, correcoes } = embelezarPasso(passo);
			for (const correcao of correcoes) correcoesAplicadas.set(correcao, (correcoesAplicadas.get(correcao) ?? 0) + 1);
			return texto;
		});

		receita.modoPreparoMarkdown = gerarMarkdownModoPreparo(receita.modoPreparo);
		receita.receitaMarkdown = gerarMarkdownReceita({
			titulo: receita.titulo,
			ingredientes: receita.ingredientes.map((item) => ({ nome: item.nomeCanonico, quantidade: item.quantidade })),
			passos: receita.modoPreparo,
		});
	}

	return correcoesAplicadas;
}

function consolidarInsumos(receitas: TReceitaExtraida[]): TInsumoExtraido[] {
	const mapa = new Map<string, TInsumoExtraido>();
	const quantidadesPorInsumo = new Map<string, number[]>();

	for (const receita of receitas) {
		for (const ingrediente of receita.ingredientes) {
			// A chave e o nome canonico: e o dicionario que decide o que e o mesmo produto.
			const chave = ingrediente.nomeCanonico;
			const existente = mapa.get(chave);
			quantidadesPorInsumo.set(chave, [...(quantidadesPorInsumo.get(chave) ?? []), ingrediente.quantidade]);

			if (!existente) {
				mapa.set(chave, {
					nomeCanonico: chave,
					origemNomeCanonico: ingrediente.origemNomeCanonico,
					variacoes: [ingrediente.nome],
					unidade: "KG",
					ocorrencias: 1,
					quantidadeMinima: ingrediente.quantidade,
					quantidadeMaxima: ingrediente.quantidade,
					receitas: [`${receita.codigo} - ${receita.nome}`],
				});
				continue;
			}

			existente.ocorrencias += 1;
			existente.quantidadeMinima = Math.min(existente.quantidadeMinima, ingrediente.quantidade);
			existente.quantidadeMaxima = Math.max(existente.quantidadeMaxima, ingrediente.quantidade);
			if (!existente.variacoes.includes(ingrediente.nome)) existente.variacoes.push(ingrediente.nome);
			const referencia = `${receita.codigo} - ${receita.nome}`;
			if (!existente.receitas.includes(referencia)) existente.receitas.push(referencia);
		}
	}

	// A unidade "mais utilizavel" e decidida a partir de todas as quantidades do insumo.
	for (const insumo of mapa.values()) {
		insumo.unidade = inferirUnidadeInsumo(quantidadesPorInsumo.get(insumo.nomeCanonico) ?? [], insumo.nomeCanonico);
	}

	return [...mapa.values()].sort((a, b) => b.ocorrencias - a.ocorrencias || a.nomeCanonico.localeCompare(b.nomeCanonico));
}

/**
 * Propaga a unidade decidida na consolidacao para cada ingrediente das receitas e
 * converte a quantidade (kg) para essa unidade — e o valor que vira o vinculo da receita.
 */
function aplicarUnidadesAosIngredientes(receitas: TReceitaExtraida[], insumos: TInsumoExtraido[]): void {
	const unidadePorInsumo = new Map(insumos.map((insumo) => [insumo.nomeCanonico, insumo.unidade]));

	for (const receita of receitas) {
		for (const ingrediente of receita.ingredientes) {
			const unidade = unidadePorInsumo.get(ingrediente.nomeCanonico) ?? "KG";
			ingrediente.unidade = unidade;
			ingrediente.quantidadeNaUnidade = converterDeKg(ingrediente.quantidade, unidade) ?? ingrediente.quantidade;
		}
	}
}

/** Agrupa insumos com nomes muito parecidos (erros de digitacao do manual) para revisao manual. */
function detectarPossiveisDuplicados(insumos: TInsumoExtraido[]) {
	const pares: { a: string; b: string; distancia: number }[] = [];

	for (let i = 0; i < insumos.length; i++) {
		for (let j = i + 1; j < insumos.length; j++) {
			const a = normalizarNome(insumos[i].nomeCanonico);
			const b = normalizarNome(insumos[j].nomeCanonico);
			const distancia = distanciaLevenshtein(a, b);
			const limite = Math.max(1, Math.floor(Math.min(a.length, b.length) * 0.2));
			if (distancia <= limite) pares.push({ a, b, distancia });
		}
	}

	return pares.sort((x, y) => x.distancia - y.distancia);
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
	const caminhoPdf = resolve(lerArgumento("pdf", "./receitas-congelatte.pdf"));
	const diretorioSaida = resolve(lerArgumento("out", "../recompracrm-tmpworks/congelatte"));
	const arquivoSaida = resolve(diretorioSaida, "receitas-congelatte.json");
	const arquivoCache = resolve(diretorioSaida, "paginas-extraidas.json");
	const reusarExtracao = process.argv.includes("--reuse-extracao");

	// A leitura do PDF (69 MB) e a parte cara e nunca muda. Com o cache, iterar nos
	// dicionarios de enriquecimento custa menos de um segundo por rodada.
	let paginas: TPaginaExtraida[];
	if (reusarExtracao && existsSync(arquivoCache)) {
		paginas = JSON.parse(readFileSync(arquivoCache, { encoding: "utf-8" })) as TPaginaExtraida[];
		console.log(`[congelatte] extracao reaproveitada do cache: ${arquivoCache}`);
	} else {
		console.log(`[congelatte] lendo PDF: ${caminhoPdf}`);
		paginas = await extrairPaginas(caminhoPdf);
		mkdirSync(dirname(arquivoCache), { recursive: true });
		writeFileSync(arquivoCache, JSON.stringify(paginas), { encoding: "utf-8" });
	}
	console.log(`[congelatte] paginas lidas: ${paginas.length}`);

	const receitas = extrairReceitas(paginas);
	const correcoesAplicadas = enriquecerReceitas(receitas);
	const insumos = consolidarInsumos(receitas);
	aplicarUnidadesAosIngredientes(receitas, insumos);
	const possiveisDuplicados = detectarPossiveisDuplicados(insumos);

	const receitasComAlerta = receitas.filter((receita) => receita.alertas.length > 0);
	const receitasSemIngredientes = receitas.filter((receita) => receita.ingredientes.length === 0);
	const receitasSemPreparo = receitas.filter((receita) => receita.modoPreparo.length === 0);

	// Insumos onde mais de uma grafia do PDF colapsou num unico produto: e o que precisa de conferencia.
	const insumosUnificados = insumos
		.filter((insumo) => insumo.variacoes.length > 1)
		.map((insumo) => ({ nomeCanonico: insumo.nomeCanonico, variacoes: insumo.variacoes }));

	// Insumos que cairam no title case automatico — candidatos a entrar no dicionario.
	const insumosSemDicionario = insumos.filter((insumo) => insumo.origemNomeCanonico === "TITULO_AUTOMATICO").map((insumo) => insumo.nomeCanonico);

	const resultado = {
		gerado: {
			arquivoOrigem: caminhoPdf,
			totalPaginas: paginas.length,
		},
		resumo: {
			totalReceitas: receitas.length,
			totalGelatos: receitas.filter((receita) => receita.categoria === "GELATO").length,
			totalSobremesas: receitas.filter((receita) => receita.categoria === "SOBREMESA").length,
			totalInsumosUnicos: insumos.length,
			totalIngredientesReferenciados: receitas.reduce((total, receita) => total + receita.ingredientes.length, 0),
			insumosVindosDoDicionario: insumos.length - insumosSemDicionario.length,
			insumosUnificados: insumosUnificados.length,
		},
		diagnosticos: {
			insumosUnificados,
			insumosSemDicionario,
			correcoesOrtograficasAplicadas: [...correcoesAplicadas.entries()]
				.map(([correcao, ocorrencias]) => ({ correcao, ocorrencias }))
				.sort((a, b) => b.ocorrencias - a.ocorrencias),
			receitasSemIngredientes: receitasSemIngredientes.map((receita) => `${receita.codigo} - ${receita.nome}`),
			receitasSemPreparo: receitasSemPreparo.map((receita) => `${receita.codigo} - ${receita.nome}`),
			receitasComAlerta: receitasComAlerta.map((receita) => ({
				receita: `${receita.codigo} - ${receita.nome}`,
				pagina: receita.paginaIngredientes,
				alertas: receita.alertas,
			})),
			possiveisInsumosDuplicados: possiveisDuplicados,
		},
		insumos,
		receitas,
	};

	mkdirSync(dirname(arquivoSaida), { recursive: true });
	writeFileSync(arquivoSaida, JSON.stringify(resultado, null, 2), { encoding: "utf-8" });

	console.log("");
	console.log(`[congelatte] receitas .............. ${resultado.resumo.totalReceitas}`);
	console.log(`[congelatte]   gelatos ............. ${resultado.resumo.totalGelatos}`);
	console.log(`[congelatte]   sobremesas .......... ${resultado.resumo.totalSobremesas}`);
	console.log(`[congelatte] insumos unicos ....... ${resultado.resumo.totalInsumosUnicos}`);
	console.log(`[congelatte]   via dicionario ..... ${resultado.resumo.insumosVindosDoDicionario}`);
	console.log(`[congelatte]   unificados ......... ${insumosUnificados.length}`);
	console.log(`[congelatte]   sem dicionario ..... ${insumosSemDicionario.length}`);
	console.log(`[congelatte] correcoes na prosa ... ${correcoesAplicadas.size}`);
	console.log(`[congelatte] sem ingredientes ..... ${receitasSemIngredientes.length}`);
	console.log(`[congelatte] sem modo de preparo .. ${receitasSemPreparo.length}`);
	console.log(`[congelatte] com alertas .......... ${receitasComAlerta.length}`);
	console.log(`[congelatte] possiveis duplicados . ${possiveisDuplicados.length}`);
	console.log("");
	console.log(`[congelatte] JSON gerado em: ${arquivoSaida}`);
}

main().catch((error) => {
	console.error("[congelatte] falha na extracao:", error);
	process.exit(1);
});
