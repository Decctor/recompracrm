import assert from "node:assert/strict";
import test from "node:test";
import type { TIfoodItemDocument } from "@/lib/integrations/ifood/item-document";
import type { TCatalogLinkEntity } from "@/services/drizzle/schema";
import { applyAddOnAssociationToDocument, type TAddOnGroupNode, type TAddOnLinks } from "./add-ons";

// Documento no shape do `GET /items/{id}/flat`: produto base com dois grupos associados, um deles
// (bebidas) com uma opção paga no canal, e um grupo de oferta cujo produto de opção carrega um grupo
// próprio (3º nível), para exercitar a poda.
function makeDoc(): TIfoodItemDocument {
	return {
		item: { id: "item", productId: "base", status: "AVAILABLE", shifts: [{ startTime: "00:00" }] },
		products: [
			{
				id: "base",
				name: "Gelato 360ml",
				weight: { quantity: 360, unit: "g" },
				optionGroups: [
					{ id: "g-sabores", min: 1, max: 2, index: 0 },
					{ id: "g-oferta", min: 0, max: 4, index: 1 },
				],
			},
			{ id: "p-ninho", name: "Ninho" },
			{ id: "p-cookie", name: "Cookie", optionGroups: [{ id: "g-cobertura", min: 0, max: 1, index: 0 }] },
			{ id: "p-calda", name: "Calda" },
		],
		optionGroups: [
			{ id: "g-sabores", name: "Escolha seu gelato:", status: "AVAILABLE", optionIds: ["o-ninho"] },
			{ id: "g-oferta", name: "Leve mais cookie", status: "AVAILABLE", optionIds: ["o-cookie"] },
			{ id: "g-cobertura", name: "Cobertura", status: "AVAILABLE", optionIds: ["o-calda"] },
		],
		options: [
			{ id: "o-ninho", productId: "p-ninho", price: { value: 0 } },
			{ id: "o-cookie", productId: "p-cookie", price: { value: 0 }, contextModifiers: [{ catalogContext: "DEFAULT", price: { value: 20 } }] },
			{ id: "o-calda", productId: "p-calda", price: { value: 0 } },
		],
	};
}

function link(partial: Partial<TCatalogLinkEntity>): TCatalogLinkEntity {
	return { id: crypto.randomUUID(), tipo: "ADD_ON", ...partial } as TCatalogLinkEntity;
}

const sabores: TAddOnGroupNode = {
	grupoId: "int-sabores",
	nome: "Escolha seu gelato:",
	disponivel: true,
	minOpcoes: 1,
	maxOpcoes: 3,
	indice: 0,
	opcoes: [{ opcaoId: "int-ninho", nome: "Ninho", codigo: null, precoDelta: 0, disponivel: true, indice: 0 }],
};
const turbine: TAddOnGroupNode = {
	grupoId: "int-turbine",
	nome: "Turbine seu pedido:",
	disponivel: true,
	minOpcoes: 0,
	maxOpcoes: 5,
	indice: 1,
	opcoes: [
		{ opcaoId: "int-granola", nome: "Granola", codigo: "GRA", precoDelta: 3, disponivel: true, indice: 0 },
		{ opcaoId: "int-mel", nome: "Mel", codigo: null, precoDelta: 2, disponivel: false, indice: 1 },
	],
};

function linksWith(groups: [string, string[]][]): TAddOnLinks {
	return {
		groups: new Map(
			groups.map(([internal, remotes]) => [internal, remotes.map((remote) => link({ produtoAddOnId: internal, externoOptionGroupId: remote }))]),
		),
		options: new Map(),
	};
}

test("grupo vinculado entra só pelo id, com a regra do app; o resto do documento fica intacto", () => {
	const doc = makeDoc();
	const { created } = applyAddOnAssociationToDocument({
		doc,
		nodes: [sabores],
		links: linksWith([["int-sabores", ["g-sabores"]]]),
		createUnlinked: false,
	});
	assert.equal(created, 0);
	const base = doc.products.find((product) => product.id === "base");
	assert.deepEqual(base?.optionGroups, [{ id: "g-sabores", min: 1, max: 3, index: 0 }]);
	// Campos que o PUT apagaria se não voltassem: peso do produto e agenda do item.
	assert.deepEqual(base?.weight, { quantity: 360, unit: "g" });
	assert.deepEqual(doc.item.shifts, [{ startTime: "00:00" }]);
});

test("associação que o app não tem sai, e a poda leva junto o que só ela alcançava", () => {
	const doc = makeDoc();
	applyAddOnAssociationToDocument({ doc, nodes: [sabores], links: linksWith([["int-sabores", ["g-sabores"]]]), createUnlinked: false });
	assert.deepEqual(
		doc.optionGroups.map((group) => group.id),
		["g-sabores"],
		"a oferta e a cobertura de 3º nível (só alcançável pela oferta) saem",
	);
	assert.deepEqual(
		doc.options.map((option) => option.id),
		["o-ninho"],
	);
	assert.deepEqual(doc.products.map((product) => product.id).toSorted(), ["base", "p-ninho"]);
});

test("grupo mantido preserva o 3º nível e o preço por canal das opções", () => {
	const doc = makeDoc();
	const oferta: TAddOnGroupNode = { ...sabores, grupoId: "int-oferta", nome: "Leve mais cookie", minOpcoes: 0, maxOpcoes: 4, indice: 1 };
	applyAddOnAssociationToDocument({
		doc,
		nodes: [sabores, oferta],
		links: linksWith([
			["int-sabores", ["g-sabores"]],
			["int-oferta", ["g-oferta"]],
		]),
		createUnlinked: false,
	});
	assert.ok(
		doc.optionGroups.some((group) => group.id === "g-cobertura"),
		"o grupo do produto de opção continua",
	);
	const cookie = doc.options.find((option) => option.id === "o-cookie");
	assert.equal(cookie?.contextModifiers?.[0]?.price?.value, 20);
});

test("com cópias do grupo, usa a cópia que o item já tem", () => {
	const doc = makeDoc();
	applyAddOnAssociationToDocument({
		doc,
		nodes: [sabores],
		links: linksWith([["int-sabores", ["g-outra-copia", "g-sabores"]]]),
		createUnlinked: false,
	});
	assert.deepEqual(
		doc.products.find((product) => product.id === "base")?.optionGroups?.map((association) => association.id),
		["g-sabores"],
	);
});

test("grupo sem vínculo só nasce com createUnlinked, com opções, produtos e status do app", () => {
	const skipped = makeDoc();
	const first = applyAddOnAssociationToDocument({
		doc: skipped,
		nodes: [sabores, turbine],
		links: linksWith([["int-sabores", ["g-sabores"]]]),
		createUnlinked: false,
	});
	assert.equal(first.created, 0);
	assert.equal(skipped.optionGroups.length, 1);

	const doc = makeDoc();
	let counter = 0;
	const { created } = applyAddOnAssociationToDocument({
		doc,
		nodes: [sabores, turbine],
		links: linksWith([["int-sabores", ["g-sabores"]]]),
		createUnlinked: true,
		newId: () => `novo-${++counter}`,
	});
	assert.equal(created, 1);
	const group = doc.optionGroups.find((candidate) => candidate.name === "Turbine seu pedido:");
	assert.ok(group);
	assert.equal(group.optionIds?.length, 2);
	const association = doc.products.find((product) => product.id === "base")?.optionGroups?.find((candidate) => candidate.id === group.id);
	assert.deepEqual({ min: association?.min, max: association?.max, index: association?.index }, { min: 0, max: 5, index: 1 });
	const granola = doc.options.find((option) => option.id === group.optionIds?.[0]);
	assert.equal(granola?.price?.value, 3);
	assert.equal(granola?.externalCode, "GRA");
	assert.equal(doc.options.find((option) => option.id === group.optionIds?.[1])?.status, "UNAVAILABLE");
	assert.ok(doc.products.some((product) => product.id === granola?.productId && product.name === "Granola"));
});

test("cópia aninhada num produto de opção não toma o lugar da cópia associada ao produto", () => {
	const doc = makeDoc();
	// O cookie (produto de opção da oferta) carrega outra cópia da oferta — como no cardápio real.
	doc.optionGroups.push({ id: "g-oferta-aninhada", name: "Leve mais cookie", status: "AVAILABLE", optionIds: [] });
	doc.products.find((product) => product.id === "p-cookie")?.optionGroups?.push({ id: "g-oferta-aninhada", min: 0, max: 2, index: 1 });
	const oferta: TAddOnGroupNode = { ...sabores, grupoId: "int-oferta", nome: "Leve mais cookie", minOpcoes: 0, maxOpcoes: 4, indice: 1 };
	applyAddOnAssociationToDocument({
		doc,
		nodes: [sabores, oferta],
		// A cópia aninhada vem PRIMEIRO na lista de vínculos (ordem de criação).
		links: linksWith([
			["int-sabores", ["g-sabores"]],
			["int-oferta", ["g-oferta-aninhada", "g-oferta"]],
		]),
		createUnlinked: false,
	});
	assert.deepEqual(
		doc.products.find((product) => product.id === "base")?.optionGroups?.map((association) => association.id),
		["g-sabores", "g-oferta"],
	);
});

test("item sem nenhuma cópia do grupo usa a cópia com mais opções vinculadas", () => {
	const doc = makeDoc();
	const optionLink = (group: string, n: number) => link({ tipo: "ADD_ON_OPCAO", externoOptionGroupId: group, externoOptionId: `${group}-${n}` });
	const links: TAddOnLinks = {
		groups: new Map([
			["int-sabores", [link({ produtoAddOnId: "int-sabores", externoOptionGroupId: "g-sabores" })]],
			// A parcial foi vinculada primeiro; a completa tem mais opções.
			["int-gelato", ["g-gelato-parcial", "g-gelato-completo"].map((id) => link({ produtoAddOnId: "int-gelato", externoOptionGroupId: id }))],
		]),
		options: new Map([
			["o1", [optionLink("g-gelato-parcial", 1), optionLink("g-gelato-completo", 1)]],
			["o2", [optionLink("g-gelato-completo", 2)]],
		]),
	};
	const gelato: TAddOnGroupNode = { ...sabores, grupoId: "int-gelato", nome: "Escolha seu gelato:", indice: 1 };
	applyAddOnAssociationToDocument({ doc, nodes: [sabores, gelato], links, createUnlinked: false });
	assert.deepEqual(
		doc.products.find((product) => product.id === "base")?.optionGroups?.map((association) => association.id),
		["g-sabores", "g-gelato-completo"],
	);
});
