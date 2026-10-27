import { createHash } from "node:crypto";
import type { products, productVariants, productOptions, productOptionValues, productVariantOptionValues } from "@/services/drizzle/schema/products";

export type TPhiboCatalogRow = {
	estoqueId: string;
	produtoId: number;
	produtoCod: string;
	produtoEan: string;
	produtoDesc: string;
	corDescricao: string;
	corCodigoHexa: string | null;
	gradeTamanho: string;
	codNcm: string;
	unCom: string;
	grupoEstoqDescricao: string;
	vlrVendaUn: number;
	vlrUnCusto: number | null;
	fotoUrl: string | null;
	qtdeCom: number;
	status: 0 | 1;
};
export type TPhiboAppCatalog = {
	produtos: (typeof products.$inferSelect)[];
	variantes: (typeof productVariants.$inferSelect)[];
	opcoes: (typeof productOptions.$inferSelect)[];
	valores: (typeof productOptionValues.$inferSelect)[];
	combinacoes: (typeof productVariantOptionValues.$inferSelect)[];
};
export function catalogHash(value: string) {
	return createHash("sha256").update(value).digest("hex");
}
export function catalogId(organizationId: string, kind: string, key: string) {
	const h = catalogHash(`${organizationId}:phibo-catalogo:${kind}:${key}`);
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
export function catalogName(value: string) {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}
function candidateName(value: string) {
	return catalogName(value).replace(
		/\b(preta|branca|amarela|vermelha)\b/g,
		(word) => ({ preta: "preto", branca: "branco", amarela: "amarelo", vermelha: "vermelho" })[word]!,
	);
}
export function assertCatalog(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));

/** Ativos e excluídos, todas as páginas; nunca deduz exclusão de uma ausência. */
export function parsePhiboCatalog(value: unknown): TPhiboCatalogRow[] {
	assertCatalog(record(value) && value.fonte === "https://app.phibo.com.br/compras/gestao-estoque/listar-produtos", "Fonte do catálogo inválida.");
	assertCatalog(
		Array.isArray(value.consultas) && value.consultas.length === 2 && new Set(value.consultas.map((c) => c.status)).size === 2,
		"Extração deve incluir ativos e excluídos.",
	);
	const result: TPhiboCatalogRow[] = [];
	for (const run of value.consultas) {
		assertCatalog(record(run) && (run.status === 0 || run.status === 1) && Array.isArray(run.paginas) && run.paginas.length, "Consulta inválida.");
		const first = run.paginas[0];
		assertCatalog(
			record(first) && Number.isSafeInteger(first.totalElements) && Number(first.totalElements) >= 0 && first.size === 50,
			"Totais inválidos.",
		);
		assertCatalog(
			first.totalPages === Math.ceil(Number(first.totalElements) / 50) && run.paginas.length === Math.max(1, Number(first.totalPages)),
			"Paginação incompleta.",
		);
		for (const [index, page] of run.paginas.entries()) {
			assertCatalog(
				record(page) &&
					page.number === index &&
					page.size === 50 &&
					page.totalElements === first.totalElements &&
					page.totalPages === first.totalPages &&
					Array.isArray(page.content),
				"Página inconsistente.",
			);
			const url = new URL(String(page.url));
			assertCatalog(
				url.origin === "https://www.phibo-api.com.br" &&
					url.pathname === "/estoque/listarProdutos" &&
					url.searchParams.get("page") === String(index) &&
					url.searchParams.get("size") === "50" &&
					url.searchParams.get("status") === String(run.status) &&
					url.searchParams.get("opcaoConsulta") === (run.status ? "6" : "12"),
				"Filtro da consulta divergente.",
			);
			assertCatalog(page.content.length === Math.min(50, Number(first.totalElements) - index * 50), "Página truncada.");
			for (const row of page.content) {
				assertCatalog(record(row), "Produto inválido.");
				for (const key of [
					"estoqueId",
					"produtoEan",
					"produtoCod",
					"produtoDesc",
					"corDescricao",
					"gradeTamanho",
					"codNcm",
					"unCom",
					"grupoEstoqDescricao",
				])
					assertCatalog(typeof row[key] === "string" && String(row[key]).trim(), `Campo ${key} inválido.`);
				assertCatalog(row.status === run.status && Number.isSafeInteger(row.produtoId) && Number(row.produtoId) > 0, "Status/ID do modelo inválido.");
				assertCatalog(typeof row.vlrVendaUn === "number" && Number.isFinite(row.vlrVendaUn) && row.vlrVendaUn >= 0, "Preço inválido.");
				assertCatalog(
					row.vlrUnCusto === null || (typeof row.vlrUnCusto === "number" && Number.isFinite(row.vlrUnCusto) && row.vlrUnCusto >= 0),
					"Custo inválido.",
				);
				assertCatalog(typeof row.qtdeCom === "number" && Number.isFinite(row.qtdeCom), "Saldo de origem inválido.");
				assertCatalog(
					row.corCodigoHexa === null || (typeof row.corCodigoHexa === "string" && /^#[a-f0-9]{6}$/i.test(row.corCodigoHexa)),
					"Hexadecimal inválido.",
				);
				assertCatalog(row.fotoUrl === null || (typeof row.fotoUrl === "string" && row.fotoUrl.startsWith("https://")), "Imagem inválida.");
				assertCatalog(/^\d{8,14}$/.test(String(row.produtoEan)), "EAN inválido.");
				result.push(row as TPhiboCatalogRow);
			}
		}
	}
	assertCatalog(
		new Set(result.map((r) => r.produtoEan)).size === result.length && new Set(result.map((r) => r.estoqueId)).size === result.length,
		"EAN/estoque repetido entre páginas ou status.",
	);
	return result.sort((a, b) => a.produtoId - b.produtoId || a.produtoEan.localeCompare(b.produtoEan));
}

function barcode(node: { codigo: string | null; codigoBarras: string | null }, ean: string) {
	return node.codigo === ean || node.codigoBarras === ean;
}
function variantCombination(v: TPhiboAppCatalog["variantes"][number], row: TPhiboCatalogRow, app: TPhiboAppCatalog) {
	if (
		catalogName(v.nome) === catalogName(`${row.corDescricao} / ${row.gradeTamanho}`) ||
		catalogName(v.nome) === catalogName(`${row.gradeTamanho} / ${row.corDescricao}`)
	)
		return true;
	const assigned = app.combinacoes
		.filter((c) => c.produtoVarianteId === v.id)
		.map((c) => ({ option: app.opcoes.find((o) => o.id === c.opcaoId), value: app.valores.find((o) => o.id === c.opcaoValorId) }));
	return (
		assigned.some((a) => catalogName(a.option?.nome ?? "") === "cor" && catalogName(a.value?.nome ?? "") === catalogName(row.corDescricao)) &&
		assigned.some((a) => catalogName(a.option?.nome ?? "") === "tamanho" && catalogName(a.value?.nome ?? "") === catalogName(row.gradeTamanho))
	);
}

/** Não move nem exclui históricos. Avulsos históricos ficam como aliases inativos, para a fase 2. */
export function planPhiboCatalog(rows: TPhiboCatalogRow[], app: TPhiboAppCatalog, organizationId: string) {
	for (const table of Object.values(app))
		for (const node of table) assertCatalog(node.organizacaoId === organizationId, "Snapshot contém dados de outra organização.");
	const groups = [];
	const pending: Array<{ modeloPhiboId: number; nome: string; motivo: string; eans: string[]; candidatos: string[] }> = [];
	const aliases: Array<{ produtoHistoricoId: string; ean: string; produtoId: string; produtoVarianteId: string }> = [];
	const parentsWithVariants = new Set(app.variantes.map((v) => v.produtoId));
	const legacy = (p: TPhiboAppCatalog["produtos"][number]) => p.grupo === "PHIBO-HISTORICO" && !parentsWithVariants.has(p.id);
	const modelsByName = new Map<string, Set<number>>();
	for (const row of rows) {
		const name = catalogName(row.produtoDesc);
		const ids = modelsByName.get(name) ?? new Set<number>();
		ids.add(row.produtoId);
		modelsByName.set(name, ids);
	}
	for (const modelId of new Set(rows.map((r) => r.produtoId))) {
		const members = rows.filter((r) => r.produtoId === modelId);
		const first = members[0];
		const eans = new Set(members.map((r) => r.produtoEan));
		const problem = (reason: string, candidates: string[] = []) =>
			pending.push({ modeloPhiboId: modelId, nome: first.produtoDesc.trim(), motivo: reason, eans: [...eans], candidatos: candidates });
		const activeKeys = members.filter((r) => r.status === 1).map((r) => `${catalogName(r.corDescricao)}|${catalogName(r.gradeTamanho)}`);
		if (new Set(activeKeys).size !== activeKeys.length) {
			problem("Mais de um EAN ativo para a mesma cor/tamanho.");
			continue;
		}
		if (members.some((r) => catalogName(r.produtoDesc) !== catalogName(first.produtoDesc) || r.codNcm !== first.codNcm || r.unCom !== first.unCom)) {
			problem("Modelo com descrição/NCM/unidade inconsistentes.");
			continue;
		}
		const directVariants = app.variantes.filter(
			(v) => eans.has(v.codigo ?? "") || eans.has(v.codigoBarras ?? "") || members.some((r) => v.idExterno === `phibo:estoque:${r.estoqueId}`),
		);
		const anchors = new Set(directVariants.map((v) => v.produtoId));
		const uniqueModelName = modelsByName.get(catalogName(first.produtoDesc))?.size === 1;
		const candidates = app.produtos.filter(
			(p) =>
				!legacy(p) &&
				(p.codigo === `PHIBO-MODELO-${modelId}` || anchors.has(p.id) || (uniqueModelName && catalogName(p.nome) === catalogName(first.produtoDesc))),
		);
		if (candidates.length > 1) {
			problem(
				"Mais de uma família no app representa o modelo; unificação posterior necessária.",
				candidates.map((p) => p.id),
			);
			continue;
		}
		const colored = app.produtos.filter(
			(p) => !legacy(p) && members.some((r) => candidateName(p.nome) === candidateName(`${r.produtoDesc} - ${r.corDescricao}`)),
		);
		if (!candidates.length && colored.length) {
			problem(
				"Produtos por cor já existem no app; evitar duplicar antes de resolver seus vínculos.",
				colored.map((p) => p.id),
			);
			continue;
		}
		const parent = candidates[0] ?? null;
		const productId = parent?.id ?? catalogId(organizationId, "modelo", String(modelId));
		const flatNonLegacy = app.produtos.filter((p) => !legacy(p) && members.some((r) => barcode(p, r.produtoEan)));
		if (flatNonLegacy.length) {
			problem(
				"EAN já pertence a produto operacional avulso.",
				flatNonLegacy.map((p) => p.id),
			);
			continue;
		}
		if (app.produtos.some((p) => legacy(p) && members.some((r) => barcode(p, r.produtoEan)) && (p.ativo || p.vendavel))) {
			problem("Produto histórico com EAN da fonte está habilitado; revisar antes de duplicar sua identidade.");
			continue;
		}
		const ownOptions = app.opcoes.filter((o) => o.produtoId === productId);
		let color = ownOptions.filter((o) => catalogName(o.nome) === "cor");
		let size = ownOptions.filter((o) => catalogName(o.nome) === "tamanho");
		// Formulário manual recém-criado com nomes livres e sem variantes: reaproveita os eixos por tipo.
		if (!app.variantes.some((v) => v.produtoId === productId) && ownOptions.length === 2) {
			if (!color.length) color = ownOptions.filter((o) => o.tipo === "COR");
			if (!size.length) size = ownOptions.filter((o) => o.tipo === "TEXTO");
		}
		if (color.length > 1 || size.length > 1 || ownOptions.some((o) => ![...color, ...size].some((axis) => axis.id === o.id))) {
			problem("Eixos do produto exigem revisão antes da sincronização.", [productId]);
			continue;
		}
		const optionIds = {
			cor: color[0]?.id ?? catalogId(organizationId, "eixo", `${productId}:Cor`),
			tamanho: size[0]?.id ?? catalogId(organizationId, "eixo", `${productId}:Tamanho`),
		};
		if (
			[color[0], size[0]].filter(Boolean).some((axis) => {
				const values = app.valores.filter((v) => v.opcaoId === axis!.id);
				return new Set(values.map((v) => catalogName(v.nome))).size !== values.length;
			})
		) {
			problem("Valores de eixo repetidos.", [productId]);
			continue;
		}
		const assignments = [];
		let conflict: string | null = null;
		for (const row of members) {
			const direct = directVariants.filter((v) => barcode(v, row.produtoEan) || v.idExterno === `phibo:estoque:${row.estoqueId}`);
			if (direct.length > 1 || direct.some((v) => v.produtoId !== productId)) {
				conflict = "EAN com mais de uma variante de destino.";
				break;
			}
			// Uma combinação pode ter um EAN excluído e outro ativo no Phibo: não são o mesmo SKU.
			const combos = app.variantes.filter(
				(v) =>
					v.produtoId === productId &&
					variantCombination(v, row, app) &&
					!members.some((r) => r.produtoEan !== row.produtoEan && barcode(v, r.produtoEan)),
			);
			if (combos.length > 1) {
				conflict = "Cor/tamanho com mais de uma variante candidata.";
				break;
			}
			const variant = direct[0] ?? combos[0] ?? null;
			if (
				!variant &&
				app.variantes.some(
					(v) =>
						v.produtoId === productId &&
						candidateName(v.nome) === candidateName(`${row.corDescricao} / ${row.gradeTamanho}`) &&
						!members.some((r) => r.produtoEan !== row.produtoEan && barcode(v, r.produtoEan)),
				)
			) {
				conflict = "Possível combinação equivalente com grafia diferente; revisar antes de criar.";
				break;
			}
			if (variant && !direct.length && variant.codigoBarras && variant.codigoBarras !== row.produtoEan) {
				conflict = "Combinação já tem outro código de barras no app.";
				break;
			}
			const variantId = variant?.id ?? catalogId(organizationId, "ean", row.produtoEan);
			if (!variant && app.variantes.some((v) => v.id === variantId)) {
				conflict = "ID determinístico ocupado por outra identidade.";
				break;
			}
			if (
				variant &&
				[
					[optionIds.cor, row.corDescricao],
					[optionIds.tamanho, row.gradeTamanho],
				].some(([axisId, label]) => {
					const assigned = app.combinacoes.find((c) => c.produtoVarianteId === variant.id && c.opcaoId === axisId);
					return assigned && catalogName(app.valores.find((v) => v.id === assigned.opcaoValorId)?.nome ?? "") !== catalogName(label);
				})
			) {
				conflict = "Valores de eixo existentes divergem da cor/tamanho do Phibo.";
				break;
			}
			assignments.push({
				origem: row,
				varianteId: variantId,
				existente: variant,
				criterio: direct.length ? "EAN/estoque exato" : variant ? "Modelo + cor + tamanho exatos" : "Nova variante",
			});
		}
		if (conflict) {
			problem(conflict, [productId]);
			continue;
		}
		if (new Set(assignments.map((a) => a.varianteId)).size !== assignments.length) {
			problem("Dois EANs resolveriam para a mesma variante.", [productId]);
			continue;
		}
		for (const assignment of assignments)
			for (const p of app.produtos.filter((p) => legacy(p) && barcode(p, assignment.origem.produtoEan)))
				aliases.push({ produtoHistoricoId: p.id, ean: assignment.origem.produtoEan, produtoId: productId, produtoVarianteId: assignment.varianteId });
		groups.push({
			modeloPhiboId: modelId,
			produtoId: productId,
			existente: parent,
			opcoesExistentes: ownOptions,
			valoresExistentes: app.valores.filter((v) => ownOptions.some((o) => o.id === v.opcaoId)),
			opcoesIds: optionIds,
			ativo: members.some((r) => r.status === 1),
			variacoes: assignments,
		});
	}
	// Um destino não pode ser apropriado por dois modelos distintos, mesmo que tenham o mesmo nome.
	const claimed = new Map<string, number[]>();
	for (const group of groups) {
		const models = claimed.get(group.produtoId) ?? [];
		models.push(group.modeloPhiboId);
		claimed.set(group.produtoId, models);
	}
	const duplicates = new Set([...claimed].filter(([, models]) => models.length > 1).flatMap(([, models]) => models));
	for (const group of groups.filter((g) => duplicates.has(g.modeloPhiboId)))
		pending.push({
			modeloPhiboId: group.modeloPhiboId,
			nome: group.variacoes[0].origem.produtoDesc,
			motivo: "O mesmo produto-pai foi identificado por mais de um modelo Phibo.",
			eans: group.variacoes.map((v) => v.origem.produtoEan),
			candidatos: [group.produtoId],
		});
	const safe = groups.filter((g) => !duplicates.has(g.modeloPhiboId));
	const safeIds = new Set(safe.map((g) => g.produtoId));
	const plan = {
		organizacaoId: organizationId,
		grupos: safe,
		pendencias: pending,
		aliasesHistoricos: aliases.filter((a) => safeIds.has(a.produtoId)),
		resumo: {
			modelosFonte: new Set(rows.map((r) => r.produtoId)).size,
			variacoesFonte: rows.length,
			modelosSincronizaveis: safe.length,
			variacoesSincronizaveis: safe.reduce((n, g) => n + g.variacoes.length, 0),
			produtosCriar: safe.filter((g) => !g.existente).length,
			produtosExistentes: safe.filter((g) => g.existente).length,
			variantesCriar: safe.reduce((n, g) => n + g.variacoes.filter((v) => !v.existente).length, 0),
			variantesExistentes: safe.reduce((n, g) => n + g.variacoes.filter((v) => v.existente).length, 0),
			modelosPendentes: pending.length,
			aliasesHistoricos: aliases.filter((a) => safeIds.has(a.produtoId)).length,
		},
	};
	return { ...plan, hash: catalogHash(JSON.stringify(plan)) };
}
export type TPhiboCatalogPlan = ReturnType<typeof planPhiboCatalog>;
