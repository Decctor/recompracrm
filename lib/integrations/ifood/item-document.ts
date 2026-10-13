import type { TIfoodCatalogStatusEnum } from "@/schemas/enums";
import type { AxiosInstance } from "axios";
import createHttpError from "http-errors";
import { getIfoodCatalogs, listIfoodCategories } from "./catalog";
import { IFOOD_CATALOG_BASE_URL } from "./catalog-types";
import { mapIfoodError } from "./errors";
import { effectiveOptionPrice, observeIfoodOption, verifyIfoodOptionStates, type TObservedIfoodOption } from "./option-state";
export { effectiveOptionPrice, effectiveOptionAvailability } from "./option-state";

/**
 * O item do iFood como documento: `GET /items/{id}/flat` devolve exatamente o shape que `PUT /items`
 * aceita (`FullItemDto`: item + products + optionGroups + options). Ler, mudar só o necessário e
 * reenviar ("ida-e-volta") é o único caminho seguro para o que mora no item inteiro — associação
 * produto → grupos (min/max/ordem) e status de grupo —, porque o PUT reescreve tudo e qualquer campo
 * omitido some (agenda, preço por canal das opções, peso, porção). Validado ao vivo em 2026-09-30.
 *
 * Os tipos são deliberadamente abertos (`passthrough`): o documento precisa voltar com os campos
 * que não conhecemos, então nada aqui pode ser descartado por um parse estrito.
 */

type TOpen = Record<string, unknown>;

export type TIfoodDocumentPrice = { value?: number | null } & TOpen;
export type TIfoodDocumentContextModifier = { catalogContext?: string | null; status?: string | null; price?: TIfoodDocumentPrice | null } & TOpen;
export type TIfoodDocumentAssociation = { id: string; min: number; max: number; index?: number | null } & TOpen;
export type TIfoodDocumentProduct = {
	id: string;
	name?: string | null;
	description?: string | null;
	imagePath?: string | null;
	optionGroups?: TIfoodDocumentAssociation[] | null;
} & TOpen;
export type TIfoodDocumentOptionGroup = {
	id: string;
	name?: string | null;
	status?: string | null;
	optionGroupType?: string | null;
	optionIds?: string[] | null;
} & TOpen;
export type TIfoodDocumentOption = {
	id: string;
	productId: string;
	status?: string | null;
	price?: TIfoodDocumentPrice | null;
	contextModifiers?: TIfoodDocumentContextModifier[] | null;
} & TOpen;
export type TIfoodItemDocument = {
	item: { id: string; productId: string; status?: string | null; categoryId?: string | null } & TOpen;
	products: TIfoodDocumentProduct[];
	optionGroups: TIfoodDocumentOptionGroup[];
	options: TIfoodDocumentOption[];
} & TOpen;

function itemsUrl(merchantId: string, path = "") {
	return `${IFOOD_CATALOG_BASE_URL}/merchants/${merchantId}/items${path}`;
}

export async function readIfoodItemDocument(client: AxiosInstance, merchantId: string, itemId: string): Promise<TIfoodItemDocument> {
	try {
		const response = await client.get<TIfoodItemDocument>(itemsUrl(merchantId, `/${itemId}/flat`));
		const doc = response.data;
		if (!doc?.item?.id || !Array.isArray(doc.products)) throw new Error("Resposta do iFood sem o item completo.");
		return { ...doc, optionGroups: doc.optionGroups ?? [], options: doc.options ?? [] };
	} catch (error) {
		mapIfoodError("readIfoodItemDocument", error);
	}
}

export async function writeIfoodItemDocument(client: AxiosInstance, merchantId: string, doc: TIfoodItemDocument): Promise<void> {
	try {
		const { protectManagedOptionAvailability } = await import("./sync/document-availability");
		const desired = await protectManagedOptionAvailability(merchantId, doc);
		await client.put(itemsUrl(merchantId), doc);
		if (desired.size) {
			const confirmed = await verifyIfoodOptionStates({
				optionIds: new Set(desired.keys()),
				read: async () => {
					const observed = await readIfoodItemDocument(client, merchantId, doc.item.id);
					return new Map(observed.options.map((option) => [option.id, observeIfoodOption(observed, option)]));
				},
				matches: (id, observed) => observed.disponivel === desired.get(id)?.disponivel,
			});
			if (confirmed.size !== desired.size)
				throw new createHttpError.BadGateway("O iFood ainda não confirmou a disponibilidade dos adicionais após salvar o item.");
		}
	} catch (error) {
		mapIfoodError("writeIfoodItemDocument", error);
	}
}

/** O produto que o item vende — dono da associação com os grupos (os demais são produtos de opção). */
export function baseProductOf(doc: TIfoodItemDocument) {
	const product = doc.products.find((candidate) => candidate.id === doc.item.productId);
	if (!product) throw new Error("O item do iFood não trouxe o produto base.");
	return product;
}

/**
 * Um item que carrega o grupo — para operações de grupo que só existem pela ida-e-volta. Tenta os
 * itens preferidos primeiro (os vinculados, que já sabemos onde estão) e só então varre o cardápio.
 */
export async function findIfoodItemWithOptionGroup(
	client: AxiosInstance,
	merchantId: string,
	optionGroupId: string,
	preferredItemIds: string[] = [],
): Promise<TIfoodItemDocument | null> {
	const tried = new Set<string>();
	for (const itemId of preferredItemIds) {
		if (tried.has(itemId)) continue;
		tried.add(itemId);
		const doc = await readIfoodItemDocument(client, merchantId, itemId).catch(() => null);
		if (doc?.optionGroups.some((group) => group.id === optionGroupId)) return doc;
	}
	for (const catalog of await getIfoodCatalogs(client, merchantId)) {
		for (const category of await listIfoodCategories(client, merchantId, { catalogId: catalog.id })) {
			for (const item of category.itens) {
				if (!item.id || tried.has(item.id)) continue;
				tried.add(item.id);
				const doc = await readIfoodItemDocument(client, merchantId, item.id).catch(() => null);
				if (doc?.optionGroups.some((group) => group.id === optionGroupId)) return doc;
			}
		}
	}
	return null;
}

/**
 * Pausa/reativa um grupo inteiro. `PATCH /optionGroups/status` não existe (404) e `PATCH
 * /optionGroups/{id}` ignora `status`; o que funciona é o status do grupo no documento de qualquer
 * item que o carregue — o grupo é da loja, então vale para todos os itens que o usam.
 */
export async function setIfoodOptionGroupStatus(
	client: AxiosInstance,
	merchantId: string,
	{ optionGroupId, status, preferredItemIds }: { optionGroupId: string; status: TIfoodCatalogStatusEnum; preferredItemIds?: string[] },
): Promise<void> {
	const doc = await findIfoodItemWithOptionGroup(client, merchantId, optionGroupId, preferredItemIds);
	if (!doc) throw new createHttpError.NotFound("Nenhum item do iFood usa este grupo de complementos; não há como mudar o status dele.");
	const group = doc.optionGroups.find((candidate) => candidate.id === optionGroupId);
	if (!group || group.status === status) return;
	group.status = status;
	await writeIfoodItemDocument(client, merchantId, doc);
}

/**
 * Preço efetivo de cada opção presente nos itens dados. A listagem de grupos (`GET /optionGroups`)
 * só traz o preço raiz, que o Portal deixa em 0 quando grava o preço no canal — comparar com ele
 * acusaria divergência em toda opção paga. Item que falhar na leitura é ignorado (a opção cai no
 * preço da listagem).
 */
export async function collectEffectiveOptionPrices(client: AxiosInstance, merchantId: string, itemIds: string[]) {
	const prices = new Map<string, number | null>();
	for (const itemId of new Set(itemIds)) {
		const doc = await readIfoodItemDocument(client, merchantId, itemId).catch(() => null);
		for (const option of doc?.options ?? []) if (!prices.has(option.id)) prices.set(option.id, effectiveOptionPrice(option));
	}
	return prices;
}

/** Uma leitura por grupo costuma cobrir todas as cópias; só varre outros itens se faltarem ids. */
export async function collectIfoodOptionStates(client: AxiosInstance, merchantId: string, itemIds: string[], optionIds: ReadonlySet<string>) {
	const states = new Map<string, TObservedIfoodOption>();
	const visited = new Set<string>();
	async function read(itemId: string) {
		if (visited.has(itemId) || states.size === optionIds.size) return;
		visited.add(itemId);
		const doc = await readIfoodItemDocument(client, merchantId, itemId).catch(() => null);
		for (const option of doc?.options ?? []) {
			if (optionIds.has(option.id)) states.set(option.id, observeIfoodOption(doc!, option));
		}
	}
	for (const itemId of itemIds) await read(itemId);
	if (states.size < optionIds.size) {
		for (const catalog of await getIfoodCatalogs(client, merchantId)) {
			if (states.size === optionIds.size) break;
			for (const category of await listIfoodCategories(client, merchantId, { catalogId: catalog.id })) {
				for (const item of category.itens) if (item.id) await read(item.id);
			}
		}
	}
	return states;
}
