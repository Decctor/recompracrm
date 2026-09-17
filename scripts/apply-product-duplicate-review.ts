/**
 * Aplica revisão humana (codificada) sobre duplicatas.json.
 * Não toca o banco — só regrava o JSON com `decisao`, `motivoRevisao` e absorções ajustadas.
 *
 * Uso:
 *   npx tsx ./scripts/apply-product-duplicate-review.ts --org=27817d9a-cb04-4704-a1f4-15b81a3610d3
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORGANIZACAO_PADRAO = "27817d9a-cb04-4704-a1f4-15b81a3610d3";

type TDecisao = "JUNTAR" | "IGNORAR" | "VARIANTES";

type TRevisaoCluster = {
	decisao: TDecisao;
	motivoRevisao: string;
	/** IDs que saem da fusão mas permanecem listados em `membros` (auditoria). */
	excluirDaFusao?: string[];
	manterId?: string;
};

/** Revisão Congelatte — 2026-09-17 */
const REVISAO: Record<string, TRevisaoCluster> = {
	"cluster-001": {
		decisao: "JUNTAR",
		motivoRevisao: "Mesmo SKU Gelato 180ml (Cardápio Web + legado PRODUTOS). Promoção é item à parte.",
		excluirDaFusao: ["69f8c2f8-d953-4a84-af39-45e6c4115e37"],
	},
	"cluster-002": { decisao: "JUNTAR", motivoRevisao: "Quatro cadastros idênticos do mesmo milk shake 300ml; manter o do cardápio com vendas e iFood." },
	"cluster-003": { decisao: "JUNTAR", motivoRevisao: "Cookie Pistache — só variação de nome." },
	"cluster-004": { decisao: "JUNTAR", motivoRevisao: "Açaí 500ml Cardápio Web + iFood (Médio) + cópia; caso clássico integração." },
	"cluster-005": { decisao: "JUNTAR", motivoRevisao: "Duplicata exata milk shake 700ml." },
	"cluster-006": { decisao: "JUNTAR", motivoRevisao: "Duplicata exata milk shake 500ml + vendas iFood." },
	"cluster-007": { decisao: "JUNTAR", motivoRevisao: "Duplicata exata gelato 360ml 2 sabores." },
	"cluster-008": { decisao: "JUNTAR", motivoRevisao: "Brownie Congelatto — mesmo produto, Cardápio + iFood." },
	"cluster-009": { decisao: "JUNTAR", motivoRevisao: "Cookie Ovomaltine — só grafia." },
	"cluster-010": { decisao: "JUNTAR", motivoRevisao: "Duplicata exata brownie pistache." },
	"cluster-011": { decisao: "JUNTAR", motivoRevisao: "Combo 4 gelatos 180ml — duplicata de importação." },
	"cluster-012": { decisao: "JUNTAR", motivoRevisao: "Gelato 120ml 2 sabores — cardápio vs PRODUTOS." },
	"cluster-013": { decisao: "JUNTAR", motivoRevisao: "Petit gateau 2 sabores — duplicata." },
	"cluster-014": { decisao: "JUNTAR", motivoRevisao: "Brownie 2 sabores — duplicata." },
	"cluster-015": {
		decisao: "IGNORAR",
		motivoRevisao: "Dois itens genéricos 'Adicional' em grupos diferentes (Açaí vs Açaí Zero) — não é o mesmo produto.",
	},
	"cluster-016": { decisao: "JUNTAR", motivoRevisao: "Mesmo adicional trufado; acento em Leitíssimo." },
	"cluster-017": { decisao: "JUNTAR", motivoRevisao: "Petit gateau doce de leite 2 sabores — duplicata." },
	"cluster-018": { decisao: "JUNTAR", motivoRevisao: "Cookie congelatto 2 sabores — duplicata." },
	"cluster-019": { decisao: "JUNTAR", motivoRevisao: "Insumo Manga duplicado no cadastro manual." },
	"cluster-020": { decisao: "JUNTAR", motivoRevisao: "Sabor Paçoca Zero duplicado." },
	"cluster-021": { decisao: "JUNTAR", motivoRevisao: "Insumo Morango duplicado." },
	"cluster-022": { decisao: "JUNTAR", motivoRevisao: "Insumos base Açaí duplicados — mesmo item (confirmado)." },
	"cluster-023": { decisao: "JUNTAR", motivoRevisao: "Sabor Baunilha duplicado." },
	"cluster-024": { decisao: "JUNTAR", motivoRevisao: "Cookie Kinder Bueno — variação de nome." },
	"cluster-025": {
		decisao: "IGNORAR",
		motivoRevisao: "Linha de ovos de Páscoa distintos (Trio, Trio com Pistache, 100 Pistache).",
	},
	"cluster-026": {
		decisao: "VARIANTES",
		motivoRevisao: "Casquinha/cestinha avulsa, tufada e tufada pistache — SKUs diferentes.",
	},
	"cluster-027": {
		decisao: "JUNTAR",
		motivoRevisao: "Trufado chocolate e Gianduia — mesmo adicional no cardápio (confirmado).",
	},
	"cluster-028": {
		decisao: "VARIANTES",
		motivoRevisao: "Mini cone trufado vs pistache.",
	},
	"cluster-029": {
		decisao: "JUNTAR",
		motivoRevisao: "Açaí 300ml e 'Pequeno 300ml' — mesmo tamanho, nomenclatura Cardápio Web.",
	},
	"cluster-030": {
		decisao: "VARIANTES",
		motivoRevisao: "Petit gateau genérico vs '1 sabor' — regras de montagem diferentes.",
	},
	"cluster-031": { decisao: "JUNTAR", motivoRevisao: "Gelato 700ml — mesmo volume (nome com/sem 'até 2 sabores')." },
	"cluster-032": { decisao: "JUNTAR", motivoRevisao: "Gelato 490ml — mesma lógica do 700ml." },
	"cluster-033": {
		decisao: "IGNORAR",
		motivoRevisao: "SKU de venda vs insumo '(Granel)' — não fundir.",
	},
	"cluster-034": {
		decisao: "IGNORAR",
		motivoRevisao: "Açaí Zero 300ml (venda) vs insumo 'Açaí Zero' sem volume.",
	},
	"cluster-035": {
		decisao: "IGNORAR",
		motivoRevisao: "Açaí Zero 500ml vs insumo genérico.",
	},
	"cluster-036": {
		decisao: "IGNORAR",
		motivoRevisao: "Açaí Zero 700ml vs insumo genérico.",
	},
	"cluster-037": {
		decisao: "IGNORAR",
		motivoRevisao: "Ovo 6 fatias (produto) vs insumo 'Ovo'.",
	},
	"cluster-038": {
		decisao: "IGNORAR",
		motivoRevisao: "Cookie tradicional vendável vs granel de produção.",
	},
	"cluster-039": {
		decisao: "VARIANTES",
		motivoRevisao: "Ovolatto 1 vs 2 sabores.",
	},
	"cluster-040": {
		decisao: "IGNORAR",
		motivoRevisao: "Cacau em pó vs '100%' — insumos distintos (confirmado).",
	},
	"cluster-041": {
		decisao: "IGNORAR",
		motivoRevisao: "Cobertura normal vs Zero.",
	},
	"cluster-042": {
		decisao: "IGNORAR",
		motivoRevisao: "Chocotone 750g vs lata — embalagens diferentes.",
	},
	"cluster-043": {
		decisao: "IGNORAR",
		motivoRevisao: "Chocotone Ninho 750g vs lata.",
	},
	"cluster-044": {
		decisao: "IGNORAR",
		motivoRevisao: "Chocotone Pistache 750g vs lata.",
	},
	"cluster-045": {
		decisao: "IGNORAR",
		motivoRevisao: "Chocotone Pistache 150g vs lata — tamanhos/embalagens diferentes.",
	},
	"cluster-046": {
		decisao: "IGNORAR",
		motivoRevisao: "Ovo brownie pistache (produto) vs brownie pistache granel.",
	},
	"cluster-047": {
		decisao: "VARIANTES",
		motivoRevisao: "Festival de gelato inteiro vs meia porção.",
	},
	"cluster-048": {
		decisao: "VARIANTES",
		motivoRevisao: "Cookie congelatto 1 sabor vs linha genérica (regra de sabores).",
	},
	"cluster-049": {
		decisao: "IGNORAR",
		motivoRevisao: "Água com gás vs sem gás.",
	},
	"cluster-050": {
		decisao: "IGNORAR",
		motivoRevisao: "Sucos Del Valle — sabores diferentes (pêssego vs uva).",
	},
	"cluster-051": {
		decisao: "IGNORAR",
		motivoRevisao: "Sucos Del Valle — pêssego vs maracujá.",
	},
	"cluster-052": {
		decisao: "VARIANTES",
		motivoRevisao: "Gelato no cascão 1 vs 2 sabores.",
	},
	"cluster-053": {
		decisao: "IGNORAR",
		motivoRevisao: "Não fundir — cadastros de petit gateau mantidos separados (revisão final).",
	},
	"cluster-054": {
		decisao: "IGNORAR",
		motivoRevisao: "Não fundir — petit gateau × Congelatto mantidos separados (revisão final).",
	},
	"cluster-055": {
		decisao: "IGNORAR",
		motivoRevisao: "Sabor normal vs linha Senza (zero açúcar).",
	},
	"cluster-056": {
		decisao: "IGNORAR",
		motivoRevisao: "Ninho com morango vs versão Zero.",
	},
	"cluster-057": {
		decisao: "IGNORAR",
		motivoRevisao: "Ninho trufado vs Zero.",
	},
	"cluster-058": {
		decisao: "IGNORAR",
		motivoRevisao: "Kinder Bueno vs Branco.",
	},
	"cluster-059": {
		decisao: "IGNORAR",
		motivoRevisao: "Cookie granel vs insumo Kinder Bueno.",
	},
	"cluster-060": {
		decisao: "IGNORAR",
		motivoRevisao: "Chocolate em pedaços vs Zero.",
	},
	"cluster-061": {
		decisao: "IGNORAR",
		motivoRevisao: "Falso positivo: Morango Zero ≠ Ninho com Morango Zero.",
	},
	"cluster-062": {
		decisao: "IGNORAR",
		motivoRevisao: "Petit gâteau chocolate (cardápio) vs granel.",
	},
	"cluster-063": {
		decisao: "IGNORAR",
		motivoRevisao: "Petit gateau Congelatto (venda) vs granel.",
	},
	"cluster-064": {
		decisao: "VARIANTES",
		motivoRevisao: "Coca normal vs Zero — mesmo tamanho, linhas diferentes.",
	},
	"cluster-065": {
		decisao: "IGNORAR",
		motivoRevisao: "Suco uva vs maracujá.",
	},
	"cluster-066": {
		decisao: "IGNORAR",
		motivoRevisao: "Brownie de chocolate vs ovo de Páscoa brownie — categorias diferentes.",
	},
	"cluster-067": {
		decisao: "IGNORAR",
		motivoRevisao: "Chocotone 150g vs lata.",
	},
	"cluster-068": {
		decisao: "VARIANTES",
		motivoRevisao: "Ovo 250g linha chocolate vs pistache.",
	},
};

type TMembro = {
	id: string;
	nome: string;
	codigo: string | null;
	grupo?: string | null;
	uso?: { itensVenda?: number };
};

type TCluster = {
	id: string;
	decisao: TDecisao | null;
	motivoRevisao?: string | null;
	manterId: string;
	absorverIds: string[];
	membros: TMembro[];
	excluidosDaFusao?: { id: string; motivo: string }[];
	acaoSugerida?: string;
	acaoRevisada?: TDecisao;
	confianca?: string;
};

type TArquivo = {
	indice: { id: string; decisao: TDecisao | null; motivoRevisao?: string | null }[];
	clusters: TCluster[];
	resumo: Record<string, number>;
	revisao?: { em: string; por: string; notas: string };
};

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	const indexed = process.argv.find((arg) => arg.startsWith(prefix));
	if (indexed) return indexed.slice(prefix.length);
	const flag = process.argv.indexOf(`--${name}`);
	if (flag === -1) return null;
	return process.argv[flag + 1] ?? null;
}

function aplicarRevisao(arquivo: TArquivo) {
	const faltando = Object.keys(REVISAO).filter((id) => !arquivo.clusters.some((cluster) => cluster.id === id));
	if (faltando.length > 0) {
		throw new Error(`Clusters na revisão sem correspondência no JSON: ${faltando.join(", ")}`);
	}

	for (const cluster of arquivo.clusters) {
		const rev = REVISAO[cluster.id];
		if (!rev) continue;

		cluster.decisao = rev.decisao;
		cluster.motivoRevisao = rev.motivoRevisao;
		cluster.acaoRevisada = rev.decisao;

		if (rev.manterId) cluster.manterId = rev.manterId;

		const excluir = new Set(rev.excluirDaFusao ?? []);
		if (rev.decisao === "JUNTAR") {
			const ids = cluster.membros.map((m) => m.id);
			const manter = rev.manterId ?? cluster.manterId;
			cluster.absorverIds = ids.filter((id) => id !== manter && !excluir.has(id));
			if (excluir.size > 0) {
				cluster.excluidosDaFusao = [...excluir].map((id) => ({
					id,
					motivo: rev.motivoRevisao,
				}));
			}
		} else {
			cluster.absorverIds = [];
		}
	}

	for (const item of arquivo.indice) {
		const rev = REVISAO[item.id];
		if (!rev) continue;
		item.decisao = rev.decisao;
		item.motivoRevisao = rev.motivoRevisao;
	}

	const contagem = (decisao: TDecisao) => arquivo.clusters.filter((c) => c.decisao === decisao).length;
	arquivo.revisao = {
		em: new Date().toISOString(),
		por: "revisão assistida (script apply-product-duplicate-review)",
		notas: "Promoção Gelato 180ml ficou fora do cluster-001; pares em possiveisVariantes não foram alterados.",
	};
	arquivo.resumo.clustersRevisados = arquivo.clusters.filter((c) => c.decisao).length;
	arquivo.resumo.decisaoJuntar = contagem("JUNTAR");
	arquivo.resumo.decisaoIgnorar = contagem("IGNORAR");
	arquivo.resumo.decisaoVariantes = contagem("VARIANTES");
	arquivo.resumo.produtosParaFundir = arquivo.clusters
		.filter((c) => c.decisao === "JUNTAR")
		.reduce((sum, c) => sum + c.absorverIds.length, 0);
}

function resumirMembro(membro: TMembro) {
	return {
		id: membro.id,
		nome: membro.nome,
		codigo: membro.codigo,
		grupo: membro.grupo ?? null,
		itensVenda: membro.uso?.itensVenda ?? 0,
	};
}

function exportarFundir(arquivo: TArquivo, organizacaoId: string, dir: string) {
	const fusoes = arquivo.clusters
		.filter((cluster) => cluster.decisao === "JUNTAR")
		.map((cluster) => {
			const porId = new Map(cluster.membros.map((m) => [m.id, m]));
			const manter = porId.get(cluster.manterId);
			if (!manter) throw new Error(`${cluster.id}: manterId ${cluster.manterId} não está em membros`);

			return {
				clusterId: cluster.id,
				confianca: cluster.confianca ?? null,
				motivoRevisao: cluster.motivoRevisao ?? null,
				manter: resumirMembro(manter),
				absorver: cluster.absorverIds.map((id) => {
					const membro = porId.get(id);
					if (!membro) throw new Error(`${cluster.id}: absorverId ${id} não está em membros`);
					return resumirMembro(membro);
				}),
				excluidosDaFusao: (cluster.excluidosDaFusao ?? []).map((ex) => {
					const membro = porId.get(ex.id);
					return {
						...ex,
						nome: membro?.nome ?? null,
						codigo: membro?.codigo ?? null,
					};
				}),
			};
		})
		.sort((a, b) => a.clusterId.localeCompare(b.clusterId));

	const totalAbsorver = fusoes.reduce((sum, f) => sum + f.absorver.length, 0);
	const out = {
		organizacaoId,
		organizacaoNome: (arquivo as { organizacaoNome?: string }).organizacaoNome ?? null,
		geradoEm: new Date().toISOString(),
		fonte: "duplicatas.json (decisao=JUNTAR)",
		instrucoes: [
			"Cada entrada funde `absorver` no produto `manter` (reapontar FKs e inativar/arquivar duplicatas).",
			"`excluidosDaFusao` permanecem produtos separados apesar de estarem no cluster original.",
			"Executar mesclagem no banco só após validação final.",
		],
		resumo: {
			clusters: fusoes.length,
			produtosAbsorvidos: totalAbsorver,
		},
		fusoes,
	};

	const outPath = resolve(dir, "fundir-produtos.json");
	writeFileSync(outPath, JSON.stringify(out, null, 2), { encoding: "utf-8" });
	return outPath;
}

function main() {
	const organizacaoId = getArgValue("org") ?? ORGANIZACAO_PADRAO;
	const path = resolve(getArgValue("in") ?? `./.local-analysis/product-duplicates/${organizacaoId}/duplicatas.json`);
	if (!existsSync(path)) throw new Error(`Arquivo não encontrado: ${path}`);

	const dir = resolve(path, "..");
	const arquivo = JSON.parse(readFileSync(path, { encoding: "utf-8" })) as TArquivo & {
		organizacaoId?: string;
		organizacaoNome?: string;
	};
	aplicarRevisao(arquivo);
	writeFileSync(path, JSON.stringify(arquivo, null, 2), { encoding: "utf-8" });

	const orgId = arquivo.organizacaoId ?? organizacaoId;
	const fundirPath = exportarFundir(arquivo, orgId, dir);

	console.log(`[revisão] gravado em ${path}`);
	console.log(`[revisão] JUNTAR=${arquivo.resumo.decisaoJuntar} | IGNORAR=${arquivo.resumo.decisaoIgnorar} | VARIANTES=${arquivo.resumo.decisaoVariantes}`);
	console.log(`[revisão] produtos a absorver na fusão: ${arquivo.resumo.produtosParaFundir}`);
	console.log(`[fusões] ${fundirPath}`);
}

main();
