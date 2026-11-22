import { FREE_TRIAL_ADDONS } from "@/config";
import { applySubscriptionSelectionToConfiguration } from "@/lib/subscriptions/entitlements";
import { db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";

/**
 * Trocar de produto durante o teste liga o ERP: o teste passa a ser do plano-base CRM_ERP, com os
 * mesmos adicionais de teste. Nunca renova o prazo nem mexe em uma assinatura paga.
 */
export async function enableErpTrial({ organizationId }: { organizationId: string }) {
	await db.transaction(async (tx) => {
		const [organization] = await tx.select().from(organizations).where(eq(organizations.id, organizationId)).for("update");
		if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");
		if (organization.configuracao.recursos.erp.acesso) return;
		if (organization.stripeSubscriptionId || !organization.periodoTesteFim || organization.periodoTesteFim <= new Date()) {
			throw new createHttpError.Forbidden("O período de teste não está disponível para esta organização.");
		}
		await tx
			.update(organizations)
			.set({
				assinaturaPlano: "CRM_ERP",
				assinaturaAdicionais: FREE_TRIAL_ADDONS,
				configuracao: applySubscriptionSelectionToConfiguration({
					configuracao: organization.configuracao,
					basePlan: "CRM_ERP",
					addons: FREE_TRIAL_ADDONS,
				}),
			})
			.where(eq(organizations.id, organizationId));
	});
}
