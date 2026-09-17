import {
	AppSubscriptionPlans,
	BOLETO_EXPIRES_AFTER_DAYS,
	CONSULTORIA_ADDON,
	PIX_MANDATE_MAX_AMOUNT_CENTS,
	type TAppSubscriptionPlanKey,
} from "@/config";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { organizations } from "@/services/drizzle/schema";
import { stripe } from "@/services/stripe";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import z from "zod";

const GenerateCheckoutInputSchema = z.object({
	subscription: z.enum(["ESSENCIAL-MONTHLY", "ESSENCIAL-YEARLY", "CRESCIMENTO-MONTHLY", "CRESCIMENTO-YEARLY", "ESCALA-MONTHLY", "ESCALA-YEARLY"]),
	// Quando true, adiciona a consultoria (Gestor de Crescimento) como 2ª line-item
	// e marca a organização como gerida por nós. Disponível só no ciclo mensal.
	consultoria: z.boolean().optional().default(false),
});

export type TGenerateCheckoutInput = z.infer<typeof GenerateCheckoutInputSchema>;

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

	// Parse subscription format: "ESSENCIAL-MONTHLY" -> plan: "ESSENCIAL", modality: "monthly"
	const [planName, modalityName] = input.subscription.split("-") as [TAppSubscriptionPlanKey, "MONTHLY" | "YEARLY"];
	const modality = modalityName.toLowerCase() as "monthly" | "yearly";

	const plan = AppSubscriptionPlans[planName];
	if (!plan) throw new createHttpError.BadRequest("Plano de assinatura inválido.");

	const stripePriceId = plan.pricing[modality].stripePriceId;
	if (!stripePriceId) throw new createHttpError.InternalServerError("Price ID do Stripe não configurado para este plano.");

	// Consultoria (add-on) só existe no ciclo mensal — Stripe não permite misturar
	// intervalos (mensal + anual) numa mesma assinatura.
	if (input.consultoria && modality !== "monthly") throw new createHttpError.BadRequest("A consultoria está disponível apenas no plano mensal.");

	const lineItems: { price: string; quantity: number }[] = [{ price: stripePriceId, quantity: 1 }];

	if (input.consultoria) {
		if (!CONSULTORIA_ADDON.stripePriceId) throw new createHttpError.InternalServerError("Price ID da consultoria não configurado.");
		lineItems.push({ price: CONSULTORIA_ADDON.stripePriceId, quantity: 1 });
	}

	// Check if org already has a Stripe customer or create one
	let stripeCustomerId = organization.stripeCustomerId;

	if (!stripeCustomerId) {
		const customerEmail = organization.email || session.user.email;
		if (!customerEmail) throw new createHttpError.BadRequest("Email é necessário para criar assinatura.");

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

	// Update organization with selected plan
	await db
		.update(organizations)
		.set({
			assinaturaPlano: planName,
			consultoriaAtiva: input.consultoria,
			// Fotografa o marco do baseline ao ativar a consultoria; preserva se já existir.
			baselineInicio: input.consultoria ? (organization.baselineInicio ?? new Date()) : organization.baselineInicio,
			configuracao: {
				recursos: plan.capabilities,
				preferencias: {
					rastreamentoEstoque: plan.capabilities.erp.acesso === true,
					limiteMensagensSemanaisViaCampanhas: null,
					limiteMensagensDiariasViaCampanhas: null,
					sessoesVenda: {
						habilitado: false,
						obrigatorio: false,
						exigirFundoTroco: false,
						conferenciaCega: false,
						bloquearFechamentoComPendenciaFiscal: false,
					},
					// Preferência controlada por nós (feature flag) — preserva ao trocar de plano.
					carteirasClientes: organization.configuracao.preferencias.carteirasClientes ?? { habilitado: false },
					// Política de canal de integrações (feature flag) — preserva ao trocar de plano.
					integracaoERP: organization.configuracao.preferencias.integracaoERP ?? {
						fulfillment: false,
						estoque: false,
						financeiro: false,
						fiscal: false,
					},
					// Preferências operacionais da organização — preserva ao trocar de plano.
					contasAtendimento: organization.configuracao.preferencias.contasAtendimento ?? { habilitado: false },
					impressoes: organization.configuracao.preferencias.impressoes ?? {
						automatica: {
							CUPOM_VENDA: { habilitada: false, canais: [], copias: 1 },
							DANFE_NFCE: { habilitada: false, canais: [], copias: 1 },
							DANFE_NFE: { habilitada: false, canais: [], copias: 1 },
						},
					},
				},
				defaults: organization.configuracao.defaults,
			},
		})
		.where(eq(organizations.id, userOrgId));

	// PIX (via PIX Automático) só se aplica ao ciclo mensal — o mandato opera em
	// payment_schedule "monthly" e não suporta débito único anual.
	// Boleto vale para mensal e anual (cada renovação emite um novo voucher por e-mail).
	// Ambos ficam atrás de flag: enquanto o método não estiver ativado na conta Stripe,
	// incluí-lo em payment_method_types faz o create da sessão falhar por inteiro (derruba
	// até o cartão). Com os dois flags off, mantemos o comportamento atual (payment methods
	// dinâmicos definidos no Dashboard) intacto.
	const pixEnabled = process.env.STRIPE_PIX_ENABLED === "true";
	const acceptsPix = pixEnabled && modality === "monthly";
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
		// Teto do mandato PIX no maior combo mensal possível (ESCALA + consultoria), para
		// que upgrade/downgrade ou adição da consultoria não exijam reautorização no banco.
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
