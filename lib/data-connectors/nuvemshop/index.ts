import axios, { isAxiosError, type AxiosInstance } from "axios";
import type { TCanonicalImportWindow } from "../types";
import { toCanonicalNuvemshopImportBatch } from "./mappers";
import {
	NuvemshopConfigSchema,
	NuvemshopOrdersOutputSchema,
	NuvemshopProductsOutputSchema,
	type TNuvemshopConfig,
	type TNuvemshopOrder,
	type TNuvemshopProduct,
} from "./types";

const NUVEMSHOP_API_URL = "https://api.nuvemshop.com.br";
const NUVEMSHOP_ORDERS_PER_PAGE = 200;
const NUVEMSHOP_PRODUCTS_PER_PAGE = 200;
const NUVEMSHOP_MAX_PAGES_PER_WINDOW = 50;
const NUVEMSHOP_MAX_PRODUCT_PAGES = 500;

function getUserAgent() {
	const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://recompracrm.com";
	return `RecompraCRM (${appUrl})`;
}

function createNuvemshopClient(config: TNuvemshopConfig) {
	return axios.create({
		baseURL: `${NUVEMSHOP_API_URL}/v1/${config.storeId}`,
		headers: {
			Authentication: `bearer ${config.accessToken}`,
			"User-Agent": getUserAgent(),
			"Content-Type": "application/json",
		},
		timeout: 30000,
	});
}

function getRetryAfterMs(value: string | undefined) {
	if (!value) return null;
	const seconds = Number(value);
	if (!Number.isFinite(seconds)) return null;
	return seconds * 1000;
}

function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A Nuvem Shop responde 404 `{ description: "Last page is N" }` quando a página pedida passa da
 * última — inclusive `"Last page is 0"` para uma janela sem nenhum pedido. É resultado vazio, não
 * falha: tratado como erro, marcava a integração como ERRO a cada rodada do cron numa loja sem
 * pedidos no dia.
 */
export function isNuvemshopPastLastPageError(error: unknown) {
	if (!isAxiosError(error) || error.response?.status !== 404) return false;
	const description = (error.response.data as { description?: unknown } | undefined)?.description;
	return typeof description === "string" && /^Last page is \d+$/.test(description.trim());
}

async function getNuvemshopOrdersPage({ client, window, page }: { client: AxiosInstance; window: TCanonicalImportWindow; page: number }) {
	try {
		const response = await client.get<unknown>("/orders", {
			params: {
				status: "any",
				updated_at_min: window.startDate.toISOString(),
				updated_at_max: window.endDate.toISOString(),
				page,
				per_page: NUVEMSHOP_ORDERS_PER_PAGE,
			},
		});

		return NuvemshopOrdersOutputSchema.parse(response.data);
	} catch (error) {
		if (isNuvemshopPastLastPageError(error)) return [];
		if (isAxiosError(error) && error.response?.status === 429) {
			const retryAfterMs = getRetryAfterMs(error.response.headers["retry-after"]) ?? 30000;
			console.warn(`[NUVEMSHOP] Rate limit atingido. Aguardando ${retryAfterMs / 1000}s antes de tentar novamente.`);
			await delay(retryAfterMs);
			const response = await client.get<unknown>("/orders", {
				params: {
					status: "any",
					updated_at_min: window.startDate.toISOString(),
					updated_at_max: window.endDate.toISOString(),
					page,
					per_page: NUVEMSHOP_ORDERS_PER_PAGE,
				},
			});
			return NuvemshopOrdersOutputSchema.parse(response.data);
		}

		throw error;
	}
}

async function getNuvemshopProductsPage({ client, page }: { client: AxiosInstance; page: number }) {
	try {
		const response = await client.get<unknown>("/products", {
			params: {
				page,
				per_page: NUVEMSHOP_PRODUCTS_PER_PAGE,
				fields: "id,name,description,images,categories,brand,published,variants",
			},
		});

		return NuvemshopProductsOutputSchema.parse(response.data);
	} catch (error) {
		if (isNuvemshopPastLastPageError(error)) return [];
		if (isAxiosError(error) && error.response?.status === 429) {
			const retryAfterMs = getRetryAfterMs(error.response.headers["retry-after"]) ?? 30000;
			console.warn(`[NUVEMSHOP] Rate limit atingido ao buscar produtos. Aguardando ${retryAfterMs / 1000}s antes de tentar novamente.`);
			await delay(retryAfterMs);
			const response = await client.get<unknown>("/products", {
				params: {
					page,
					per_page: NUVEMSHOP_PRODUCTS_PER_PAGE,
					fields: "id,name,description,images,categories,brand,published,variants",
				},
			});
			return NuvemshopProductsOutputSchema.parse(response.data);
		}

		throw error;
	}
}

export async function fetchAllNuvemshopOrders(config: TNuvemshopConfig, window: TCanonicalImportWindow) {
	const client = createNuvemshopClient(config);
	const orders: TNuvemshopOrder[] = [];

	for (let page = 1; page <= NUVEMSHOP_MAX_PAGES_PER_WINDOW; page++) {
		const pageOrders = await getNuvemshopOrdersPage({ client, window, page });
		orders.push(...pageOrders);

		if (pageOrders.length < NUVEMSHOP_ORDERS_PER_PAGE) break;
	}

	return orders;
}

export async function fetchAllNuvemshopProducts(config: TNuvemshopConfig) {
	const parsedConfig = NuvemshopConfigSchema.parse({
		...config,
		storeId: String(config.storeId),
	});
	const client = createNuvemshopClient(parsedConfig);
	const products: TNuvemshopProduct[] = [];

	for (let page = 1; page <= NUVEMSHOP_MAX_PRODUCT_PAGES; page++) {
		const pageProducts = await getNuvemshopProductsPage({ client, page });
		products.push(...pageProducts);

		if (pageProducts.length < NUVEMSHOP_PRODUCTS_PER_PAGE) break;
	}

	return products;
}

export async function fetchNuvemshopImportBatch({
	organizationId,
	config,
	window,
}: {
	organizationId: string;
	config: TNuvemshopConfig;
	window: TCanonicalImportWindow;
}) {
	const parsedConfig = NuvemshopConfigSchema.parse({
		...config,
		storeId: String(config.storeId),
	});
	const orders = await fetchAllNuvemshopOrders(parsedConfig, window);
	return toCanonicalNuvemshopImportBatch({ organizationId, window, orders });
}

export * from "./mappers";
export * from "./types";
