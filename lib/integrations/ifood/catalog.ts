import type { TIfoodCatalogContextEnum, TIfoodCatalogStatusEnum } from "@/schemas/enums";
import type { AxiosInstance } from "axios";
import createHttpError from "http-errors";
import { mapIfoodError } from "./errors";
import {
	IFOOD_CATALOG_BASE_URL,
	IfoodBatchResponseSchema,
	IfoodCatalogVersionResponseSchema,
	IfoodCatalogsListResponseSchema,
	IfoodCategoriesListResponseSchema,
	IfoodCategoryDetailResponseSchema,
	IfoodItemFlatResponseSchema,
	IfoodOptionGroupsListResponseSchema,
	IfoodProductDetailResponseSchema,
	IfoodProductsListResponseSchema,
	mapIfoodBatch,
	mapIfoodCatalog,
	mapIfoodCatalogVersion,
	mapIfoodCategory,
	mapIfoodItemFlat,
	mapIfoodOptionGroupsList,
	mapIfoodProduct,
	mapIfoodProductsPage,
	type TIfoodBatchDTO,
	type TIfoodCatalogDTO,
	type TIfoodCatalogVersion,
	type TIfoodCategoryDTO,
	type TIfoodItemFlatDTO,
	type TIfoodOptionGroupDTO,
	type TIfoodProductsPageDTO,
} from "./catalog-types";

/**
 * Funções de LEITURA da Catalog API v2.0 do iFood. Todas recebem o axios client autenticado e o
 * merchantId (já validado pelo `resolveIfoodManagementContext`) e retornam DTOs mapeados.
 */

function catalogUrl(merchantId: string, path: string) {
	return `${IFOOD_CATALOG_BASE_URL}/merchants/${merchantId}${path}`;
}

export async function getIfoodCatalogs(client: AxiosInstance, merchantId: string): Promise<TIfoodCatalogDTO[]> {
	try {
		const response = await client.get<unknown>(catalogUrl(merchantId, "/catalogs"));
		return IfoodCatalogsListResponseSchema.parse(response.data)
			.map(mapIfoodCatalog)
			.filter((catalog): catalog is TIfoodCatalogDTO => !!catalog);
	} catch (error) {
		mapIfoodError("getIfoodCatalogs", error);
	}
}

export async function getIfoodCatalogVersion(client: AxiosInstance, merchantId: string): Promise<TIfoodCatalogVersion> {
	try {
		const response = await client.get<unknown>(catalogUrl(merchantId, "/catalog/version"));
		return mapIfoodCatalogVersion(IfoodCatalogVersionResponseSchema.parse(response.data));
	} catch (error) {
		mapIfoodError("getIfoodCatalogVersion", error);
	}
}

export async function upgradeIfoodCatalogVersion(client: AxiosInstance, merchantId: string): Promise<void> {
	try {
		await client.post(catalogUrl(merchantId, "/version/upgrade"));
	} catch (error) {
		mapIfoodError("upgradeIfoodCatalogVersion", error);
	}
}

export async function listIfoodCategories(
	client: AxiosInstance,
	merchantId: string,
	{ catalogId }: { catalogId: string },
): Promise<TIfoodCategoryDTO[]> {
	try {
		const response = await client.get<unknown>(catalogUrl(merchantId, `/catalogs/${catalogId}/categories`), {
			params: { includeItems: true },
		});
		return IfoodCategoriesListResponseSchema.parse(response.data)
			.map(mapIfoodCategory)
			.filter((category): category is TIfoodCategoryDTO => !!category);
	} catch (error) {
		mapIfoodError("listIfoodCategories", error);
	}
}

export async function listIfoodProducts(
	client: AxiosInstance,
	merchantId: string,
	{ page, limit }: { page: number; limit: number },
): Promise<TIfoodProductsPageDTO> {
	try {
		const response = await client.get<unknown>(catalogUrl(merchantId, "/products"), {
			params: { page, limit },
		});
		return mapIfoodProductsPage(IfoodProductsListResponseSchema.parse(response.data));
	} catch (error) {
		mapIfoodError("listIfoodProducts", error);
	}
}

export async function listIfoodOptionGroups(
	client: AxiosInstance,
	merchantId: string,
	{ page, limit }: { page: number; limit: number },
): Promise<TIfoodOptionGroupDTO[]> {
	try {
		const response = await client.get<unknown>(catalogUrl(merchantId, "/optionGroups"), {
			params: { page, limit, includeOptions: true },
		});
		return mapIfoodOptionGroupsList(IfoodOptionGroupsListResponseSchema.parse(response.data));
	} catch (error) {
		mapIfoodError("listIfoodOptionGroups", error);
	}
}

/**
 * Um grupo de complementos pelo id. `GET /optionGroups/{id}` NÃO existe no iFood (404 "no Route
 * matched", medido em 2026-09-30), então a leitura é pela listagem paginada. Atenção: a listagem
 * traz o preço RAIZ das opções; o efetivo pode estar no canal (ver `effectiveOptionPrice`).
 */
export async function getIfoodOptionGroup(client: AxiosInstance, merchantId: string, optionGroupId: string): Promise<TIfoodOptionGroupDTO> {
	const limit = 100;
	for (let page = 1; page <= 50; page += 1) {
		const batch = await listIfoodOptionGroups(client, merchantId, { page, limit });
		const found = batch.find((group) => group.id === optionGroupId);
		if (found) return found;
		if (batch.length < limit) break;
	}
	throw new createHttpError.NotFound("Grupo de complementos do iFood não encontrado.");
}

/**
 * GET /items/{itemId}/flat — item com produto, grupos de complementos e opções resolvidos. É a
 * única leitura que traz os complementos: a listagem por categoria devolve o item sem eles.
 */
export async function getIfoodItemFlat(client: AxiosInstance, merchantId: string, itemId: string): Promise<TIfoodItemFlatDTO> {
	try {
		const response = await client.get<unknown>(catalogUrl(merchantId, `/items/${itemId}/flat`));
		return mapIfoodItemFlat(IfoodItemFlatResponseSchema.parse(response.data));
	} catch (error) {
		mapIfoodError("getIfoodItemFlat", error);
	}
}

export async function getIfoodBatch(client: AxiosInstance, merchantId: string, batchId: string): Promise<TIfoodBatchDTO> {
	try {
		const response = await client.get<unknown>(catalogUrl(merchantId, `/batch/${batchId}`));
		return mapIfoodBatch(IfoodBatchResponseSchema.parse(response.data));
	} catch (error) {
		mapIfoodError("getIfoodBatch", error);
	}
}

// ---------------------------------------------------------------------------
// Escritas — categorias
// ---------------------------------------------------------------------------

export type TIfoodCategoryWritePayload = {
	nome: string;
	codigoExterno?: string | null;
	status?: TIfoodCatalogStatusEnum | null;
	indice?: number | null;
	template?: string | null;
};

function toIfoodCategoryBody(payload: TIfoodCategoryWritePayload) {
	return {
		name: payload.nome,
		externalCode: payload.codigoExterno ?? undefined,
		status: payload.status ?? "AVAILABLE",
		index: payload.indice ?? undefined,
		template: payload.template ?? "DEFAULT",
	};
}

export async function createIfoodCategory(
	client: AxiosInstance,
	merchantId: string,
	{ catalogId, categoria }: { catalogId: string; categoria: TIfoodCategoryWritePayload },
) {
	try {
		const response = await client.post<unknown>(catalogUrl(merchantId, `/catalogs/${catalogId}/categories`), toIfoodCategoryBody(categoria));
		return mapIfoodCategory(IfoodCategoryDetailResponseSchema.parse(response.data));
	} catch (error) {
		mapIfoodError("createIfoodCategory", error);
	}
}

export async function updateIfoodCategory(
	client: AxiosInstance,
	merchantId: string,
	{ catalogId, categoryId, categoria }: { catalogId: string; categoryId: string; categoria: TIfoodCategoryWritePayload },
) {
	try {
		const response = await client.patch<unknown>(
			catalogUrl(merchantId, `/catalogs/${catalogId}/categories/${categoryId}`),
			toIfoodCategoryBody(categoria),
		);
		return mapIfoodCategory(IfoodCategoryDetailResponseSchema.parse(response.data));
	} catch (error) {
		mapIfoodError("updateIfoodCategory", error);
	}
}

export async function deleteIfoodCategory(client: AxiosInstance, merchantId: string, categoryId: string): Promise<void> {
	try {
		await client.delete(catalogUrl(merchantId, `/categories/${categoryId}`));
	} catch (error) {
		mapIfoodError("deleteIfoodCategory", error);
	}
}

// ---------------------------------------------------------------------------
// Escritas — produtos + lotes de preço/status
// ---------------------------------------------------------------------------

/** Porção declarada do produto. `NOT_APPLICABLE` é o neutro para quem não serve por pessoas. */
export type TIfoodProductServing = "NOT_APPLICABLE" | "SERVES_1" | "SERVES_2" | "SERVES_3" | "SERVES_4";

export type TIfoodProductWritePayload = {
	nome: string;
	descricao?: string | null;
	codigoExterno?: string | null;
	imagemPath?: string | null;
	serving?: TIfoodProductServing | null;
};

/**
 * `serving` é OBRIGATÓRIO no `PUT /products/{id}`, apesar de ausente na documentação: sem ele a
 * API responde 400 `PutProductDto.serving must be one of...`. Enviamos `NOT_APPLICABLE` quando o
 * chamador não declara.
 *
 * `shifts` NÃO é enviado de propósito: o PUT reescreve o produto inteiro, e mandar lista vazia
 * apagaria a agenda de disponibilidade que o lojista configurou no Portal.
 */
function toIfoodProductBody(payload: TIfoodProductWritePayload) {
	return {
		name: payload.nome,
		description: payload.descricao ?? undefined,
		externalCode: payload.codigoExterno ?? undefined,
		image: payload.imagemPath ?? undefined,
		serving: payload.serving ?? "NOT_APPLICABLE",
	};
}

export async function createIfoodProduct(client: AxiosInstance, merchantId: string, produto: TIfoodProductWritePayload) {
	try {
		const response = await client.post<unknown>(catalogUrl(merchantId, "/products"), toIfoodProductBody(produto));
		return mapIfoodProduct(IfoodProductDetailResponseSchema.parse(response.data));
	} catch (error) {
		mapIfoodError("createIfoodProduct", error);
	}
}

export type TIfoodProductPatchPayload = {
	nome?: string | null;
	descricao?: string | null;
	codigoExterno?: string | null;
	imagemPath?: string | null;
	serving?: TIfoodProductServing | null;
};

/**
 * `PATCH /products/{id}` — merge: só os campos enviados mudam. Validado ao vivo (2026-09-30) para
 * `name`, `description` e `imagePath` (o campo `image` é IGNORADO aqui). NÃO use `PUT`: ele
 * reescreve o produto e apaga a foto, zera o peso e volta a porção para NOT_APPLICABLE.
 *
 * Campo vazio não é enviado: um produto sem descrição ou sem foto no cadastro interno não apaga o
 * que o iFood já tem. `externalCode` via PATCH não foi exercitado ao vivo.
 */
export async function updateIfoodProduct(client: AxiosInstance, merchantId: string, productId: string, produto: TIfoodProductPatchPayload) {
	const body: Record<string, unknown> = {};
	if (produto.nome) body.name = produto.nome;
	if (produto.descricao) body.description = produto.descricao;
	if (produto.codigoExterno) body.externalCode = produto.codigoExterno;
	if (produto.imagemPath) body.imagePath = produto.imagemPath;
	if (produto.serving) body.serving = produto.serving;
	if (Object.keys(body).length === 0) return null;
	try {
		const response = await client.patch<unknown>(catalogUrl(merchantId, `/products/${productId}`), body);
		return mapIfoodProduct(IfoodProductDetailResponseSchema.parse({ id: productId, ...(response.data as object) }));
	} catch (error) {
		mapIfoodError("updateIfoodProduct", error);
	}
}

export async function deleteIfoodProduct(client: AxiosInstance, merchantId: string, productId: string): Promise<void> {
	try {
		await client.delete(catalogUrl(merchantId, `/products/${productId}`));
	} catch (error) {
		mapIfoodError("deleteIfoodProduct", error);
	}
}

/**
 * `resources` diz ao iFood o que o `externalCode` endereça: o item vendável, o complemento, ou
 * ambos. Sem ele o lote não sabe onde aplicar a mudança — era o campo que faltava no nosso payload.
 */
export type TIfoodBatchResource = "ITEM" | "OPTION";

export type TIfoodBatchPriceEntry = {
	externalCode: string;
	price: { value: number; originalValue?: number | null };
	resources?: TIfoodBatchResource[];
	catalogContext?: TIfoodCatalogContextEnum | null;
};

export type TIfoodBatchStatusEntry = {
	externalCode: string;
	status: TIfoodCatalogStatusEnum;
	resources?: TIfoodBatchResource[];
	catalogContext?: TIfoodCatalogContextEnum | null;
};

export async function batchUpdateIfoodProductsPrice(
	client: AxiosInstance,
	merchantId: string,
	itens: TIfoodBatchPriceEntry[],
): Promise<TIfoodBatchDTO> {
	try {
		const response = await client.patch<unknown>(
			catalogUrl(merchantId, "/products/price"),
			itens.map((item) => ({
				externalCode: item.externalCode,
				price: { value: item.price.value, originalValue: item.price.originalValue ?? undefined },
				resources: item.resources ?? ["ITEM"],
				catalogContext: item.catalogContext ?? undefined,
			})),
		);
		return mapIfoodBatch(IfoodBatchResponseSchema.parse(response.data));
	} catch (error) {
		mapIfoodError("batchUpdateIfoodProductsPrice", error);
	}
}

export async function batchUpdateIfoodProductsStatus(
	client: AxiosInstance,
	merchantId: string,
	itens: TIfoodBatchStatusEntry[],
): Promise<TIfoodBatchDTO> {
	try {
		const response = await client.patch<unknown>(
			catalogUrl(merchantId, "/products/status"),
			itens.map((item) => ({
				externalCode: item.externalCode,
				status: item.status,
				resources: item.resources ?? ["ITEM"],
				catalogContext: item.catalogContext ?? undefined,
			})),
		);
		return mapIfoodBatch(IfoodBatchResponseSchema.parse(response.data));
	} catch (error) {
		mapIfoodError("batchUpdateIfoodProductsStatus", error);
	}
}
