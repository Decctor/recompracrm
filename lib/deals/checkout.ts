import { AppSubscriptionPlans, type TAppSubscriptionPlanKey } from "@/config";
import { dealHasBlockingSubscription, getDealPlanKey } from "@/lib/deals";
import { getAppBaseUrl } from "@/lib/organizations/poi-qr-codes";
import { db } from "@/services/drizzle";
import { deals, type TDealEntity } from "@/services/drizzle/schema";
import { getStripeClient, getStripeSalesAccount, resolveStripeAccount } from "@/services/stripe";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";

// Módulo separado de lib/deals/index.ts de propósito: este arquivo importa o SDK do Stripe,
// e o index é consumido pelo webhook — manter o grafo de imports do webhook enxuto.

// Convenção ctrl_* lida pelo Control (Syncroniza) — mesma usada no checkout self-serve,
// acrescida do deal_id para identificação determinística do deal em qualquer evento.
export function buildDealControlMetadata(deal: Pick<TDealEntity, "id" | "nome" | "emailObtentor" | "telefoneObtentor">) {
	const metadata: Record<string, string> = {
		dealId: deal.id,
		ctrl_deal_id: deal.id,
		ctrl_deal_nome: deal.nome,
		ctrl_email: deal.emailObtentor,
	};
	if (deal.telefoneObtentor) metadata.ctrl_phone = deal.telefoneObtentor;
	return metadata;
}

// O produto do Stripe é derivado do price mensal do plano em vez de vir de configuração
// própria: é o mesmo produto que o checkout self-serve já cobra, e não há env var para
// provisionar (e esquecer) em cada ambiente. Cacheado por processo — o produto de um plano
// não muda em runtime.
const planProductIdCache = new Map<TAppSubscriptionPlanKey, string>();

async function resolvePlanStripeProductId(planKey: TAppSubscriptionPlanKey) {
	const cached = planProductIdCache.get(planKey);
	if (cached) return cached;

	const priceId = AppSubscriptionPlans[planKey].pricing.monthly.stripePriceId;
	if (!priceId) throw new createHttpError.InternalServerError("Price mensal do Stripe não configurado para o plano base do deal.");

	// Os price IDs da configuração são os da conta de vendas.
	const price = await getStripeClient(getStripeSalesAccount()).prices.retrieve(priceId);
	const productId = typeof price.product === "string" ? price.product : price.product.id;
	if (!productId) throw new createHttpError.InternalServerError("Não foi possível resolver o produto do Stripe do plano base do deal.");

	planProductIdCache.set(planKey, productId);
	return productId;
}

// Garante a infraestrutura Stripe do deal (customer + price dedicados) e gera uma sessão
// de checkout. Idempotente por campo: só cria o que ainda não existe, então serve tanto
// para a criação do deal quanto para reemitir o link após expiração ou falha parcial.
export async function ensureDealStripeCheckout(deal: TDealEntity) {
	const planKey = getDealPlanKey(deal);

	const controlMetadata = buildDealControlMetadata(deal);

	// Customer, price e sessão precisam estar na conta de vendas. Os de outra conta (deal criado
	// antes da virada e nunca pago) são abandonados e recriados aqui. Com assinatura cobrável o
	// checkout não se reemite: ela continua na conta onde vive.
	const salesAccount = getStripeSalesAccount();
	const stripe = getStripeClient(salesAccount);
	const belongsToSalesAccount = !!deal.stripeCustomerId && resolveStripeAccount(deal.stripeConta) === salesAccount;
	if (deal.stripeCustomerId && !belongsToSalesAccount && dealHasBlockingSubscription(deal)) {
		throw new createHttpError.BadRequest("Este deal possui uma assinatura ativa em outra conta Stripe — não é possível emitir um novo checkout.");
	}

	let stripeCustomerId = belongsToSalesAccount ? deal.stripeCustomerId : null;
	if (!stripeCustomerId) {
		const customer = await stripe.customers.create({
			email: deal.emailObtentor,
			name: deal.nomeObtentor,
			metadata: controlMetadata,
		});
		stripeCustomerId = customer.id;
		console.log("[INFO] [DEAL_CHECKOUT] Stripe customer created for deal:", deal.id, stripeCustomerId);
	}

	// Price dedicado sobre o produto do plano base: o valor negociado fica visível e
	// auditável no dashboard do Stripe, e a fatura sai como "N × plano" numa única assinatura.
	let stripePriceId = belongsToSalesAccount ? deal.stripePriceId : null;
	if (!stripePriceId) {
		// Resolvido só aqui: reemitir o checkout de um deal que já tem price não toca o Stripe à toa.
		const price = await stripe.prices.create({
			product: await resolvePlanStripeProductId(planKey),
			unit_amount: deal.valorUnitarioCentavos,
			currency: "brl",
			recurring: { interval: deal.intervalo === "ANUAL" ? "year" : "month" },
			nickname: `Deal: ${deal.nome}`,
			metadata: { dealId: deal.id },
		});
		stripePriceId = price.id;
		console.log("[INFO] [DEAL_CHECKOUT] Stripe price created for deal:", deal.id, stripePriceId);
	}

	const baseUrl = getAppBaseUrl();
	const checkoutSession = await stripe.checkout.sessions.create({
		customer: stripeCustomerId,
		line_items: [{ price: stripePriceId, quantity: deal.quantidadeLicencas }],
		mode: "subscription",
		success_url: `${baseUrl}/?deal-checkout=success`,
		cancel_url: `${baseUrl}/?deal-checkout=cancelled`,
		metadata: controlMetadata,
		subscription_data: {
			metadata: controlMetadata,
		},
	});
	if (!checkoutSession.url) throw new createHttpError.InternalServerError("Erro ao criar sessão de checkout do deal.");

	await db
		.update(deals)
		.set({
			stripeConta: salesAccount,
			stripeCustomerId,
			stripePriceId,
			stripeCheckoutSessionId: checkoutSession.id,
		})
		.where(eq(deals.id, deal.id));

	return { stripeCustomerId, stripePriceId, checkoutSessionId: checkoutSession.id, checkoutUrl: checkoutSession.url };
}

// Expira a sessão de checkout anterior (best-effort, para evitar dois links pagáveis) e
// gera uma nova. Usado pelo admin (REEMITIR_CHECKOUT) e pelo formulário público de onboarding.
export async function reissueDealCheckout(deal: TDealEntity) {
	if (deal.stripeCheckoutSessionId) {
		try {
			// A sessão anterior vive na conta do deal, que pode não ser mais a de vendas.
			await getStripeClient(resolveStripeAccount(deal.stripeConta)).checkout.sessions.expire(deal.stripeCheckoutSessionId);
		} catch (error) {
			console.warn("[WARN] [DEAL_CHECKOUT] Falha ao expirar checkout anterior do deal:", deal.id, error);
		}
	}
	return await ensureDealStripeCheckout(deal);
}
