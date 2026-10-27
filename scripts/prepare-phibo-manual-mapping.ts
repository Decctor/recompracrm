/** Decisões editoriais explícitas para os 19 conflitos. Só produz arquivos locais, sem escrever no banco. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalogHash, catalogId, catalogName, assertCatalog, parsePhiboCatalog } from "@/lib/products/phibo-catalog";

const organizationId = "b75a88a2-ef7c-4ff5-a53c-4e227791cad3";
const root = path.resolve(".local-analysis/phibo");
type TOrigin = { produtoId: string; cor?: string; cores?: Record<string, string>; implicita?: string };
type TDecision = {
	modelo: number;
	produto: string | null;
	nome: string;
	confianca: "ALTA" | "MEDIA";
	decisao: string;
	justificativa: string;
	observacoes?: string[];
	origens: TOrigin[];
};

// Estes vínculos foram decididos caso a caso, lendo os dois catálogos, descrições, grades e uso.
// A expansão abaixo apenas aplica a decisão às cores/tamanhos; não escolhe candidatos por similaridade.
const decisions: TDecision[] = [
	{
		modelo: 8866789,
		produto: "9e1393da-b384-4623-a742-a45eb2e65992",
		nome: "Calça Max Pantalona",
		confianca: "ALTA",
		decisao: "REAPROVEITAR_PAI",
		justificativa:
			"Nome específico, modelagem pantalona, preço de R$ 139,90 e grade P/M/G coincidem. Fúcsia é uma cor do modelo no Phibo, não outro modelo. Reaproveitar suas três variantes e acrescentar Preto e Verde Escuro.",
		origens: [{ produtoId: "9e1393da-b384-4623-a742-a45eb2e65992", cor: "Fúcsia" }],
	},
	{
		modelo: 10070419,
		produto: "fa495436-1635-470c-abf2-8bc4bef9354b",
		nome: "Vestido Nula Manga",
		confianca: "ALTA",
		decisao: "REAPROVEITAR_PAI",
		justificativa:
			"Mesmo modelo de manga nula, R$ 199,90 e grade P/M/G/GG. O cadastro Branco representa a cor branca do Phibo. Manter essas quatro variantes e acrescentar as quatro vermelhas.",
		origens: [{ produtoId: "fa495436-1635-470c-abf2-8bc4bef9354b", cor: "Branco" }],
	},
	{
		modelo: 10465959,
		produto: "0aae5b09-7378-465d-9618-d20ec3191808",
		nome: "T-Shirt Querido diário",
		confianca: "ALTA",
		decisao: "REAPROVEITAR_PAI",
		justificativa:
			"Estampa/nome distintivos, cor Preta/Preto, preço R$ 64,90 e os quatro tamanhos coincidem. Associar cada EAN à variante já existente, preservando os SKUs da Nuvemshop.",
		origens: [{ produtoId: "0aae5b09-7378-465d-9618-d20ec3191808", cor: "Preto" }],
	},
	{
		modelo: 11548264,
		produto: "4ea1b137-ab42-4301-9876-16805a9b13e5",
		nome: "Camisa Manga Curta",
		confianca: "ALTA",
		decisao: "UNIFICAR_PAIS_POR_COR",
		justificativa:
			"As descrições detalhadas, medidas por tamanho, preço R$ 79,90 e grade dos dois cadastros NS coincidem. São cores do mesmo modelo Buos Modas. Escolho o pai Preto, que já tem item de venda, e preservo os oito IDs de variantes, incluindo os quatro do pai Marrom.",
		origens: [
			{ produtoId: "3c23c989-08f4-4a28-b6b6-29a7cbc99401", cor: "Marrom" },
			{ produtoId: "4ea1b137-ab42-4301-9876-16805a9b13e5", cor: "Preto" },
		],
	},
	{
		modelo: 12292119,
		produto: "40c07c9c-0d0d-4cae-b07f-050c04330c16",
		nome: "Blusa em Lãzinha Trabalhada",
		confianca: "ALTA",
		decisao: "UNIFICAR_PAIS_POR_COR",
		justificativa:
			"Mesma descrição de trama trabalhada/manga morcego, tamanho único e preço R$ 109,90. Branco e Bege são cores presentes no Phibo. Os dois pais não têm vendas; no desempate, escolho o menor identificador remoto NS (Bege). Título e cor do produto prevalecem sobre a menção genérica a 'preta' copiada na descrição.",
		origens: [
			{ produtoId: "40c07c9c-0d0d-4cae-b07f-050c04330c16", cor: "Bege" },
			{ produtoId: "3c094417-4ea8-4055-8d46-9b25bcd10a72", cor: "Branco" },
		],
	},
	{
		modelo: 12292374,
		produto: "da0b5cac-1713-4eae-b9bf-5d3fe8829cac",
		nome: "Saia em PU",
		confianca: "ALTA",
		decisao: "UNIFICAR_PAIS_POR_COR",
		justificativa:
			"Mesmo material PU, descrição de saia midi com bolsos, cores e grade M/G/GG. Reutilizar as seis variantes. Escolho o pai Preto, com menor ID remoto NS, no empate de uso.",
		observacoes: [
			"Há divergência comercial: app R$ 109,90; Phibo R$ 149,90. A identidade é a mesma; o mapeamento não altera preço nem transforma a diferença em outra peça.",
		],
		origens: [
			{ produtoId: "da0b5cac-1713-4eae-b9bf-5d3fe8829cac", cor: "Preto" },
			{ produtoId: "f118bcd4-0333-43ba-a68f-a2bdf8c80263", cor: "Marrom" },
		],
	},
	{
		modelo: 12570642,
		produto: "b193611e-920a-4ab8-bb6a-403eef786322",
		nome: "Blusa Ombro a Ombro",
		confianca: "ALTA",
		decisao: "UNIFICAR_PAIS_POR_COR",
		justificativa:
			"Mesma descrição, medidas, tamanho único e preço R$ 149,90. Reaproveitar Preto e Marrom, acrescentar Vinho. Ambos sem vendas; o pai Marrom tem o menor ID remoto NS e será o principal no desempate.",
		origens: [
			{ produtoId: "b193611e-920a-4ab8-bb6a-403eef786322", cor: "Marrom" },
			{ produtoId: "776f953d-26dd-4565-b2e4-cc47dda1b6b3", cor: "Preto" },
		],
	},
	{
		modelo: 13222464,
		produto: "ad6387b5-749d-4ca6-ac92-fcb6f6d40410",
		nome: "Blusa Canelada Gola Média",
		confianca: "ALTA",
		decisao: "REAPROVEITAR_PAI",
		justificativa:
			"Nome, gola média, descrição de malha grossa, tamanho único e preço R$ 84,90 coincidem. Preto é a variante existente; Azul Celeste e Vermelho completam o modelo.",
		origens: [{ produtoId: "ad6387b5-749d-4ca6-ac92-fcb6f6d40410", cor: "Preto" }],
	},
	{
		modelo: 13290595,
		produto: "064dbb96-98c5-4352-9199-b8427aeb1093",
		nome: "Blusa Canelada com Capuz",
		confianca: "ALTA",
		decisao: "REAPROVEITAR_PAI",
		justificativa: "Mesmo modelo canelado com capuz, tamanho único e R$ 79,90. Preservar Marrom e acrescentar Off, sem tratar Off como Branco.",
		origens: [{ produtoId: "064dbb96-98c5-4352-9199-b8427aeb1093", cor: "Marrom" }],
	},
	{
		modelo: 13461484,
		produto: "206d818c-c75b-41ee-bf5c-2f741c6c37fc",
		nome: "Colete em Lãzinha",
		confianca: "ALTA",
		decisao: "REAPROVEITAR_PAI",
		justificativa: "Nome, tricô com gola alta, tamanho único e preço R$ 84,90 coincidem. Terracota permanece; acrescentar Verde Escuro e Branco.",
		origens: [{ produtoId: "206d818c-c75b-41ee-bf5c-2f741c6c37fc", cor: "Terracota" }],
	},
	{
		modelo: 15492235,
		produto: null,
		nome: "Vestido Tomara que Caia — Coleção 22.10",
		confianca: "MEDIA",
		decisao: "MANTER_MODELO_SEPARADO",
		justificativa:
			"Não fundir pelo nome genérico. Modelo da coleção 22.10 Vestidos elegant, custo R$ 66 e venda R$ 189,90, sem Vermelho na grade. O outro modelo tem fornecedor Carmen Rosa Patino, coleção Black 20.11, custo R$ 38 e grade com Vermelho. Criar família própria para estes cinco EANs, sem apropriar a variante branca NS compartilhada entre os candidatos.",
		observacoes: [
			"Fornecedor padrão não é evidência de marca. A separação é conservadora e reversível; não afirma que há diferença física comprovada por fotografia.",
		],
		origens: [],
	},
	{
		modelo: 16134176,
		produto: "731dad84-6145-4ad8-8921-51a0a888a780",
		nome: "Vestido Tomara que Caia — Carmen Rosa Patino",
		confianca: "MEDIA",
		decisao: "UNIFICAR_PAIS_POR_COR",
		justificativa:
			"Associar o par NS Branco/Vermelho a este modelo: ambos têm a mesma descrição detalhada, incluindo 'Vermelho', e este é o único dos dois modelos remotos que possui a cor Vermelho. Escolher o pai Vermelho, que já tem venda e referências, e preservar seus IDs. Não associar Branco ao mesmo tempo ao modelo 15492235.",
		observacoes: [
			"A associação do Branco ao mesmo par é interpretativa. App R$ 139,90 versus Phibo R$ 89,90; não usar só preço para identificar nem alterar preços nesta avaliação.",
		],
		origens: [
			{ produtoId: "731dad84-6145-4ad8-8921-51a0a888a780", cor: "Vermelho" },
			{ produtoId: "6343d256-9f10-48e1-afa6-c8aca216fe63", cor: "Branco" },
		],
	},
	{
		modelo: 16522713,
		produto: "e393dd3b-70f7-4f03-967b-4cff7396e451",
		nome: "Calça em Viscolinho",
		confianca: "ALTA",
		decisao: "REAPROVEITAR_PAI",
		justificativa:
			"Nome, tecido viscolinho, modelagem pantalona, preço R$ 149,90 e a combinação Preto/P coincidem. Preservar a variante P existente e completar as outras quatro combinações do Phibo.",
		origens: [{ produtoId: "e393dd3b-70f7-4f03-967b-4cff7396e451", cor: "Preto" }],
	},
	{
		modelo: 16728659,
		produto: "4d8db52a-1695-4687-ab09-4943954996d9",
		nome: "Vestido Curto Tomara que Caia",
		confianca: "ALTA",
		decisao: "REAPROVEITAR_PAI",
		justificativa:
			"A palavra 'curto', a descrição de bojo/camadas, tamanho único e preço R$ 139,90 distinguem este modelo dos dois tomara que caia anteriores. Preservar Vermelho e completar Amarelo e Azul.",
		origens: [{ produtoId: "4d8db52a-1695-4687-ab09-4943954996d9", cor: "Vermelho" }],
	},
	{
		modelo: 18640127,
		produto: "63126c88-57a7-4d93-95ba-043b8de69ce5",
		nome: "T-Shirt Keep Her Wild",
		confianca: "ALTA",
		decisao: "REAPROVEITAR_PAI",
		justificativa:
			"Estampa específica, cor Marrom, preço R$ 69,90 e grade P/M/G/GG/G1 coincidem integralmente. Reutilizar todas as cinco variantes, inclusive a M que já tem venda.",
		origens: [{ produtoId: "63126c88-57a7-4d93-95ba-043b8de69ce5", cor: "Marrom" }],
	},
	{
		modelo: 20121535,
		produto: "3b2787e0-0189-4b26-a2b3-ee062e2f7733",
		nome: "Camisa Xadrez Flanelada",
		confianca: "MEDIA",
		decisao: "CONCILIAR_FAMILIA_HISTORICA",
		justificativa:
			"O pai NS já tem 11 itens de venda, descrição completa, foto e grade P/M/G/GG a R$ 109,90, mesmo preço da fonte. Preferir suas variantes Preto e Caramelo. Interpretar Marrom do Phibo como Marrom escuro do NS: Caramelo já é uma cor separada nos dois catálogos. Reaproveitar os quatro IDs históricos Rosa bebê, propondo movê-los ao pai NS.",
		observacoes: [
			"Marrom → Marrom escuro é equivalência editorial explícita deste modelo, não regra global de cores. Manter a cor canônica Marrom escuro evita criar duas variantes para a mesma peça.",
		],
		origens: [{ produtoId: "3b2787e0-0189-4b26-a2b3-ee062e2f7733", cores: { "Marrom escuro": "Marrom", Caramelo: "Caramelo", Preto: "Preto" } }],
	},
	{
		modelo: 20200844,
		produto: "b7e2dc12-357c-4f0e-8d71-b431ce1a25a0",
		nome: "Blazer em Tweed",
		confianca: "MEDIA",
		decisao: "CONCILIAR_FAMILIA_HISTORICA",
		justificativa:
			"Nome específico coincide; a fonte tem uma única cor (Branco com listra) em P/M/G. Interpretar o M sem cor do NS como esse mesmo M. Preservar o pai e M NS usados por venda, reaproveitar P e G históricos por EAN exato e mapear o M histórico como alias do M NS.",
		observacoes: [
			"O NS não tem foto/descrição e está com preço zero. A cor implícita é uma inferência, não confirmação visual. Preço futuro vem da fonte, R$ 249,90, sem mexer no valor das vendas antigas.",
		],
		origens: [{ produtoId: "b7e2dc12-357c-4f0e-8d71-b431ce1a25a0", implicita: "Branco com listra" }],
	},
	{
		modelo: 18679786,
		produto: "39aabb58-790d-4faa-80e3-aac84bd76433",
		nome: "Jaqueta Jeans",
		confianca: "MEDIA",
		decisao: "AGRUPAR_MODELOS_COMPLEMENTARES",
		justificativa:
			"Manter a família existente: os EANs G e GG já estão nela, e os tamanhos P/G/GG complementam o M do outro cadastro. Não há cor/tamanho repetido. Coleções e custos diferentes sugerem cadastros/lotes distintos, mas não exigem separar uma família quando cada SKU e seu preço são preservados.",
		observacoes: [
			"Preservar R$ 169,90 nestes três SKUs; não uniformizar com R$ 159,90 do outro modelo. Agrupamento editorial de confiança média, reversível e sem colapsar EANs.",
		],
		origens: [],
	},
	{
		modelo: 19548134,
		produto: "39aabb58-790d-4faa-80e3-aac84bd76433",
		nome: "Jaqueta Jeans",
		confianca: "MEDIA",
		decisao: "AGRUPAR_MODELOS_COMPLEMENTARES",
		justificativa:
			"Azul bebê/M e Preto/M já pertencem à mesma família no app e não duplicam a grade P/G/GG do modelo 18679786. Preservar os dois IDs, seus EANs e a origem remota; usar uma única família Jaqueta Jeans com preço próprio em cada variante.",
		observacoes: ["Preservar R$ 159,90 nestes dois SKUs. Os dois IDs de modelo Phibo continuam registrados separadamente no de-para."],
		origens: [],
	},
];

type TVariant = {
	id: string;
	produto_id: string;
	nome: string;
	codigo: string | null;
	codigo_barras: string | null;
	id_externo: string | null;
	preco_venda: number;
	opcoes: Array<{ eixo: string; valor: string }>;
	uso: Array<{ itens: number }>;
};
type TProduct = {
	id: string;
	nome: string;
	codigo: string;
	ativo: boolean;
	variantes: TVariant[];
	uso: Array<{ itens: number }>;
	referencias: Array<{ referencias: number }>;
};
type TEvidence = { organizacaoId: string; casos: Array<{ modeloPhiboId: number; app: TProduct[] }> };
function sizeName(value: string) {
	const name = catalogName(value);
	return ["u", "unico", "unica"].includes(name) ? "U" : name.toUpperCase();
}
function colorName(value: string) {
	return catalogName(value).replace(
		/\b(preta|branca|amarela|vermelha)\b/g,
		(word) => ({ preta: "preto", branca: "branco", amarela: "amarelo", vermelha: "vermelho" })[word]!,
	);
}
function sourceSize(v: TVariant) {
	return sizeName(v.opcoes.find((o) => catalogName(o.eixo) === "tamanho")?.valor ?? v.nome);
}

async function main() {
	const sourceText = await readFile(path.join(root, "phibo-catalogo-completo-2026-10-27.json"), "utf8");
	const evidenceText = await readFile(path.join(root, "conflitos-evidencias-atuais-2026-10-27.json"), "utf8");
	const evidence = JSON.parse(evidenceText) as TEvidence;
	assertCatalog(evidence.organizacaoId === organizationId, "Organização da evidência divergente.");
	const rows = parsePhiboCatalog(JSON.parse(sourceText));
	assertCatalog(
		decisions.length === evidence.casos.length && decisions.every((d) => evidence.casos.some((c) => c.modeloPhiboId === d.modelo)),
		"Modelos da revisão divergentes.",
	);
	const allProducts = [...new Map(evidence.casos.flatMap((c) => c.app).map((p) => [p.id, p])).values()];
	const allVariants = allProducts.flatMap((p) => p.variantes);
	const models = decisions.map((decision) => {
		const members = rows.filter((r) => r.produtoId === decision.modelo);
		const productId = decision.produto ?? catalogId(organizationId, "modelo", String(decision.modelo));
		assertCatalog(!decision.produto || allProducts.some((p) => p.id === decision.produto), "Pai escolhido não consta da evidência da organização.");
		const variants = members.map((row) => {
			const interpreted: Array<{ variante: TVariant; corCanonica: string }> = [];
			for (const origin of decision.origens) {
				const product = allProducts.find((p) => p.id === origin.produtoId);
				assertCatalog(product, "Produto de origem inexistente.");
				for (const v of product.variantes) {
					const axisColor = v.opcoes.find((o) => catalogName(o.eixo) === "cor")?.valor;
					const originalColor = origin.cor ?? origin.implicita ?? axisColor;
					const mappedColor = originalColor ? (origin.cores?.[originalColor] ?? originalColor) : null;
					if (mappedColor && colorName(mappedColor) === colorName(row.corDescricao) && sourceSize(v) === sizeName(row.gradeTamanho))
						interpreted.push({ variante: v, corCanonica: originalColor! });
				}
			}
			assertCatalog(interpreted.length <= 1, `Mais de uma variante editorial para ${row.produtoEan}.`);
			const exact = allVariants.filter((v) => v.codigo === row.produtoEan || v.codigo_barras === row.produtoEan);
			assertCatalog(exact.length <= 1, `Mais de uma variante por EAN ${row.produtoEan}.`);
			const selected = interpreted[0]?.variante ?? exact[0] ?? null;
			const variantId = selected?.id ?? catalogId(organizationId, "ean", row.produtoEan);
			const aliases = exact
				.filter((v) => v.id !== variantId)
				.map((v) => ({ tipo: "VARIANTE", produtoId: v.produto_id, varianteId: v.id, destinoVarianteId: variantId }));
			const flat = allProducts
				.filter((p) => !p.variantes.length && [p.codigo].includes(row.produtoEan))
				.map((p) => ({ tipo: "PRODUTO_AVULSO", produtoId: p.id, destinoVarianteId: variantId }));
			return {
				ean: row.produtoEan,
				estoquePhiboId: row.estoqueId,
				corOrigem: row.corDescricao.trim(),
				corCanonica: interpreted[0]?.corCanonica ?? row.corDescricao.trim(),
				tamanho: sizeName(row.gradeTamanho),
				produtoCanonicoId: productId,
				varianteCanonicaId: variantId,
				produtoAtualId: selected?.produto_id ?? null,
				acao: !selected ? "CRIAR_VARIANTE" : selected.produto_id !== productId ? "MOVER_VARIANTE_PRESERVANDO_ID" : "REUTILIZAR_VARIANTE",
				criterio: interpreted.length ? "INTERPRETACAO_MANUAL_MODELO_COR_TAMANHO" : selected ? "EAN_EXATO" : "COMBINACAO_AUSENTE",
				codigoAtualPreservar: selected?.codigo ?? null,
				codigoBarrasAnterior: selected?.codigo_barras ?? null,
				idExternoPreservar: selected?.id_externo ?? null,
				precoAppObservado: selected?.preco_venda ?? null,
				precoPhiboObservado: row.vlrVendaUn,
				custoPhiboObservado: row.vlrUnCusto,
				aliases: [...aliases, ...flat],
			};
		});
		return {
			modeloPhiboId: decision.modelo,
			nomeOrigem: members[0].produtoDesc.trim(),
			nomeCanonicoProposto: decision.nome,
			produtoCanonicoId: productId,
			criarProduto: !decision.produto,
			decisao: decision.decisao,
			confianca: decision.confianca,
			justificativa: decision.justificativa,
			observacoes: decision.observacoes ?? [],
			produtosAConsolidar: [
				...new Set([...decision.origens.map((o) => o.produtoId), ...variants.map((v) => v.produtoAtualId).filter((id): id is string => Boolean(id))]),
			]
				.filter((id) => id !== productId)
				.map((id) => ({
					produtoId: id,
					codigoOriginal: allProducts.find((p) => p.id === id)?.codigo,
					preservarAliasIntegracao: allProducts.find((p) => p.id === id)?.codigo.startsWith("NS-") ?? false,
				})),
			variantes: variants,
		};
	});
	const assignments = models.flatMap((m) => m.variantes);
	assertCatalog(
		assignments.length === 97 &&
			new Set(assignments.map((v) => v.ean)).size === 97 &&
			new Set(assignments.map((v) => v.varianteCanonicaId)).size === 97,
		"Mapeamento não é um-para-um para os 97 EANs.",
	);
	assertCatalog(
		models.find((m) => m.modeloPhiboId === 15492235)!.produtoCanonicoId !== models.find((m) => m.modeloPhiboId === 16134176)!.produtoCanonicoId,
		"Vestidos distintos não podem compartilhar o pai.",
	);
	assertCatalog(
		models.find((m) => m.modeloPhiboId === 18679786)!.produtoCanonicoId === models.find((m) => m.modeloPhiboId === 19548134)!.produtoCanonicoId,
		"Jaquetas complementares devem compartilhar a família decidida.",
	);
	const summary = {
		modelosAvaliados: models.length,
		eansMapeados: assignments.length,
		familiasCanonicas: new Set(models.map((m) => m.produtoCanonicoId)).size,
		produtosCriar: new Set(models.filter((m) => m.criarProduto).map((m) => m.produtoCanonicoId)).size,
		variantesReutilizar: assignments.filter((v) => v.acao === "REUTILIZAR_VARIANTE").length,
		variantesMoverPreservandoId: assignments.filter((v) => v.acao === "MOVER_VARIANTE_PRESERVANDO_ID").length,
		variantesCriar: assignments.filter((v) => v.acao === "CRIAR_VARIANTE").length,
		aliasesProdutosAvulsos: assignments.flatMap((v) => v.aliases).filter((a) => a.tipo === "PRODUTO_AVULSO").length,
		aliasesVariantes: assignments.flatMap((v) => v.aliases).filter((a) => a.tipo === "VARIANTE").length,
		confiancaAlta: models.filter((m) => m.confianca === "ALTA").length,
		confiancaMedia: models.filter((m) => m.confianca === "MEDIA").length,
	};
	const mapping = {
		versao: 1,
		organizacaoId: organizationId,
		fonteSha256: catalogHash(sourceText),
		evidenciasSha256: catalogHash(evidenceText),
		preparadoEm: new Date().toISOString(),
		somenteMapeamento: true,
		politicas: {
			preservarIdsESkusExternos: true,
			preservarSnapshotsVendas: true,
			naoAlterarSaldos: true,
			naoRemoverProdutosAntesDeMigrarReferencias: true,
			precosObservadosNaoAplicados: true,
			aliasesIntegracaoObrigatoriosAntesDeConsolidarPaisNS: true,
		},
		resumo: summary,
		modelos: models,
	};
	await writeFile(path.join(root, "de-para-manual-conflitos-2026-10-27.json"), JSON.stringify(mapping, null, 2));
	const lines = [
		"# Avaliação manual dos conflitos Phibo",
		"",
		"Organização: Use e abluse. Decisões de identidade propostas; nenhuma alteração no banco.",
		"",
		`19 modelos / 97 EANs mapeados para ${summary.familiasCanonicas} famílias. ${summary.variantesReutilizar} variantes ficam no pai atual, ${summary.variantesMoverPreservandoId} preservam o ID e mudariam de pai, ${summary.variantesCriar} precisam ser criadas.`,
		"",
		"## Condições para aplicar",
		"",
		"Antes de consolidar pais da Nuvemshop, persistir os aliases de seus códigos NS e IDs de variante; o importador precisa resolvê-los ao mesmo destino canônico para não recriar os pais antigos. Não excluir nenhum cadastro nesta avaliação. A aplicação exige migrar referências de pai/variante e os vínculos dos eixos em conjunto, preservando saldos e snapshots monetários das vendas. Preços neste documento são evidências, não atualizações aprovadas por esta execução.",
		"",
	];
	for (const model of models) {
		lines.push(
			`## ${model.nomeCanonicoProposto} — Phibo ${model.modeloPhiboId}`,
			"",
			`Decisão: ${model.decisao}. Confiança: ${model.confianca}.`,
			"",
			model.justificativa,
			"",
			`Pai canônico: ${model.produtoCanonicoId}${model.criarProduto ? " (novo)" : " (existente)"}.`,
			"",
		);
		for (const note of model.observacoes) lines.push(`- Observação: ${note}`);
		for (const variant of model.variantes)
			lines.push(
				`- ${variant.ean}: ${variant.corOrigem}/${variant.tamanho}${variant.corCanonica !== variant.corOrigem ? ` → ${variant.corCanonica}/${variant.tamanho}` : ""} — ${variant.acao}; variante ${variant.varianteCanonicaId}${variant.produtoAtualId && variant.produtoAtualId !== model.produtoCanonicoId ? `, pai anterior ${variant.produtoAtualId}` : ""}.`,
			);
		lines.push("");
	}
	await writeFile(path.join(root, "avaliacao-manual-conflitos-2026-10-27.md"), lines.join("\n"));
	console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : "Falha na revisão.");
	process.exitCode = 1;
});
