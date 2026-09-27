import { IfoodConfigSchema } from "@/lib/data-connectors/ifood/types";
import { getActiveDataSourceIntegrations } from "@/lib/integrations/data-sources";
import { ensureIfoodSalesChannel, ensureSalesChannels } from "@/lib/products/sales-channels-store";
import { db } from "@/services/drizzle";
import { resolveIfoodManagementContext } from "./context";

/**
 * Materializa o canal IFOOD de cada loja conectada. Até aqui o canal só nascia no primeiro
 * vínculo/publish/import — uma organização com o iFood conectado e nenhum vínculo abria a matriz
 * de canais sem a coluna do iFood, e a página do produto sem a linha, sem ter como começar.
 *
 * Best-effort: a lista de merchants vem da config da conexão; se ainda não foi persistida, o
 * contexto de gestão busca no iFood (e grava). Uma conexão com token vencido não derruba a
 * leitura dos canais internos.
 */
export async function ensureIfoodSalesChannelsForOrganization({ orgId }: { orgId: string }) {
	const rows = await getActiveDataSourceIntegrations({ executor: db, organizationId: orgId, types: ["IFOOD"] });
	for (const row of rows) {
		const parsed = IfoodConfigSchema.safeParse(row.configuracao);
		let merchantIds = parsed.success ? parsed.data.merchantIds : [];
		if (merchantIds.length === 0) {
			try {
				merchantIds = (await resolveIfoodManagementContext({ organizacaoId: orgId, integrationId: row.id })).merchantIds;
			} catch (error) {
				console.warn("[IFOOD_CHANNELS] Não foi possível listar as lojas da conexão.", { orgId, integrationId: row.id, error });
				continue;
			}
		}
		for (const merchantId of merchantIds) {
			await ensureIfoodSalesChannel({ orgId, integracaoId: row.id, merchantId });
		}
	}
}

/** `ensureSalesChannels` com os canais iFood já materializados — o que toda tela de canais deve ler. */
export async function ensureSalesChannelsWithIntegrations({ orgId }: { orgId: string }) {
	await ensureIfoodSalesChannelsForOrganization({ orgId }).catch((error) => {
		console.warn("[IFOOD_CHANNELS] Falha ao materializar canais do iFood.", { orgId, error });
	});
	return ensureSalesChannels({ orgId });
}
