import { getActiveDataSourceIntegrations, type TDataSourceIntegration } from "@/lib/integrations/data-sources";
import { db } from "@/services/drizzle";
import { syncCardapioWebCatalog } from "./cardapio-web/catalog-sync";
import { syncNuvemshopCatalog } from "./nuvemshop/catalog-sync";
import type { TNuvemshopConfig } from "./nuvemshop/types";

export const CATALOG_SYNC_INTEGRATION_TYPES = ["CARDAPIO-WEB", "NUVEM-SHOP"] as const;
export type TCatalogSyncIntegrationType = (typeof CATALOG_SYNC_INTEGRATION_TYPES)[number];

export type TSyncProductsForOrganizationResult = {
	organizationId: string;
	organizationName: string;
	integrationId: string;
	integracaoTipo: TCatalogSyncIntegrationType;
};

export async function syncProductsForIntegration({
	integration,
}: {
	integration: TDataSourceIntegration;
}): Promise<TSyncProductsForOrganizationResult> {
	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, integration.organizacaoId),
		columns: { id: true, nome: true },
	});
	if (!organization) throw new Error(`Organização não encontrada: ${integration.organizacaoId}`);

	if (integration.configuracao.tipo === "CARDAPIO-WEB") {
		await syncCardapioWebCatalog(organization.id, integration.configuracao);
		return {
			organizationId: organization.id,
			organizationName: organization.nome,
			integrationId: integration.id,
			integracaoTipo: "CARDAPIO-WEB",
		};
	}

	if (integration.configuracao.tipo === "NUVEM-SHOP") {
		await syncNuvemshopCatalog(organization.id, integration.configuracao as unknown as TNuvemshopConfig, integration.id);
		return {
			organizationId: organization.id,
			organizationName: organization.nome,
			integrationId: integration.id,
			integracaoTipo: "NUVEM-SHOP",
		};
	}

	throw new Error(
		`Integração "${integration.tipo}" não suporta sincronização de catálogo. Integrações suportadas: ${CATALOG_SYNC_INTEGRATION_TYPES.join(", ")}.`,
	);
}

/** Sincroniza o catálogo de TODAS as conexões ativas com catálogo da organização (N conexões, N syncs). */
export async function syncProductsForOrganization({ organizationId }: { organizationId: string }): Promise<TSyncProductsForOrganizationResult[]> {
	const integrationsForCatalog = await getActiveDataSourceIntegrations({
		executor: db,
		organizationId,
		types: CATALOG_SYNC_INTEGRATION_TYPES,
	});

	if (integrationsForCatalog.length === 0) {
		throw new Error(
			`Nenhuma integração ativa com sincronização de catálogo para a organização ${organizationId}. Integrações suportadas: ${CATALOG_SYNC_INTEGRATION_TYPES.join(", ")}.`,
		);
	}

	const results: TSyncProductsForOrganizationResult[] = [];
	for (const integration of integrationsForCatalog) {
		results.push(await syncProductsForIntegration({ integration }));
	}
	return results;
}
