import { BOLETO_EXPIRES_AFTER_DAYS, PIX_MANDATE_MAX_AMOUNT_CENTS, SUBSCRIPTION_ADDONS } from "@/config";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { MODULAR_SUBSCRIPTION_METADATA, buildSubscriptionLineItems } from "@/lib/subscriptions/entitlements";
import { hasChargeableStripeSubscription } from "@/lib/subscriptions/stripe-status";
import { SubscriptionAddonEnum, SubscriptionBasePlanEnum, SubscriptionCycleEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import { getStripeClient, getStripeSalesAccount, resolveStripeAccount } from "@/services/stripe";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import z from "zod";

// Um plano-base e, opcionalmente, adicionais. Os tiers antigos não são mais aceitos aqui.
const GenerateCheckoutInputSchema = z.object({
	basePlan: SubscriptionBasePlanEnum,
	cycle: SubscriptionCycleEnum,
	addons: z.array(SubscriptionAddonEnum).optional().default([]),
});

export type TGenerateCheckoutInput = z.input<typeof GenerateCheckoutInputSchema>;

async function generateCheckoutRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");

	const userOrgId = session.membership?.organizacao.id;
	if (!userOrgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const payload = await request.json();
	const input = GenerateCheckoutInputSchema.parse(payload);

	// Get organization
	const organization = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, userOrgId),
	});
	if (!organization) throw new createHttpError.NotFound("Organização não encontrada.");

	console.log("[INFO] [GENERATE_CHECKOUT] Starting checkout generation for org:", userOrgId);

	// Convenção ctrl_* lida pelo Control (Syncroniza) para identificação determinística
	// da venda/assinatura — vincula organização, e-mail e telefone do comprador.
	// Vai na session, na subscription e no customer, para chegar em qualquer evento.
	const controlMetadata: Record<string, string> = {
		ctrl_organizacao_id: userOrgId,
		ctrl_organizacao_nome: organization.nome,
	};
	const buyerEmail = session.user.email || organization.email;
	if (buyerEmail) controlMetadata.ctrl_email = buyerEmail;
	const buyerPhone = session.user.telefone || organization.telefone;
	if (buyerPhone) controlMetadata.ctrl_phone = buyerPhone;

	// A consultoria só existe no ciclo mensal — o Stripe não mistura intervalos (mensal + anual)
	// numa mesma assinatura.
	const lineItemsResult = buildSubscriptionLineItems({ basePlan: input.basePlan, addons: input.addons, cycle: input.cycle });
	if (!lineItemsResult.ok) {
		if (lineItemsResult.reason === "ADDON_UNAVAILABLE_IN_CYCLE") {
			const addonName = SUBSCRIPTION_ADDONS[lineItemsResult.item as keyof typeof SUBSCRIPTION_ADDONS].name;
			throw new createHttpError.BadRequest(`O adicional ${addonName} está disponível apenas no plano mensal.`);
		}
		throw new createHttpError.InternalServerError("Price ID do Stripe não configurado para este plano.");
	}
	const lineItems = lineItemsResult.lineItems;

	// Um checkout novo criaria uma segunda assinatura ao lado da que ainda cobra.
	if (hasChargeableStripeSubscription(organization.stripeSubscriptionStatus)) {
		throw new createHttpError.BadRequest("Esta organização já possui uma assinatura. Para trocar de plano ou de forma de pagamento, use o portal de cobrança.");
	}

	// O checkout nasce na conta de vendas. Um customer de outra conta (o da SYNCRONIZA, de uma
	// assinatura já encerrada) não serve: o price e a sessão precisam estar na mesma conta que ele.
	// Esse customer é abandonado — sem assinatura cobrável, nada mais acontece nele.
	const salesAccount = getStripeSalesAccount();
	const stripe = getStripeClient(salesAccount);
	let stripeCustomerId = organization.stripeCustomerId && resolveStripeAccount(organization.stripeConta) === salesAccount ? organization.stripeCustomerId : null;

	if (!stripeCustomerId) {
		const customerEmail = organization.email || session.user.email;
		if (!customerEmail) throw new createHttpError.BadRequest("Email é necessário para criar assinatura.");

		if (organization.stripeCustomerId) {
			console.log("[INFO] [GENERATE_CHECKOUT] Customer de outra conta Stripe substituído:", {
				organizationId: userOrgId,
				previousCustomerId: organization.stripeCustomerId,
				previousAccount: resolveStripeAccount(organization.stripeConta),
				salesAccount,
			});
		}

		const stripeCustomer = await stripe.customers.create({
			email: customerEmail,
			name: organization.nome,
			metadata: {
				organizationId: userOrgId,
				...controlMetadata,
			},
		});
		stripeCustomerId = stripeCustomer.id;
		console.log("[INFO] [GENERATE_CHECKOUT] Stripe customer created:", stripeCustomerId);

		// Update organization with Stripe customer ID
		await db
			.update(organizations)
			.set({
				stripeCustomerId: stripeCustomerId,
				stripeConta: salesAccount,
			})
			.where(eq(organizations.id, userOrgId));
	} else {
		// Atualização oportunista: garante que customers criados antes da convenção
		// ctrl_* também fiquem identificáveis pelo Control. Falha não bloqueia o checkout.
		try {
			await stripe.customers.update(stripeCustomerId, {
				metadata: {
					organizationId: userOrgId,
					...controlMetadata,
				},
			});
		} catch (error) {
			console.error("[WARN] [GENERATE_CHECKOUT] Falha ao atualizar metadata do customer:", error);
		}
	}

	// Nada do plano é gravado aqui. O plano-base, os adicionais e os recursos só chegam à
	// organização quando a assinatura existe no Stripe: o webhook lê os itens dela e sincroniza
	// (lib/subscriptions/entitlements-sync.ts). Um checkout aberto e abandonado não muda nada.

	// PIX (via PIX Automático) só se aplica ao ciclo mensal — o mandato opera em
	// payment_schedule "monthly" e não suporta débito único anual.
	// Boleto vale para mensal e anual (cada renovação emite um novo voucher por e-mail).
	// Ambos ficam atrás de flag: enquanto o método não estiver ativado na conta Stripe,
	// incluí-lo em payment_method_types faz o create da sessão falhar por inteiro (derruba
	// até o cartão). Com os dois flags off, mantemos o comportamento atual (payment methods
	// dinâmicos definidos no Dashboard) intacto.
	const pixEnabled = process.env.STRIPE_PIX_ENABLED === "true";
	const acceptsPix = pixEnabled && input.cycle === "MENSAL";
	const acceptsBoleto = process.env.STRIPE_BOLETO_ENABLED === "true";
	const restrictsPaymentMethods = acceptsPix || acceptsBoleto;

	// Create checkout session
	const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
	const checkoutSession = await stripe.checkout.sessions.create({
		customer: stripeCustomerId,
		line_items: lineItems,
		mode: "subscription",
		// Só restringimos os métodos quando algum flag ativa um método explícito; caso
		// contrário omitimos para preservar os payment methods dinâmicos do Dashboard.
		...(restrictsPaymentMethods && {
			payment_method_types: [
				"card",
				...(acceptsPix ? ["pix"] : []),
				...(acceptsBoleto ? ["boleto"] : []),
			] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
		}),
		allow_promotion_codes: true,
		success_url: `${baseUrl}/dashboard?checkout=success`,
		cancel_url: `${baseUrl}/dashboard?checkout=cancelled`,
		// Teto do mandato PIX no maior combo mensal possível (plano-base mais caro + todos os
		// adicionais), para que trocar de plano ou contratar um adicional não exija reautorização.
		// O próprio mandato autoriza os débitos recorrentes — as renovações usam o método
		// salvo, sem precisar de payment_settings na sessão (parâmetro inexistente aqui).
		...(restrictsPaymentMethods && {
			payment_method_options: {
				...(acceptsPix && {
					pix: {
						mandate_options: {
							amount: PIX_MANDATE_MAX_AMOUNT_CENTS,
							amount_type: "maximum" as const,
							currency: "brl",
							payment_schedule: "monthly" as const,
							reference: "RecompraCRM Assinatura",
						},
					},
				}),
				...(acceptsBoleto && {
					boleto: { expires_after_days: BOLETO_EXPIRES_AFTER_DAYS },
				}),
			},
		}),
		metadata: controlMetadata,
		subscription_data: {
			metadata: {
				organizationId: userOrgId,
				...controlMetadata,
				// Marca a assinatura como governada pelos itens (plano-base + adicionais).
				...MODULAR_SUBSCRIPTION_METADATA,
			},
		},
	});

	if (!checkoutSession.url) throw new createHttpError.InternalServerError("Erro ao criar sessão de checkout.");
	console.log("[INFO] [GENERATE_CHECKOUT] Checkout session created:", checkoutSession.url);

	return NextResponse.json({
		data: {
			checkoutUrl: checkoutSession.url,
		},
		message: "Sessão de checkout criada com sucesso.",
	});
}

export type TGenerateCheckoutOutput = {
	data: {
		checkoutUrl: string;
	};
	message: string;
};

export const POST = appApiHandler({
	POST: generateCheckoutRoute,
});
