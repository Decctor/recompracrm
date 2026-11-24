import type { DB, DBTransaction } from "@/services/drizzle";
import { db } from "@/services/drizzle";
import { campaigns, whatsappConnections } from "@/services/drizzle/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getOnboardingReadiness } from "./readiness";
import { captureOnboardingEvent } from "./analytics";
import { resolvePhoneNumberState } from "@/lib/whatsapp/meta-access";

/**
 * Liga `campaigns.ativo` só quando a campanha semeada por preset está pronta E o usuário liberou
 * os envios; desliga quando uma dependência regrediu. Nunca toca campanhas sem `chavePreset`.
 * Idempotente: chamada em toda mudança de dependência (telefone conectado, template aprovado,
 * pagamento confirmado, liberação do usuário) e no fim do seed.
 *
 * `canActivate` é a permissão de quem disparou a reconciliação (`campanhas.ativar`). Quando falsa, a
 * reconciliação só desliga: uma campanha pronta e liberada antes continua parada até alguém com a
 * permissão reconciliar (ou o próximo evento de sistema). Caminhos de sistema (webhooks, jobs) não
 * têm membro e mantêm o padrão `true`.
 */
export async function reconcileOnboardingCampaigns({
	executor,
	organizationId,
	canActivate = true,
}: {
	executor: DB | DBTransaction;
	organizationId: string;
	canActivate?: boolean;
}) {
	const connections = await executor.query.whatsappConnections.findMany({
		where: eq(whatsappConnections.organizacaoId, organizationId),
		with: { telefones: { where: (phone, { isNull }) => isNull(phone.dataDesativacao) } },
	});
	const now = new Date();
	const phone = connections
		.flatMap((connection) => connection.telefones.map((item) => ({ connection, phone: item })))
		.find(({ connection, phone: item }) => resolvePhoneNumberState({ connection, phone: item, now }) === "CONECTADO")?.phone;
	if (phone)
		await executor
			.update(campaigns)
			.set({ whatsappConexaoTelefoneId: phone.id })
			.where(and(eq(campaigns.organizacaoId, organizationId), isNotNull(campaigns.chavePreset), isNull(campaigns.whatsappConexaoTelefoneId)));
	const readiness = await getOnboardingReadiness({ executor, organizationId });
	const changes: Array<{ id: string; chave: string; ativo: boolean }> = [];
	for (const campaign of readiness.campanhas) {
		const enabled = campaign.dependencias.some((dependency) => dependency.tipo === "LIBERACAO" && dependency.status === "OK");
		const shouldBeActive = campaign.pronta && enabled;
		const isActive = campaign.estado === "ATIVA";
		if (shouldBeActive === isActive) continue;
		if (shouldBeActive && !canActivate) continue;
		await executor
			.update(campaigns)
			.set({ ativo: shouldBeActive })
			.where(and(eq(campaigns.id, campaign.id), eq(campaigns.organizacaoId, organizationId), isNotNull(campaigns.chavePreset)));
		changes.push({ id: campaign.id, chave: campaign.chave, ativo: shouldBeActive });
		if (shouldBeActive && executor === db) await captureOnboardingEvent(organizationId, "campaign_activated", { chave: campaign.chave });
	}
	return { readiness: changes.length ? await getOnboardingReadiness({ executor, organizationId }) : readiness, changes };
}
