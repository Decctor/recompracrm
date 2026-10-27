import { blingDataConnector } from "./bling";
import { fetchCardapioWebImportBatch } from "./cardapio-web/canonical";
import { erpFlexDataConnector } from "./erp-flex";
import { fetchIfoodImportBatch } from "./ifood";
import { fetchNuvemshopImportBatch } from "./nuvemshop";
import { fetchOnlineSoftwareImportBatch } from "./online-software";
import { sqlViewsDataConnector } from "./sql-views";
import type { TCanonicalImportBatch, TDataConnectorFetchInput, TDataConnectorKind } from "./types";

export * from "./types";
export * from "./status-mappers";
export { CATALOG_SYNC_INTEGRATION_TYPES, syncProductsForIntegration, syncProductsForOrganization } from "./catalog-sync";
export type { TSyncProductsForOrganizationResult } from "./catalog-sync";

export async function fetchConnectorImportBatch(input: TDataConnectorFetchInput): Promise<TCanonicalImportBatch> {
	const batch = await fetchConnectorBatch(input);
	return { ...batch, integrationId: input.integrationId };
}

async function fetchConnectorBatch(input: TDataConnectorFetchInput) {
	if (input.config.tipo === "CARDAPIO-WEB") {
		return fetchCardapioWebImportBatch({
			organizationId: input.organizationId,
			config: input.config,
			window: input.window,
		});
	}

	if (input.config.tipo === "ONLINE-SOFTWARE") {
		return fetchOnlineSoftwareImportBatch({
			organizationId: input.organizationId,
			config: input.config,
			window: input.window,
		});
	}

	if (input.config.tipo === "NUVEM-SHOP") {
		return fetchNuvemshopImportBatch({
			organizationId: input.organizationId,
			config: input.config as unknown as Parameters<typeof fetchNuvemshopImportBatch>[0]["config"],
			window: input.window,
		});
	}

	if (input.config.tipo === "IFOOD") {
		return fetchIfoodImportBatch({
			organizationId: input.organizationId,
			integrationId: input.integrationId,
			config: input.config,
			window: input.window,
		});
	}

	if (input.config.tipo === "BLING") {
		return blingDataConnector.fetchImportBatch({
			organizationId: input.organizationId,
			integrationId: input.integrationId,
			config: input.config,
			window: input.window,
		});
	}

	if (input.config.tipo === "ERP-FLEX") {
		return erpFlexDataConnector.fetchImportBatch({
			organizationId: input.organizationId,
			integrationId: input.integrationId,
			config: input.config,
			window: input.window,
		});
	}

	if (input.config.tipo === "SQL-VIEWS") {
		return sqlViewsDataConnector.fetchImportBatch({
			organizationId: input.organizationId,
			integrationId: input.integrationId,
			config: input.config,
			window: input.window,
		});
	}

	throw new Error(`Integracao nao suportada: ${(input.config as { tipo?: TDataConnectorKind }).tipo ?? "NAO DEFINIDA"}`);
}
