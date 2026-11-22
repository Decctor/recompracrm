import { db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import {
	applySubscriptionSelectionToConfiguration,
	hasSubscriptionSelectionChanged,
	isModularSubscriptionMetadata,
	resolveSubscriptionSelectionFromPriceIds,
} from "./entitlements";

/**
 * Os itens da assinatura no Stripe são a fonte da verdade do que a organização contratou. Chamado
 * pelo webhook em customer.subscription.created/updated: o checkout e o botão de adicional nunca
 * gravam recursos, só mudam a assinatura — é este caminho que libera (ou retira) o acesso.
 *
 * Três saídas sem escrita, todas deliberadas:
 * - assinatura sem a marca do modelo: é de um tier antigo, e quem já assinava mantém o que tem;
 * - itens que não descrevem um plano-base conhecido: nada a concluir, a organização fica como está;
 * - plano-base e adicionais iguais aos gravados: renovação ou mudança de status, não de contrato.
 */
export async function syncOrganizationEntitlementsFromSubscription({
	customerId,
	subscription,
}: {
	customerId: string;
	subscription: Stripe.Subscription;
}) {
	if (!isModularSubscriptionMetadata(subscription.metadata)) return { synced: false, reason: "ASSINATURA_LEGADA" } as const;

	const priceIds = (subscription.items?.data ?? []).flatMap((item) => (item.price?.id ? [item.price.id] : []));
	const selection = resolveSubscriptionSelectionFromPriceIds(priceIds);
	if (!selection) {
		console.error("[SUBSCRIPTION_ENTITLEMENTS] Assinatura do modelo novo sem plano-base reconhecido — recursos não alterados.", {
			customerId,
			subscriptionId: subscription.id,
			priceIds,
		});
		return { synced: false, reason: "PLANO_BASE_NAO_RECONHECIDO" } as const;
	}

	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.stripeCustomerId, customerId),
		columns: { id: true, assinaturaPlano: true, assinaturaAdicionais: true, configuracao: true, consultoriaAtiva: true, baselineInicio: true },
	});
	if (!organization) return { synced: false, reason: "ORGANIZACAO_NAO_ENCONTRADA" } as const;

	if (!hasSubscriptionSelectionChanged({ stored: organization, resolved: selection })) return { synced: false, reason: "SEM_MUDANCA" } as const;

	const consultoriaAtiva = selection.addons.includes("CONSULTORIA");
	await db
		.update(organizations)
		.set({
			assinaturaPlano: selection.basePlan,
			assinaturaAdicionais: selection.addons,
			consultoriaAtiva,
			// Marco do baseline ao ativar a consultoria; preservado se já existir.
			baselineInicio: consultoriaAtiva ? (organization.baselineInicio ?? new Date()) : organization.baselineInicio,
			configuracao: applySubscriptionSelectionToConfiguration({
				configuracao: organization.configuracao,
				basePlan: selection.basePlan,
				addons: selection.addons,
			}),
		})
		.where(eq(organizations.id, organization.id));

	console.log("[SUBSCRIPTION_ENTITLEMENTS] Recursos sincronizados a partir da assinatura.", {
		organizationId: organization.id,
		subscriptionId: subscription.id,
		previous: { assinaturaPlano: organization.assinaturaPlano, assinaturaAdicionais: organization.assinaturaAdicionais },
		next: selection,
	});
	return { synced: true, selection } as const;
}
