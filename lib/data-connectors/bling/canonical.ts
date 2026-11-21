import dayjs from "dayjs";
import { computeListingSignature, partitionListingByKnownSignature } from "../listing-signature";
import type { TCanonicalImportWindow, TDataConnector, TDataConnectorFetchInput } from "../types";
import { createBlingClient, fetchBlingPaginated, fetchBlingSingle, getValidBlingConfig } from "./client";
import { toCanonicalBlingImportBatch } from "./mappers";
import {
	BlingConfigSchema,
	BlingContactSchema,
	BlingProductSchema,
	BlingSaleSchema,
	type TBlingContact,
	type TBlingProduct,
	type TBlingSale,
} from "./types";

const LOG_PREFIX = "[BLING_SYNC]";

function formatBlingDate(date: Date) {
	return dayjs(date).format("YYYY-MM-DD");
}

/**
 * O que a listagem de pedidos mostra e que muda quando o pedido muda: situação, totais, datas,
 * contato. Edição que não toca nenhum desses campos só entra no próximo run completo.
 */
export function getBlingListingSignature(sale: TBlingSale) {
	return computeListingSignature("BLING", {
		numero: sale.numero ?? null,
		data: sale.data ?? null,
		dataSaida: sale.dataSaida ?? null,
		total: sale.total,
		totalProdutos: sale.totalProdutos,
		situacaoId: sale.situacao?.id ?? null,
		situacaoValor: sale.situacao?.valor ?? null,
		contatoId: sale.contato?.id ?? null,
		lojaId: sale.loja?.id ?? null,
	});
}

async function fetchBlingSalesWithDetails(
	client: ReturnType<typeof createBlingClient>,
	window: TCanonicalImportWindow,
	resolveKnownListingSignatures: TDataConnectorFetchInput["resolveKnownListingSignatures"],
) {
	const dataInicial = formatBlingDate(window.startDate);
	const dataFinal = formatBlingDate(window.endDate);
	console.log(`${LOG_PREFIX} Listando pedidos de venda (${dataInicial} a ${dataFinal})...`);

	const saleSummaries = (
		await fetchBlingPaginated<TBlingSale>(client, "/pedidos/vendas", BlingSaleSchema, {
			dataInicial,
			dataFinal,
		})
	).filter((sale) => !!sale.id);
	console.log(`${LOG_PREFIX} ${saleSummaries.length} pedido(s) encontrado(s) na listagem.`);

	const known = resolveKnownListingSignatures ? await resolveKnownListingSignatures(saleSummaries.map((sale) => String(sale.id))) : null;
	const { toFetch, unchanged } = partitionListingByKnownSignature({
		items: saleSummaries,
		getSourceSaleId: (sale) => String(sale.id),
		getSignature: getBlingListingSignature,
		known,
	});
	if (known) console.log(`${LOG_PREFIX} ${unchanged.length} pedido(s) já gravado(s) sem mudança na listagem; detalhando ${toFetch.length}.`);

	const sales: TBlingSale[] = [];
	// Só a venda montada do detalhe é carimbada: a que cai na listagem (detalhe falhou) precisa ser
	// detalhada de novo no próximo run.
	const listingSignatures = new Map<string, string>();
	const total = toFetch.length;

	for (const [index, sale] of toFetch.entries()) {
		const saleId = String(sale.id);
		console.log(`${LOG_PREFIX} Buscando detalhes do pedido ${index + 1}/${total} (id=${saleId})...`);

		try {
			sales.push(await fetchBlingSingle<TBlingSale>(client, `/pedidos/vendas/${saleId}`, BlingSaleSchema));
			listingSignatures.set(saleId, getBlingListingSignature(sale));
		} catch (error) {
			console.warn(`${LOG_PREFIX} Falha ao buscar detalhes do pedido ${saleId}. Usando dados da listagem.`, error);
			sales.push(sale);
		}
	}

	console.log(`${LOG_PREFIX} Detalhes de ${sales.length} pedido(s) obtidos.`);
	return { sales, listingSignatures };
}

async function fetchBlingContactsForSales(client: ReturnType<typeof createBlingClient>, sales: TBlingSale[]) {
	const contactIds = Array.from(new Set(sales.map((sale) => (sale.contato?.id ? String(sale.contato.id) : null)).filter(Boolean)));
	const contacts: TBlingContact[] = [];
	const total = contactIds.length;

	console.log(`${LOG_PREFIX} Buscando ${total} contato(s) único(s)...`);

	for (const [index, contactId] of contactIds.entries()) {
		console.log(`${LOG_PREFIX} Buscando contato ${index + 1}/${total} (id=${contactId})...`);

		try {
			contacts.push(await fetchBlingSingle<TBlingContact>(client, `/contatos/${contactId}`, BlingContactSchema));
		} catch (error) {
			console.warn(`${LOG_PREFIX} Falha ao buscar contato ${contactId}.`, error);
		}
	}

	console.log(`${LOG_PREFIX} ${contacts.length}/${total} contato(s) obtido(s).`);
	return contacts;
}

async function fetchBlingProductsForSales(client: ReturnType<typeof createBlingClient>, sales: TBlingSale[]) {
	const productIds = Array.from(
		new Set(sales.flatMap((sale) => sale.itens.map((item) => (item.produto?.id ? String(item.produto.id) : null))).filter(Boolean)),
	);
	const products: TBlingProduct[] = [];
	const total = productIds.length;

	console.log(`${LOG_PREFIX} Buscando ${total} produto(s) único(s)...`);

	for (const [index, productId] of productIds.entries()) {
		console.log(`${LOG_PREFIX} Buscando produto ${index + 1}/${total} (id=${productId})...`);

		try {
			products.push(await fetchBlingSingle<TBlingProduct>(client, `/produtos/${productId}`, BlingProductSchema));
		} catch (error) {
			console.warn(`${LOG_PREFIX} Falha ao buscar produto ${productId}.`, error);
		}
	}

	console.log(`${LOG_PREFIX} ${products.length}/${total} produto(s) obtido(s).`);
	return products;
}

export const blingDataConnector: TDataConnector = {
	kind: "BLING",
	fetchImportBatch: async ({ organizationId, integrationId, config, window, resolveKnownListingSignatures }) => {
		const dataInicial = formatBlingDate(window.startDate);
		const dataFinal = formatBlingDate(window.endDate);
		console.log(`${LOG_PREFIX} Iniciando importação (org=${organizationId}, integração=${integrationId}, período=${dataInicial} a ${dataFinal})...`);

		const parsedConfig = BlingConfigSchema.parse(config);
		const validConfig = await getValidBlingConfig({ integrationId, config: parsedConfig });
		const client = createBlingClient(validConfig, {
			// A fila é da conta Bling, e a config não diz qual conta é: duas conexões da mesma
			// organização podem apontar para a mesma conta (a trezz tem duas), e filas separadas
			// estourariam o limite dela. Por organização, contas de clientes diferentes não se esperam.
			rateLimitKey: organizationId,
		});

		const { sales, listingSignatures } = await fetchBlingSalesWithDetails(client, window, resolveKnownListingSignatures);
		const [contacts, products] = await Promise.all([fetchBlingContactsForSales(client, sales), fetchBlingProductsForSales(client, sales)]);

		const mappedBatch = toCanonicalBlingImportBatch({
			organizationId,
			window,
			sales,
			contacts,
			products,
		});
		const batch = {
			...mappedBatch,
			sales: mappedBatch.sales.map((sale) => {
				const listingSignature = listingSignatures.get(sale.sourceSaleId);
				return listingSignature ? { ...sale, listingSignature } : sale;
			}),
		};

		console.log(
			`${LOG_PREFIX} Batch canônico montado: ${batch.sales.length} venda(s), ${batch.products.length} produto(s), ${batch.sellers.length} vendedor(es).`,
		);

		return batch;
	},
};
