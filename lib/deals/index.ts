import { AppSubscriptionPlans, type TAppSubscriptionPlanKey } from "@/config";
import { hasChargeableStripeSubscription } from "@/lib/subscriptions/stripe-status";
import type { TDealStatusEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { deals, organizations, type TDealEntity } from "@/services/drizzle/schema";
import { and, count, eq, isNull, sql } from "drizzle-orm";

type TDrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TDbOrTransaction = typeof db | TDrizzleTransaction;

// Deriva o status de domínio do deal a partir do status cru da assinatura no Stripe.
// O status cru fica guardado à parte (stripeSubscriptionStatus) para diagnóstico.
export function mapStripeStatusToDealStatus(stripeStatus: string | null | undefined): TDealStatusEnum {
	if (!stripeStatus || stripeStatus === "incomplete") return "PENDENTE";
	if (stripeStatus === "active" || stripeStatus === "trialing") return "ATIVO";
	if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") return "CANCELADO";
	// past_due, unpaid, paused e afins: assinatura existe mas o pagamento está irregular.
	return "INADIMPLENTE";
}

// Sincroniza o estado da assinatura do deal e replica (fan-out) o status cru para todas
// as organizações vinculadas. As orgs de deal NÃO têm customer/subscription próprios —
// as colunas planas delas (lidas por checkSubscriptionStatus/paywall) são mantidas por aqui.
export async function syncDealSubscriptionState({
	dealId,
	stripeStatus,
	stripeSubscriptionId,
	client = db,
}: {
	dealId: string;
	stripeStatus: string;
	stripeSubscriptionId?: string | null;
	client?: TDbOrTransaction;
}) {
	const now = new Date();
	await client
		.update(deals)
		.set({
			status: mapStripeStatusToDealStatus(stripeStatus),
			stripeSubscriptionStatus: stripeStatus,
			stripeSubscriptionStatusUltimaAlteracao: now,
			...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
		})
		.where(eq(deals.id, dealId));
	await client
		.update(organizations)
		.set({
			stripeSubscriptionStatus: stripeStatus,
			stripeSubscriptionStatusUltimaAlteracao: now,
		})
		.where(eq(organizations.dealId, dealId));
}

export async function countDealLicencasUtilizadas({ dealId, client = db }: { dealId: string; client?: TDbOrTransaction }) {
	const result = await client
		.select({ count: count(organizations.id) })
		.from(organizations)
		.where(eq(organizations.dealId, dealId));
	return result[0]?.count ?? 0;
}

// Reivindica (claim) deals criados apenas com o email do obtentor: quando o comprador
// ainda não tinha conta na criação do deal, o vínculo é preenchido aqui, de forma lazy.
export async function claimDealsByEmail({ userId, email, client = db }: { userId: string; email: string; client?: TDbOrTransaction }) {
	if (!email) return;
	await client
		.update(deals)
		.set({ usuarioObtentorId: userId })
		.where(and(isNull(deals.usuarioObtentorId), sql`lower(${deals.emailObtentor}) = lower(${email})`));
}

// Busca um deal ATIVO do usuário (como obtentor) com licença disponível. Usado na criação
// de organização para pular trial/checkout. Faz o claim por email antes de buscar.
export async function getDealWithAvailableLicense({ userId, email }: { userId: string; email: string | null | undefined }) {
	if (email) await claimDealsByEmail({ userId, email });

	const activeDeals = await db.query.deals.findMany({
		where: (fields, { and, eq }) => and(eq(fields.usuarioObtentorId, userId), eq(fields.status, "ATIVO")),
		orderBy: (fields, { asc }) => asc(fields.dataInsercao),
	});

	for (const deal of activeDeals) {
		const licencasUtilizadas = await countDealLicencasUtilizadas({ dealId: deal.id });
		if (licencasUtilizadas < deal.quantidadeLicencas) return { deal, licencasUtilizadas };
	}
	return null;
}

export function getDealPlanKey(deal: Pick<TDealEntity, "planoBase">): TAppSubscriptionPlanKey {
	const planKey = deal.planoBase as TAppSubscriptionPlanKey;
	if (!AppSubscriptionPlans[planKey]) throw new Error(`Plano base inválido no deal: ${deal.planoBase}`);
	return planKey;
}

// Vincula uma organização existente a um deal: aponta o dealId, aplica o plano base
// (capabilities) preservando preferências/defaults atuais da org, e replica o status da
// assinatura do deal (quando já existe — deal PENDENTE não altera o acesso da org).
export async function linkOrganizationToDeal({
	organizationId,
	deal,
	client = db,
}: {
	organizationId: string;
	deal: TDealEntity;
	client?: TDbOrTransaction;
}) {
	const organization = await client.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, organizationId),
		columns: { id: true, dealId: true, configuracao: true },
	});
	if (!organization) throw new Error("Organização não encontrada.");

	const planKey = getDealPlanKey(deal);
	const plan = AppSubscriptionPlans[planKey];

	await client
		.update(organizations)
		.set({
			dealId: deal.id,
			assinaturaPlano: planKey,
			configuracao: {
				recursos: plan.capabilities,
				preferencias: {
					...organization.configuracao.preferencias,
					rastreamentoEstoque: plan.capabilities.erp.acesso === true,
				},
				defaults: organization.configuracao.defaults,
			},
			...(deal.stripeSubscriptionStatus
				? {
						stripeSubscriptionStatus: deal.stripeSubscriptionStatus,
						stripeSubscriptionStatusUltimaAlteracao: new Date(),
					}
				: {}),
		})
		.where(eq(organizations.id, organizationId));
}

// Desvincula a organização do deal: sem assinatura própria, ela volta a depender do
// trial/checkout convencional (o status replicado é limpo para não conservar acesso órfão).
export async function unlinkOrganizationFromDeal({
	organizationId,
	dealId,
	client = db,
}: {
	organizationId: string;
	dealId: string;
	client?: TDbOrTransaction;
}) {
	await client
		.update(organizations)
		.set({
			dealId: null,
			stripeSubscriptionStatus: null,
			stripeSubscriptionStatusUltimaAlteracao: new Date(),
		})
		.where(and(eq(organizations.id, organizationId), eq(organizations.dealId, dealId)));
}

// Localiza o deal dono de um customer do Stripe — usado pelo webhook para decidir entre
// o fluxo de deal (fan-out) e o fluxo convencional (update direto na organização).
export async function findDealByStripeCustomerId(customerId: string) {
	return await db.query.deals.findFirst({
		where: (fields, { eq }) => eq(fields.stripeCustomerId, customerId),
	});
}

// Um deal "bloqueia" alterações destrutivas quando tem assinatura Stripe em estado cobrável.
export function dealHasBlockingSubscription(deal: Pick<TDealEntity, "stripeSubscriptionStatus">) {
	return hasChargeableStripeSubscription(deal.stripeSubscriptionStatus);
}
