import type { TCanonicalImportBatch } from "@/lib/data-connectors";

/**
 * Chaves que um lote canônico pode consultar no contexto auxiliar (`TResolvedAuxiliaryEntities`).
 * `syncAuxiliaryEntities` carregava a organização inteira (clientes, produtos, variantes, vínculos,
 * vendedores, parceiros) a cada lote — e a maioria dos lotes tem 0–5 vendas. Como os mapas do
 * contexto só são lidos por estas chaves, carregar apenas as linhas que casam com elas produz
 * lookups idênticos.
 *
 * `clientNames` já vem normalizado como `normalizeClientName` (trim + upper), o mesmo formato da
 * chave de `clientsByName`.
 */
export type TBatchLookupKeys = {
	clientExternalIds: string[];
	clientBasePhones: string[];
	clientNames: string[];
	productCodes: string[];
	productExternalItemIds: string[];
	sellerIdentifiers: string[];
	partnerIdentifiers: string[];
};

export function normalizeClientName(value?: string | null) {
	return (value ?? "").trim().toUpperCase();
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
	return Array.from(new Set(values.filter((value): value is string => !!value)));
}

export function collectBatchLookupKeys(batch: TCanonicalImportBatch): TBatchLookupKeys {
	const saleClients = batch.sales.map((sale) => sale.client);
	const saleItems = batch.sales.flatMap((sale) => sale.items);

	return {
		clientExternalIds: uniqueNonEmpty(saleClients.map((client) => client?.externalId)),
		clientBasePhones: uniqueNonEmpty(saleClients.map((client) => client?.basePhone)),
		clientNames: uniqueNonEmpty(saleClients.map((client) => (client ? normalizeClientName(client.name) : null))),
		productCodes: uniqueNonEmpty([...batch.products.map((product) => product.code), ...saleItems.map((item) => item.productCode)]),
		productExternalItemIds: uniqueNonEmpty([
			...batch.products.map((product) => product.externalId),
			...saleItems.map((item) => item.productExternalId),
		]),
		sellerIdentifiers: uniqueNonEmpty([...batch.sellers.map((seller) => seller.identifier), ...batch.sales.map((sale) => sale.seller?.identifier)]),
		partnerIdentifiers: uniqueNonEmpty([
			...batch.partners.map((partner) => partner.identifier),
			...batch.sales.map((sale) => sale.partnerIdentifier),
			...batch.sales.map((sale) => sale.partner?.identifier),
		]),
	};
}
