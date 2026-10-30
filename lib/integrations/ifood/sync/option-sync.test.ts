import assert from "node:assert/strict";
import { mock, test } from "node:test";
import createHttpError from "http-errors";
import axios, { type AxiosInstance, type CreateAxiosDefaults } from "axios";
import type { TCatalogLinkEntity } from "@/services/drizzle/schema";
import { db } from "@/services/drizzle";
import { collectIfoodOptionStates, writeIfoodItemDocument, type TIfoodItemDocument } from "../item-document";
import {
	applyManagedOptionAvailability,
	effectiveOptionAvailability,
	effectiveOptionPrice,
	observeIfoodOption,
	verifyIfoodOptionStates,
	type TObservedIfoodOption,
} from "../option-state";
import {
	computeOptionDivergences,
	editedAddOnGroupIds,
	confirmedOptionSnapshot,
	findUnlinkedAvailableOptions,
	hasPotentialOptionDuplicate,
	shouldPushOptionAvailability,
} from "./option-sync";
import { assertCatalogPushComplete, catalogPushRetry, isRetryableIfoodError } from "./queue-policy";
import { pushAddOnGroupToLinkedMerchants, type TAddOnOptionNode } from "./add-ons";
import { IfoodItemFlatResponseSchema, IfoodOptionGroupsListResponseSchema, mapIfoodItemFlat, mapIfoodOptionGroupsList } from "../catalog-types";

const policy = { nome: true, preco: true, disponibilidade: true, descricao: false, imagem: false, complementos: false, criarOpcoes: false };
const option: TAddOnOptionNode = { opcaoId: "local", nome: "Ninho", codigo: null, precoDelta: 2, disponivel: false, indice: 0 };
function link(patch: Partial<TCatalogLinkEntity> = {}): TCatalogLinkEntity {
	return {
		id: "link",
		organizacaoId: "org",
		provider: "IFOOD",
		merchantId: "merchant",
		tipo: "ADD_ON_OPCAO",
		produtoId: null,
		produtoVarianteId: null,
		produtoAddOnId: "group",
		produtoAddOnOpcaoId: "local",
		grupoInterno: null,
		externoProdutoId: "p-ninho",
		externoItemId: null,
		externoCategoriaId: null,
		externoOptionGroupId: "remote-group",
		externoOptionId: "remote",
		externoItemContextoIds: [],
		sincronizar: policy,
		status: "SINCRONIZADO",
		ultimoSnapshot: { disponivel: false },
		divergencias: null,
		ultimoErro: null,
		dataUltimaSincronizacao: new Date(0),
		autorId: null,
		dataInsercao: new Date(0),
		dataAtualizacao: null,
		integracaoId: null,
		identidadeTipo: null,
		identidadeValor: null,
		protegido: false,
		...patch,
	};
}
const available: TObservedIfoodOption = { nome: "Ninho", preco: 2, disponivel: true };

test("shared groups edited from variants dispatch once; detaching a reference does not pause the shared group", () => {
	assert.deepEqual(editedAddOnGroupIds([{ id: "shared" }, { id: "shared" }, { id: "detached", deletar: true }, { id: null }, { id: "another" }]), [
		"shared",
		"another",
	]);
});
function doc(): TIfoodItemDocument {
	return {
		item: { id: "item", productId: "base", shifts: [{ startTime: "08:00" }] },
		products: [
			{ id: "base", name: "Gelato", optionGroups: [{ id: "g", min: 1, max: 3 }] },
			{ id: "p-ninho", name: "Ninho" },
		],
		optionGroups: [{ id: "g", optionIds: ["remote"] }],
		options: [
			{
				id: "remote",
				productId: "p-ninho",
				status: "AVAILABLE",
				price: { value: 1 },
				contextModifiers: [
					{ catalogContext: "DEFAULT", status: "AVAILABLE", price: { value: 2 }, externalCode: "POS" },
					{ catalogContext: "INDOOR", status: "AVAILABLE", price: { value: 3 } },
				],
			},
		],
	};
}

test("DEFAULT status overrides root, with root fallback only when the channel has no status", () => {
	assert.equal(effectiveOptionAvailability({ status: "AVAILABLE", contextModifiers: [{ catalogContext: "DEFAULT", status: "UNAVAILABLE" }] }), false);
	assert.equal(effectiveOptionAvailability({ status: "UNAVAILABLE", contextModifiers: [{ catalogContext: "DEFAULT", status: "AVAILABLE" }] }), true);
	assert.equal(effectiveOptionAvailability({ status: "AVAILABLE", contextModifiers: [{ catalogContext: "DEFAULT", status: null }] }), true);
	assert.equal(effectiveOptionAvailability({ status: "UNAVAILABLE", contextModifiers: [{ catalogContext: "INDOOR", status: "AVAILABLE" }] }), false);
	assert.equal(effectiveOptionAvailability({ status: null }), null);
	assert.equal(effectiveOptionAvailability({ status: "INVALID" }), null);
});

test("observations use option product names and channel prices, including zero", () => {
	const document = doc();
	assert.deepEqual(observeIfoodOption(document, document.options[0]), available);
	assert.equal(effectiveOptionPrice({ price: { value: 2 }, contextModifiers: [{ catalogContext: "DEFAULT", price: { value: 0 } }] }), 0);
});

test("deleted options with a false snapshot are paused in every available remote copy", () => {
	for (const copy of [link(), link({ id: "copy", externoOptionId: "other", ultimoSnapshot: { disponivel: true } })]) {
		assert.equal(shouldPushOptionAvailability({ link: copy, option: undefined, observed: available }), true);
	}
	assert.equal(shouldPushOptionAvailability({ link: link(), option: undefined }), true);
	assert.equal(shouldPushOptionAvailability({ link: link(), option: undefined, observed: { ...available, disponivel: false } }), false);
});

test("snapshot cannot suppress recorded availability drift if the remote read is unavailable", () => {
	const drift = link({ divergencias: [{ campo: "disponibilidade", valorInterno: false, valorExterno: true, sincronizado: true }] });
	assert.equal(shouldPushOptionAvailability({ link: drift, option }), true);
	assert.equal(shouldPushOptionAvailability({ link: link({ status: "ERRO" }), option }), true);
});

test("live options respect availability opt-out, but deletion still pauses", () => {
	const optedOut = link({ sincronizar: { ...policy, disponibilidade: false } });
	assert.equal(shouldPushOptionAvailability({ link: optedOut, option, observed: available }), false);
	assert.equal(computeOptionDivergences({ link: optedOut, option, observed: available })[0].sincronizado, false);
	assert.equal(computeOptionDivergences({ link: optedOut, option: undefined, observed: available })[0].sincronizado, true);
});

test("unknown availability is not confirmation and unrelated opt-out divergences remain visible", () => {
	const diffs = computeOptionDivergences({
		link: link({ sincronizar: { ...policy, preco: false } }),
		option,
		observed: { nome: "ninho", preco: 4, disponivel: null },
	});
	assert.deepEqual(
		diffs.map((d) => [d.campo, d.sincronizado]),
		[
			["preco", false],
			["disponibilidade", true],
		],
	);
});

test("availability repair does not claim an unsent name or price, and opt-out fields retain their snapshot", () => {
	const current = link({ ultimoSnapshot: { nome: "Nome enviado", preco: 4, disponivel: true } });
	assert.deepEqual(confirmedOptionSnapshot(current, option, true), { nome: "Nome enviado", preco: 4, disponivel: false });
	assert.deepEqual(confirmedOptionSnapshot({ ...current, sincronizar: { ...policy, nome: false, preco: false } }, option, false), {
		nome: "Nome enviado",
		preco: 4,
		disponivel: false,
	});
	assert.deepEqual(confirmedOptionSnapshot(current, undefined, false), { nome: "Nome enviado", preco: 4, disponivel: false });
});

test("an existing remote name or code blocks blind creation even when its link is missing", () => {
	const remote = [{ id: "remote", nome: "  NINHO ", codigoExterno: "sku", status: "UNAVAILABLE", produtoId: "p", preco: 0, indice: 0 }];
	assert.equal(hasPotentialOptionDuplicate({ nome: "Ninho", codigo: "" }, remote), true);
	assert.equal(hasPotentialOptionDuplicate({ nome: "Outro", codigo: "sku" }, remote), true);
	assert.equal(hasPotentialOptionDuplicate({ nome: "Novo", codigo: "" }, remote), false);
});

test("verification waits for propagation and reads only copies still pending", async () => {
	const requested: string[][] = [],
		delays: number[] = [];
	let attempt = 0;
	const confirmed = await verifyIfoodOptionStates({
		optionIds: new Set(["a", "b"]),
		delays: [0, 10, 20],
		wait: async (ms) => {
			delays.push(ms);
		},
		read: async (ids) => {
			requested.push([...ids]);
			attempt++;
			return new Map([
				["a", { ...available, disponivel: false }],
				["b", { ...available, disponivel: attempt >= 2 ? false : true }],
			]);
		},
		matches: (_, observed) => observed.disponivel === false,
	});
	assert.equal(confirmed.size, 2);
	assert.deepEqual(requested, [["a", "b"], ["b"]]);
	assert.deepEqual(delays, [10]);
});

test("persistent mismatch and missing options never enter the confirmed result", async () => {
	const confirmed = await verifyIfoodOptionStates({
		optionIds: new Set(["stale", "missing"]),
		delays: [0, 0, 0],
		read: async () => new Map([["stale", available]]),
		matches: (_, observed) => observed.disponivel === false,
	});
	assert.equal(confirmed.size, 0);
});

test("stale full-item writes cannot restore deleted options and preserve every unrelated field", () => {
	const document = doc();
	const before = structuredClone(document);
	document.options.push({ id: "unmanaged", productId: "p-unknown", status: "AVAILABLE", price: { value: 5 } });
	applyManagedOptionAvailability(document, new Map([["remote", { disponivel: false, excluida: true }]]));
	assert.equal(document.options[0].status, "UNAVAILABLE");
	assert.ok(document.options[0].contextModifiers?.every((c) => c.status === "UNAVAILABLE"));
	assert.deepEqual(document.item, before.item);
	assert.deepEqual(document.products, before.products);
	assert.deepEqual(document.optionGroups, before.optionGroups);
	assert.deepEqual(document.options[0].price, before.options[0].price);
	assert.deepEqual(
		document.options[0].contextModifiers?.map((c) => ({ price: c.price, code: c.externalCode })),
		before.options[0].contextModifiers?.map((c) => ({ price: c.price, code: c.externalCode })),
	);
	assert.equal(document.options[1].status, "AVAILABLE");
});

test("live managed options preserve other channel overrides and add DEFAULT when absent", () => {
	const document = doc();
	applyManagedOptionAvailability(document, new Map([["remote", { disponivel: false, excluida: false }]]));
	assert.equal(document.options[0].contextModifiers?.find((c) => c.catalogContext === "INDOOR")?.status, "AVAILABLE");
	document.options[0].contextModifiers = [{ catalogContext: "INDOOR", price: { value: 8 }, status: "UNAVAILABLE" }];
	applyManagedOptionAvailability(document, new Map([["remote", { disponivel: true, excluida: false }]]));
	assert.equal(effectiveOptionAvailability(document.options[0]), true);
	assert.equal(document.options[0].contextModifiers[0].status, "UNAVAILABLE");
});

test("option state collection reuses the first representative instead of reading all products", async () => {
	const read: string[] = [];
	const client = {
		get: async (url: string) => {
			read.push(url);
			return { data: doc() };
		},
	} as unknown as AxiosInstance;
	const states = await collectIfoodOptionStates(client, "merchant", ["item", "another"], new Set(["remote"]));
	assert.deepEqual(states.get("remote"), available);
	assert.equal(read.length, 1);
});

test("collector can find an option in an unlinked catalog item", async () => {
	const paths: string[] = [];
	const client = {
		get: async (url: string) => {
			paths.push(url);
			if (url.endsWith("/catalogs")) return { data: [{ id: "catalog", context: ["DEFAULT"], status: "AVAILABLE" }] };
			if (url.endsWith("/categories")) return { data: [{ id: "category", name: "Gelato", items: [{ id: "item" }] }] };
			return { data: doc() };
		},
	} as unknown as AxiosInstance;
	const states = await collectIfoodOptionStates(client, "merchant", [], new Set(["remote"]));
	assert.equal(states.get("remote")?.disponivel, true);
	assert.equal(paths.length, 3);
});

test("missing mapping diagnostics include active duplicates but exclude options linked to another local group", () => {
	const options = [
		{ id: "linked-other-group", nome: "Ninho" },
		{ id: "duplicate", nome: "Ninho" },
		{ id: "paused", nome: "Bombom" },
		{ id: "unknown", nome: "Unknown" },
	];
	const observed = new Map([
		["linked-other-group", available],
		["duplicate", available],
		["paused", { ...available, disponivel: false }],
	]);
	assert.deepEqual(findUnlinkedAvailableOptions(options, new Set(["linked-other-group"]), observed), [options[1]]);
});

test("partial failures reach bounded queue retries; permanent errors remain recorded without redelivery", () => {
	assert.throws(() => assertCatalogPushComplete({ erros: 2, errosRetentaveis: 1 }), /precisam de sincronização/);
	assert.doesNotThrow(() => assertCatalogPushComplete({ erros: 2, errosRetentaveis: 0 }));
	assert.doesNotThrow(() => assertCatalogPushComplete({ erros: 0 }));
	assert.throws(() => assertCatalogPushComplete({ erros: 1 }));
	assert.deepEqual(catalogPushRetry(new Error("timeout"), 1), { afterSeconds: 30 });
	assert.deepEqual(catalogPushRetry(new Error("timeout"), 3), { acknowledge: true });
	assert.deepEqual(catalogPushRetry(new createHttpError.BadRequest("invalid"), 1), { acknowledge: true });
	assert.equal(isRetryableIfoodError(new createHttpError.TooManyRequests()), true);
	assert.equal(isRetryableIfoodError(new createHttpError.BadGateway()), true);
	assert.equal(isRetryableIfoodError(new createHttpError.NotFound()), false);
});

test("real full-item writer applies local deletion safety before PUT and confirms a fresh read", async () => {
	const findLinks = mock.method(db.query.catalogLinks, "findMany", async () => [
		{ ...link(), produtoAddOnOpcao: { id: "local", organizacaoId: "org", ativo: false, dataExclusao: new Date() } },
	]);
	const findChannel = mock.method(db.query.salesChannels, "findFirst", async () => undefined);
	let sent: TIfoodItemDocument | undefined;
	let reads = 0;
	const client = {
		put: async (_: string, document: TIfoodItemDocument) => {
			sent = structuredClone(document);
		},
		get: async () => {
			reads++;
			return { data: sent };
		},
	} as unknown as AxiosInstance;
	try {
		await writeIfoodItemDocument(client, "merchant", doc());
		assert.equal(sent?.options[0].status, "UNAVAILABLE");
		assert.equal(effectiveOptionAvailability(sent!.options[0]), false);
		assert.equal(reads, 1);
	} finally {
		findLinks.mock.restore();
		findChannel.mock.restore();
	}
});

test("both catalog read DTOs expose DEFAULT availability rather than a misleading root status", () => {
	const raw = { ...doc().options[0], contextModifiers: [{ catalogContext: "DEFAULT", status: "UNAVAILABLE", price: { value: 0 } }] };
	const groups = mapIfoodOptionGroupsList(IfoodOptionGroupsListResponseSchema.parse([{ id: "g", options: [{ ...raw, name: "Ninho" }] }]));
	assert.equal(groups[0].opcoes[0].status, "UNAVAILABLE");
	assert.equal(groups[0].opcoes[0].preco, 0);
	const flat = mapIfoodItemFlat(IfoodItemFlatResponseSchema.parse({ ...doc(), options: [raw] }));
	assert.equal(flat.gruposComplementos[0].opcoes[0].status, "UNAVAILABLE");
	assert.equal(flat.gruposComplementos[0].opcoes[0].preco, 0);
});

test("a failed observation is retried and never mistaken for confirmation", async () => {
	let reads = 0;
	const confirmed = await verifyIfoodOptionStates({
		optionIds: new Set(["remote"]),
		delays: [0, 0],
		read: async () => {
			if (++reads === 1) throw new Error("read timeout");
			return new Map([["remote", { ...available, disponivel: false }]]);
		},
		matches: (_, state) => state.disponivel === false,
	});
	assert.equal(reads, 2);
	assert.equal(confirmed.size, 1);
});

for (const failSecondCopy of [false, true]) {
	test(`full add-on push ${failSecondCopy ? "preserves a failed copy for retry" : "pauses every deleted copy despite false snapshots and is idempotent"}`, async () => {
		const rows = [link(), link({ id: "copy", externoOptionId: "other" })];
		const document = doc();
		document.options.push({ ...structuredClone(document.options[0]), id: "other" });
		document.optionGroups[0].optionIds?.push("other");
		let linkReads = 0;
		const writes: { status?: string; ultimoSnapshot?: { disponivel?: boolean } }[] = [];
		const patches: string[] = [];
		const mocks: { mock: { restore(): void } }[] = [
			mock.method(db.query.catalogLinks, "findMany", async () => (++linkReads % 2 === 1 ? rows : [{ externoItemId: "item" }])),
			mock.method(db.query.salesChannels, "findFirst", async () => undefined),
			mock.method(db.query.productAddOns, "findFirst", async () => ({
				id: "group",
				nome: "Gelato",
				ativo: true,
				minOpcoes: 1,
				maxOpcoes: 2,
				opcoes: [],
			})),
			mock.method(db, "select", () => ({
				from: () => ({
					where: () => ({
						orderBy: async () => [
							{
								id: "integration",
								organizacaoId: "org",
								tipo: "IFOOD",
								ativo: true,
								configuracao: {
									tipo: "IFOOD",
									merchantIds: ["merchant"],
									accessToken: "test-token",
									refreshToken: "test-refresh",
									tokenType: "bearer",
									scope: [],
									expiresAt: "2060-01-01T00:00:00.000Z",
								},
							},
						],
					}),
				}),
			})),
			mock.method(db, "update", () => ({
				set: (values: (typeof writes)[number]) => {
					writes.push(values);
					return { where: async () => [] };
				},
			})),
		];
		const originalCreate = axios.create.bind(axios);
		mocks.push(
			mock.method(axios, "create", (config?: CreateAxiosDefaults) =>
				originalCreate({
					...config,
					adapter: async (request) => {
						if (request.method === "patch") {
							const payload = JSON.parse(request.data);
							patches.push(payload.optionId);
							if (failSecondCopy && payload.optionId === "other") throw new createHttpError.GatewayTimeout("Timeout da cópia.");
							const remote = document.options.find((option) => option.id === payload.optionId)!;
							remote.status = payload.status;
							remote.contextModifiers = remote.contextModifiers?.map((c) => ({ ...c, status: payload.status }));
						}
						return { data: structuredClone(document), status: 200, statusText: "OK", headers: {}, config: request };
					},
				}),
			),
		);
		try {
			const result = await pushAddOnGroupToLinkedMerchants({ orgId: "org", produtoAddOnId: "group" });
			assert.deepEqual(patches, ["remote", "other"]);
			assert.equal(result.erros, failSecondCopy ? 1 : 0);
			assert.equal(result.errosRetentaveis, failSecondCopy ? 1 : 0);
			assert.equal(writes.filter((w) => w.status === "SINCRONIZADO").length, failSecondCopy ? 1 : 2);
			assert.ok(writes.filter((w) => w.status === "SINCRONIZADO").every((w) => w.ultimoSnapshot?.disponivel === false));
			if (failSecondCopy) {
				assert.equal(writes.filter((w) => w.status === "ERRO").length, 1);
				assert.throws(() => assertCatalogPushComplete(result));
			} else {
				assert.equal((await pushAddOnGroupToLinkedMerchants({ orgId: "org", produtoAddOnId: "group" })).erros, 0);
				assert.equal(patches.length, 2);
			}
		} finally {
			for (const mocked of mocks) mocked.mock.restore();
		}
	});
}
