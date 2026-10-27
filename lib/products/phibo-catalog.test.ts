import assert from "node:assert/strict";
import test from "node:test";
import { catalogId, parsePhiboCatalog, planPhiboCatalog, type TPhiboAppCatalog, type TPhiboCatalogRow } from "./phibo-catalog";

const org = "org-a";
function row(ean = "3628100025630", model = 10): TPhiboCatalogRow {
	return {
		estoqueId: `estoque-${ean}`,
		produtoId: model,
		produtoEan: ean,
		produtoCod: "COD-MODELO",
		produtoDesc: "Conjunto Calça + Blusa",
		corDescricao: "Marrom",
		corCodigoHexa: "#964B00",
		gradeTamanho: "P",
		codNcm: "61042300",
		unCom: "UN",
		grupoEstoqDescricao: "Conjunto",
		vlrVendaUn: 189.9,
		vlrUnCusto: null,
		fotoUrl: null,
		qtdeCom: 8,
		status: 1,
	};
}
function app(): TPhiboAppCatalog {
	return { produtos: [], variantes: [], opcoes: [], valores: [], combinacoes: [] };
}
function product(extra: Partial<TPhiboAppCatalog["produtos"][number]> = {}) {
	return {
		id: "parent",
		organizacaoId: org,
		nome: row().produtoDesc,
		codigo: "PHIBO-FAMILIA-001",
		codigoBarras: null,
		grupo: "Conjunto",
		ativo: false,
		vendavel: false,
		precoVenda: 0,
		precoVendaAnterior: null,
		...extra,
	} as TPhiboAppCatalog["produtos"][number];
}
function variant(extra: Partial<TPhiboAppCatalog["variantes"][number]> = {}) {
	return {
		id: "variant",
		organizacaoId: org,
		produtoId: "parent",
		nome: "Marrom / P",
		codigo: row().produtoEan,
		codigoBarras: row().produtoEan,
		idExterno: null,
		ativo: false,
		precoVenda: 0,
		precoVendaAnterior: null,
		...extra,
	} as TPhiboAppCatalog["variantes"][number];
}
function source(active: TPhiboCatalogRow[], deleted: TPhiboCatalogRow[] = []) {
	return {
		fonte: "https://app.phibo.com.br/compras/gestao-estoque/listar-produtos",
		consultas: [1, 0].map((status) => {
			const rows = status ? active : deleted;
			return {
				status,
				paginas: Array.from({ length: Math.max(1, Math.ceil(rows.length / 50)) }, (_, i) => ({
					url: `https://www.phibo-api.com.br/estoque/listarProdutos?page=${i}&size=50&opcaoConsulta=${status ? 6 : 12}&status=${status}`,
					content: rows.slice(i * 50, (i + 1) * 50),
					number: i,
					size: 50,
					totalElements: rows.length,
					totalPages: Math.ceil(rows.length / 50),
				})),
			};
		}),
	};
}

test("extração exige todas as páginas de ativos E excluídos, com identidades únicas", () => {
	const rows = Array.from({ length: 51 }, (_, i) => row(String(3628100025600 + i)));
	const input = source(rows, [{ ...row("3628100025700"), status: 0 }]);
	assert.equal(parsePhiboCatalog(input).length, 52);
	const partial = structuredClone(input);
	partial.consultas[0].paginas.pop();
	assert.throws(() => parsePhiboCatalog(partial), /incompleta/);
	assert.throws(() => parsePhiboCatalog(source([row()], [{ ...row(), status: 0 }])), /repetido/);
	const filtered = structuredClone(input);
	filtered.consultas[1].paginas[0].url = filtered.consultas[1].paginas[0].url.replace("opcaoConsulta=12", "opcaoConsulta=6");
	assert.throws(() => parsePhiboCatalog(filtered), /Filtro/);
});

test("datas e saldos não limitam o cadastro completo; excluídos não se tornam ativos", () => {
	const rows = [row(), { ...row("3628100025647"), status: 0 as const, corDescricao: "Bege", qtdeCom: 99 }];
	const parsed = parsePhiboCatalog(source([rows[0]], [rows[1]]));
	const plan = planPhiboCatalog(parsed, app(), org);
	assert.equal(plan.grupos.length, 1);
	assert.equal(plan.grupos[0].ativo, true);
	assert.equal(plan.grupos[0].variacoes.find((v) => v.origem.status === 0)?.origem.qtdeCom, 99);
	const deletedOnly = planPhiboCatalog([rows[1]], app(), org);
	assert.equal(deletedOnly.grupos[0].ativo, false);
});

test("histórico avulso é preservado e registrado como alias da variante canônica", () => {
	const dest = app();
	dest.produtos.push(product({ id: "historico", codigo: row().produtoEan, grupo: "PHIBO-HISTORICO", nome: `${row().produtoDesc} - Marrom - P` }));
	const before = structuredClone(dest);
	const plan = planPhiboCatalog([row()], dest, org);
	assert.equal(plan.resumo.produtosCriar, 1);
	assert.equal(plan.resumo.variantesCriar, 1);
	assert.equal(plan.aliasesHistoricos[0].produtoHistoricoId, "historico");
	assert.notEqual(plan.grupos[0].produtoId, "historico");
	assert.deepEqual(dest, before);
});

test("família já agrupada continua sendo família mesmo com grupo PHIBO-HISTORICO", () => {
	const dest = app();
	dest.produtos.push(product({ grupo: "PHIBO-HISTORICO" }));
	dest.variantes.push(variant());
	const plan = planPhiboCatalog([row()], dest, org);
	assert.equal(plan.resumo.produtosCriar, 0);
	assert.equal(plan.resumo.variantesCriar, 0);
	assert.equal(plan.grupos[0].produtoId, "parent");
	assert.equal(plan.grupos[0].ativo, true);
});

test("EANs exatos mantêm os IDs e irmãos faltantes entram na mesma família", () => {
	const dest = app();
	dest.produtos.push(product());
	dest.variantes.push(variant());
	const rows = [row(), { ...row("3628100025647"), gradeTamanho: "M" }];
	const plan = planPhiboCatalog(rows, dest, org);
	assert.equal(plan.resumo.variantesExistentes, 1);
	assert.equal(plan.resumo.variantesCriar, 1);
	assert.equal(plan.grupos[0].variacoes[0].varianteId, "variant");
});

test("cadastros da Nuvemshop por cor ficam pendentes em vez de gerar duplicatas", () => {
	const dest = app();
	dest.produtos.push(product({ codigo: "NS-1", nome: `${row().produtoDesc} - Marrom`, ativo: true }));
	const plan = planPhiboCatalog([row()], dest, org);
	assert.equal(plan.grupos.length, 0);
	assert.match(plan.pendencias[0].motivo, /por cor/);
});

test("Preta e Preto também geram candidato de revisão, sem criar uma duplicata por grafia", () => {
	const source = { ...row(), corDescricao: "Preto" };
	const dest = app();
	dest.produtos.push(product({ codigo: "NS-1", nome: `${source.produtoDesc} - Preta`, ativo: true }));
	const plan = planPhiboCatalog([source], dest, org);
	assert.equal(plan.grupos.length, 0);
	assert.equal(plan.pendencias.length, 1);
});

test("duas famílias candidatas e EAN duplicado bloqueiam apenas o modelo afetado", () => {
	const dest = app();
	dest.produtos.push(product(), product({ id: "other", codigo: "NS-2" }));
	const plan = planPhiboCatalog([row(), { ...row("3628100025647", 20), produtoDesc: "Outro modelo" }], dest, org);
	assert.equal(plan.pendencias.length, 1);
	assert.equal(plan.grupos.length, 1);
	assert.equal(plan.grupos[0].modeloPhiboId, 20);
});

test("cor/tamanho com outro EAN explícito exige revisão; não sobrescreve código de barras", () => {
	const dest = app();
	dest.produtos.push(product());
	dest.variantes.push(variant({ codigo: "NS-123", codigoBarras: "7890000000000" }));
	const plan = planPhiboCatalog([row()], dest, org);
	assert.equal(plan.grupos.length, 0);
	assert.match(plan.pendencias[0].motivo, /outro código/);
});

test("mesmo nome em modelos remotos diferentes não é identidade suficiente para mesclar", () => {
	const dest = app();
	dest.produtos.push(product());
	dest.variantes.push(variant());
	const plan = planPhiboCatalog([row(), { ...row("3628100025647", 20), gradeTamanho: "M" }], dest, org);
	assert.equal(plan.grupos.length, 2);
	assert.equal(new Set(plan.grupos.map((g) => g.produtoId)).size, 2);
	assert.equal(plan.grupos.find((g) => g.modeloPhiboId === 10)?.produtoId, "parent");
});

test("eixo manual ainda sem variantes pode ser reconhecido por tipo sem excluir opções", () => {
	const dest = app();
	dest.produtos.push(product({ codigo: "", ativo: true }));
	dest.opcoes.push(
		{ id: "cor", organizacaoId: org, produtoId: "parent", nome: "Verde", tipo: "COR", ordem: 1, idExterno: null },
		{ id: "size", organizacaoId: org, produtoId: "parent", nome: "Tamanho M", tipo: "TEXTO", ordem: 0, idExterno: null },
	);
	const plan = planPhiboCatalog([row()], dest, org);
	assert.equal(plan.grupos[0].produtoId, "parent");
	assert.deepEqual(plan.grupos[0].opcoesIds, { cor: "cor", tamanho: "size" });
});

test("uma combinação excluída e uma ativa com EANs diferentes permanecem SKUs distintos", () => {
	const active = row();
	const deleted = { ...row("3628100025647"), status: 0 as const };
	const dest = app();
	dest.produtos.push(product());
	dest.variantes.push(variant());
	const plan = planPhiboCatalog([active, deleted], dest, org);
	assert.equal(plan.grupos[0].variacoes.length, 2);
	assert.equal(plan.resumo.variantesCriar, 1);
	assert.equal(new Set(plan.grupos[0].variacoes.map((v) => v.varianteId)).size, 2);
});

test("snapshot de outra organização é rejeitado; IDs não colidem entre organizações", () => {
	const dest = app();
	dest.produtos.push(product({ organizacaoId: "other" }));
	assert.throws(() => planPhiboCatalog([row()], dest, org), /outra organização/);
	assert.notEqual(catalogId(org, "ean", row().produtoEan), catalogId("other", "ean", row().produtoEan));
});

test("reexecução encontra os mesmos destinos e não recria produtos ou variantes", () => {
	const dest = app();
	const rows = [row()];
	const first = planPhiboCatalog(rows, dest, org);
	dest.produtos.push(product({ id: first.grupos[0].produtoId, codigo: "PHIBO-MODELO-10" }));
	dest.variantes.push(variant({ id: first.grupos[0].variacoes[0].varianteId, produtoId: first.grupos[0].produtoId }));
	const replay = planPhiboCatalog(rows, dest, org);
	assert.equal(replay.resumo.produtosCriar + replay.resumo.variantesCriar, 0);
	assert.equal(replay.resumo.variacoesSincronizaveis, 1);
});
