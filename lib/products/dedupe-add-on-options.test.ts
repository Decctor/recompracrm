import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAddOnOptionName, planAddOnOptionDedupe, type TDedupeOptionRow } from "./dedupe-add-on-options";

const GROUP = "grupo-1";

function option(overrides: Partial<TDedupeOptionRow> & { id: string; nome: string }): TDedupeOptionRow {
	return {
		produtoAddOnId: GROUP,
		idExterno: null,
		codigo: null,
		precoDelta: 0,
		maxQtdePorItem: 1,
		produtoId: null,
		produtoVarianteId: null,
		quantidadeConsumo: 1,
		ativo: true,
		dataExclusao: null,
		...overrides,
	};
}

function plan(options: TDedupeOptionRow[], modifiers: Record<string, number> = {}, aliases?: Map<string, string>) {
	return planAddOnOptionDedupe({
		groupId: GROUP,
		options,
		modifierCountByOptionId: new Map(Object.entries(modifiers)),
		catalogLinkCountByOptionId: new Map(),
		aliases,
	});
}

test("normalização ignora acentos, caixa e espaços em volta de parênteses", () => {
	assert.equal(normalizeAddOnOptionName("Ninho Trufado (Zero adiçao de açúcar)"), normalizeAddOnOptionName("ninho trufado(Zero adição de açúcar)"));
	assert.equal(normalizeAddOnOptionName("  Chocolate  de Dubai "), "chocolate de dubai");
});

test("a opção ativa e viva sobrevive e herda código, estoque e id externo das cópias inativas", () => {
	// O cenário real: cópia manual ativa (máx/item 4, sem código) + cópias de conector inativas
	// com código e vínculo de estoque, movidas para o grupo pela mesclagem de grupos.
	const manual = option({ id: "manual", nome: "Açaí", maxQtdePorItem: 4 });
	const connectorA = option({ id: "conn-a", nome: "Açaí", ativo: false, codigo: "2402389", idExterno: "2402389", produtoId: "prod-acai" });
	const connectorB = option({ id: "conn-b", nome: "Açaí", ativo: false, codigo: "2402389", idExterno: "2402389", produtoId: "prod-acai" });
	const tombstone = option({ id: "tomb", nome: "Açaí", ativo: false, dataExclusao: new Date("2026-09-14"), codigo: "2402389" });

	const result = plan([manual, connectorA, connectorB, tombstone], { tomb: 24 });

	assert.equal(result.clusters.length, 1);
	const [cluster] = result.clusters;
	assert.equal(cluster.survivor.id, "manual");
	assert.deepEqual(
		cluster.losers.map((loser) => loser.option.id),
		["conn-a", "conn-b", "tomb"],
	);
	assert.equal(cluster.losers[2].modifierCount, 24);
	assert.deepEqual(cluster.survivorUpdates, {
		codigo: "2402389",
		idExterno: "2402389",
		produtoId: "prod-acai",
		produtoVarianteId: null,
		quantidadeConsumo: 1,
	});
	assert.deepEqual(cluster.conflicts, []);
});

test("tombstone nunca sobrevive, mesmo sendo a única com histórico de vendas", () => {
	const live = option({ id: "live", nome: "Baunilha", ativo: false });
	const tombstone = option({ id: "tomb", nome: "Baunilha", ativo: false, dataExclusao: new Date("2026-09-14") });
	const [cluster] = plan([live, tombstone], { tomb: 41 }).clusters;
	assert.equal(cluster.survivor.id, "live");
});

test("máx/item vira o maior entre as vivas; tombstones não contam", () => {
	const survivor = option({ id: "a", nome: "Pudim", maxQtdePorItem: 1 });
	const other = option({ id: "b", nome: "Pudim", ativo: false, maxQtdePorItem: 4 });
	const tombstone = option({ id: "c", nome: "Pudim", ativo: false, maxQtdePorItem: 99, dataExclusao: new Date() });
	const [cluster] = plan([survivor, other, tombstone]).clusters;
	assert.equal(cluster.survivorUpdates.maxQtdePorItem, 4);
});

test("preço divergente entre vivas é reportado e o do sobrevivente mantido", () => {
	const survivor = option({ id: "a", nome: "Nutella", precoDelta: 0 });
	const other = option({ id: "b", nome: "Nutella", ativo: false, precoDelta: 3 });
	const [cluster] = plan([survivor, other]).clusters;
	assert.equal(cluster.conflicts.length, 1);
	assert.match(cluster.conflicts[0], /preços divergentes/);
	assert.equal(cluster.survivorUpdates.maxQtdePorItem, undefined);
});

test("id externo sem ':' tem preferência sobre o legado 'grupo:opcao'", () => {
	const survivor = option({ id: "a", nome: "Oreo" });
	const legacy = option({ id: "b", nome: "Oreo", ativo: false, idExterno: "1003031:1713239", codigo: "1713239" });
	const current = option({ id: "c", nome: "Oreo", ativo: false, idExterno: "1713239" });
	const [cluster] = plan([survivor, legacy, current]).clusters;
	assert.equal(cluster.survivorUpdates.idExterno, "1713239");
	assert.equal(cluster.survivorUpdates.codigo, "1713239");
});

test("aliases juntam grafias que o normalizador não junta; sem alias ficam intocadas", () => {
	const a = option({ id: "a", nome: "Banoffee" });
	const b = option({ id: "b", nome: "Banoffe", ativo: false });
	assert.equal(plan([a, b]).clusters.length, 0);
	const aliased = plan([a, b], {}, new Map([["banoffe", "banoffee"]]));
	assert.equal(aliased.clusters.length, 1);
	assert.equal(aliased.clusters[0].survivor.id, "a");
	assert.match(aliased.clusters[0].conflicts[0], /grafias unificadas/);
});

test("opções de outro grupo são ignoradas", () => {
	const a = option({ id: "a", nome: "Laka" });
	const other = option({ id: "b", nome: "Laka", produtoAddOnId: "grupo-2" });
	const result = plan([a, other]);
	assert.equal(result.clusters.length, 0);
	assert.deepEqual(result.untouchedOptionIds, ["a"]);
});
