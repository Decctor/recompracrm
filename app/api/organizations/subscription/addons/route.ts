import {
	AppSubscriptionPlans,
	SUBSCRIPTION_ADDONS,
	SUBSCRIPTION_ADDON_KEYS,
	SUBSCRIPTION_CYCLE_PRICING_KEY,
	type TAppSubscriptionPlanKey,
} from "@/config";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import {
	getSubscriptionAddonPriceId,
	isAddonAvailableInCycle,
	isSubscriptionBasePlanKey,
	isModularSubscriptionMetadata,
	resolveSubscriptionSelectionFromPriceIds,
	type TSubscriptionSelection,
} from "@/lib/subscriptions/entitlements";
import { hasChargeableStripeSubscription } from "@/lib/subscriptions/stripe-status";
import { SubscriptionAddonEnum, type TSubscriptionAddonEnum, type TSubscriptionCycleEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { getStripeClient, getStripeSalesAccount, resolveStripeAccount } from "@/services/stripe";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import z from "zod";

/**
 * Adicionais da assinatura (Hub de Atendimentos, consultoria) contratados e cancelados de dentro
 * do app, sobre a assinatura que já existe. O portal de cobrança do Stripe fica só para forma de
 * pagamento e cancelamento: a configuração padrão dele é dividida com o app recompracrm-chats.
 *
 * Esta rota nunca grava recursos. Ela muda os itens da assinatura no Stripe; quem libera ou
 * retira o acesso é o webhook (customer.subscription.updated → entitlements-sync).
 */

/** Por que a organização não pode mexer nos adicionais por aqui — a UI mostra o texto correspondente. */
type TAddonsUnavailableReason = "SEM_ASSINATURA" | "ASSINATURA_DE_DEAL" | "PLANO_ANTIGO" | "CONTA_STRIPE_ANTIGA" | "SEM_PERMISSAO";

type TOrganizationBillingRow = NonNullable<Awaited<ReturnType<typeof findOrganizationBillingRow>>>;

async function findOrganizationBillingRow(organizationId: string) {
	return await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, organizationId),
		columns: {
			id: true,
			dealId: true,
			assinaturaPlano: true,
			assinaturaAdicionais: true,
			configuracao: true,
			stripeConta: true,
			stripeCustomerId: true,
			stripeSubscriptionId: true,
			stripeSubscriptionStatus: true,
		},
	});
}

// Contratar um adicional cobra na hora o cartão salvo — diferente do checkout, em que o pagador
// digita o cartão. Por isso só quem administra a equipe mexe aqui.
function canManageSubscriptionAddons(session: TAuthUserSession) {
	return session.membership?.permissoes.usuarios.editar === true;
}

type TLiveSubscription = {
	subscription: Stripe.Subscription;
	selection: TSubscriptionSelection;
	stripe: Stripe;
};

/**
 * A assinatura no Stripe é a fonte da verdade: o que está contratado vem dos itens dela, não das
 * colunas locais (que são o espelho gravado pelo webhook e podem estar alguns segundos atrás).
 */
async function loadManageableSubscription(
	organization: TOrganizationBillingRow,
): Promise<{ live: TLiveSubscription; reason: null } | { live: null; reason: Exclude<TAddonsUnavailableReason, "SEM_PERMISSAO"> }> {
	if (organization.dealId) return { live: null, reason: "ASSINATURA_DE_DEAL" };
	if (!organization.stripeSubscriptionId || !hasChargeableStripeSubscription(organization.stripeSubscriptionStatus)) {
		return { live: null, reason: "SEM_ASSINATURA" };
	}
	// Os prices dos adicionais só existem na conta de vendas, e um price não atravessa contas.
	const account = resolveStripeAccount(organization.stripeConta);
	if (account !== getStripeSalesAccount()) return { live: null, reason: "CONTA_STRIPE_ANTIGA" };

	const stripe = getStripeClient(account);
	const subscription = await stripe.subscriptions.retrieve(organization.stripeSubscriptionId);
	if (!isModularSubscriptionMetadata(subscription.metadata)) return { live: null, reason: "PLANO_ANTIGO" };

	const selection = resolveSubscriptionSelectionFromPriceIds(subscription.items.data.map((item) => item.price.id));
	if (!selection) return { live: null, reason: "PLANO_ANTIGO" };

	return { live: { subscription, selection, stripe }, reason: null };
}

// ---------------------------------------------------------------------------------------------
// GET — o que a organização tem e o que pode contratar
// ---------------------------------------------------------------------------------------------

async function getSubscriptionAddons({ session }: { session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.BadRequest("Nenhuma organização associada.");

	const organization = await findOrganizationBillingRow(organizationId);
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const { live, reason } = await loadManageableSubscription(organization);
	const cycle: TSubscriptionCycleEnum | null = live?.selection.cycle ?? null;
	const contractedAddons: TSubscriptionAddonEnum[] = live?.selection.addons ?? [];
	const planKey = (live?.selection.basePlan ?? organization.assinaturaPlano) as TAppSubscriptionPlanKey | null;
	const plan = planKey ? (AppSubscriptionPlans[planKey] ?? null) : null;

	const unavailableReason: TAddonsUnavailableReason | null = reason ?? (canManageSubscriptionAddons(session) ? null : "SEM_PERMISSAO");

	return {
		data: {
			// Só há assinatura própria cobrável quando `assinante` é true; em teste, ou com o
			// acesso vindo de um deal, o que a organização enxerga é o que está em `recursos`.
			assinante: hasChargeableStripeSubscription(organization.stripeSubscriptionStatus) && !organization.dealId,
			gerenciavel: unavailableReason === null,
			motivoIndisponivel: unavailableReason,
			planoBase: planKey,
			planoNome: plan?.name ?? null,
			// Plano-base que o checkout deve trazer marcado. Quem testa (ou assinava) um tier antigo
			// não tem um plano-base gravado: vale o que a organização usa hoje — com ERP, CRM + ERP.
			planoSugerido: isSubscriptionBasePlanKey(planKey)
				? planKey
				: organization.configuracao.recursos.erp.acesso
					? ("CRM_ERP" as const)
					: ("CRM" as const),
			ciclo: cycle,
			adicionais: SUBSCRIPTION_ADDON_KEYS.map((key) => {
				const addon = SUBSCRIPTION_ADDONS[key];
				const pricing = cycle ? addon.pricing[SUBSCRIPTION_CYCLE_PRICING_KEY[cycle]] : addon.pricing.monthly;
				return {
					chave: key,
					nome: addon.name,
					descricao: addon.description,
					recursos: addon.pricingTableFeatures.map((feature) => feature.label),
					contratado: contractedAddons.includes(key),
					// Consultoria não existe no ciclo anual: o Stripe não mistura intervalos na mesma assinatura.
					disponivelNoCiclo: cycle ? isAddonAvailableInCycle(key, cycle) : true,
					preco: pricing?.price ?? null,
					precoMensal: addon.pricing.monthly.price,
				};
			}),
		},
		message: "Adicionais da assinatura obtidos com sucesso.",
	};
}
export type TGetSubscriptionAddonsOutput = Awaited<ReturnType<typeof getSubscriptionAddons>>;

async function getSubscriptionAddonsRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const result = await getSubscriptionAddons({ session });
	return NextResponse.json(result);
}

// ---------------------------------------------------------------------------------------------
// POST / DELETE — contratar e cancelar um adicional
// ---------------------------------------------------------------------------------------------

const UNAVAILABLE_REASON_MESSAGES: Record<TAddonsUnavailableReason, string> = {
	SEM_ASSINATURA: "Contrate um plano antes de incluir um adicional.",
	ASSINATURA_DE_DEAL: "A assinatura desta organização faz parte de um contrato. Fale com a gente para incluir ou retirar adicionais.",
	PLANO_ANTIGO: "O seu plano é de uma tabela anterior. Fale com a gente para incluir ou retirar adicionais.",
	CONTA_STRIPE_ANTIGA: "A sua assinatura é de uma tabela anterior. Fale com a gente para incluir ou retirar adicionais.",
	SEM_PERMISSAO: "Você não tem permissão para alterar a assinatura da organização.",
};

async function requireManageableSubscription({ session }: { session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.BadRequest("Nenhuma organização associada.");
	if (!canManageSubscriptionAddons(session)) throw new createHttpError.Forbidden(UNAVAILABLE_REASON_MESSAGES.SEM_PERMISSAO);

	const organization = await findOrganizationBillingRow(organizationId);
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	const { live, reason } = await loadManageableSubscription(organization);
	if (!live) throw new createHttpError.BadRequest(UNAVAILABLE_REASON_MESSAGES[reason]);
	return { organization, ...live };
}

const AddSubscriptionAddonInputSchema = z.object({
	addon: SubscriptionAddonEnum,
});
export type TAddSubscriptionAddonInput = z.infer<typeof AddSubscriptionAddonInputSchema>;

async function addSubscriptionAddon({ input, session }: { input: TAddSubscriptionAddonInput; session: TAuthUserSession }) {
	const { organization, subscription, selection, stripe } = await requireManageableSubscription({ session });
	const addon = SUBSCRIPTION_ADDONS[input.addon];

	if (selection.addons.includes(input.addon)) throw new createHttpError.BadRequest(`${addon.name} já faz parte da sua assinatura.`);
	if (!isAddonAvailableInCycle(input.addon, selection.cycle)) {
		throw new createHttpError.BadRequest(`${addon.name} está disponível apenas para assinaturas mensais.`);
	}
	const priceId = getSubscriptionAddonPriceId(input.addon, selection.cycle);
	if (!priceId) throw new createHttpError.InternalServerError("Price ID do Stripe não configurado para este adicional.");

	try {
		// always_invoice: o proporcional do ciclo em curso é cobrado agora. Com create_prorations
		// ele só entraria no próximo invoice — num plano anual, até um ano depois (ou nunca, se a
		// assinatura fosse cancelada antes).
		// error_if_incomplete: se a cobrança falhar, o Stripe devolve 402 e NÃO altera a
		// assinatura. O padrão (allow_incomplete) aplicaria o item mesmo sem pagamento.
		await stripe.subscriptions.update(subscription.id, {
			items: [{ price: priceId, quantity: 1 }],
			proration_behavior: "always_invoice",
			payment_behavior: "error_if_incomplete",
		});
	} catch (error) {
		if (error instanceof Stripe.errors.StripeCardError || (error instanceof Stripe.errors.StripeError && error.statusCode === 402)) {
			console.log("[SUBSCRIPTION_ADDONS] Cobrança do adicional recusada.", { organizationId: organization.id, addon: input.addon, code: error.code });
			throw new createHttpError.PaymentRequired(
				"Não conseguimos cobrar o adicional na sua forma de pagamento atual. Atualize a forma de pagamento no portal de cobrança e tente de novo.",
			);
		}
		throw error;
	}

	console.log("[SUBSCRIPTION_ADDONS] Adicional incluído na assinatura.", {
		organizationId: organization.id,
		subscriptionId: subscription.id,
		addon: input.addon,
	});
	return {
		data: { addon: input.addon },
		message: `${addon.name} incluído na sua assinatura. O acesso é liberado em instantes.`,
	};
}
export type TAddSubscriptionAddonOutput = Awaited<ReturnType<typeof addSubscriptionAddon>>;

async function addSubscriptionAddonRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = AddSubscriptionAddonInputSchema.parse(await request.json());
	const result = await addSubscriptionAddon({ input, session });
	return NextResponse.json(result);
}

const RemoveSubscriptionAddonInputSchema = z.object({
	addon: SubscriptionAddonEnum,
});
export type TRemoveSubscriptionAddonInput = z.infer<typeof RemoveSubscriptionAddonInputSchema>;

async function removeSubscriptionAddon({ input, session }: { input: TRemoveSubscriptionAddonInput; session: TAuthUserSession }) {
	const { organization, subscription, selection, stripe } = await requireManageableSubscription({ session });
	const addon = SUBSCRIPTION_ADDONS[input.addon];

	const priceId = getSubscriptionAddonPriceId(input.addon, selection.cycle);
	const item = priceId ? subscription.items.data.find((subscriptionItem) => subscriptionItem.price.id === priceId) : null;
	if (!item) throw new createHttpError.BadRequest(`${addon.name} não faz parte da sua assinatura.`);

	// O item sai agora e o tempo não usado vira crédito no próximo invoice (create_prorations).
	// O Stripe não tem "cancelar item no fim do período" sem subscription schedules, e manter o
	// acesso de um item já removido exigiria um estado local que o webhook não conhece.
	await stripe.subscriptions.update(subscription.id, {
		items: [{ id: item.id, deleted: true }],
		proration_behavior: "create_prorations",
	});

	console.log("[SUBSCRIPTION_ADDONS] Adicional retirado da assinatura.", {
		organizationId: organization.id,
		subscriptionId: subscription.id,
		addon: input.addon,
	});
	return {
		data: { addon: input.addon },
		message: `${addon.name} retirado da sua assinatura. O valor do período não utilizado vira crédito na próxima cobrança.`,
	};
}
export type TRemoveSubscriptionAddonOutput = Awaited<ReturnType<typeof removeSubscriptionAddon>>;

async function removeSubscriptionAddonRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const input = RemoveSubscriptionAddonInputSchema.parse({ addon: request.nextUrl.searchParams.get("addon") });
	const result = await removeSubscriptionAddon({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getSubscriptionAddonsRoute });
export const POST = appApiHandler({ POST: addSubscriptionAddonRoute });
export const DELETE = appApiHandler({ DELETE: removeSubscriptionAddonRoute });
