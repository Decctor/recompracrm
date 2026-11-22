import { BOLETO_COMPENSATION_DAYS, CONSULTORIA_ADDON, PENDING_FIRST_CHARGE_FALLBACK_DAYS, SUBSCRIPTION_ADDONS } from "@/config";
import { findDealByStripeCustomerId, syncDealSubscriptionState } from "@/lib/deals";
import { archiveExternalEvent, runArchivedEventProcessing } from "@/lib/external-events/archive";
import { consolidatePaidAccess, grantProvisionalAccess } from "@/lib/subscriptions/access";
import { syncOrganizationEntitlementsFromSubscription } from "@/lib/subscriptions/entitlements-sync";
import { resolveInvoiceCommission, splitInvoiceCommissionBase } from "@/lib/platform-partnerships/commission";
import { PLATFORM_PARTNER_COMMISSION_RULE_VERSION, PLATFORM_PARTNER_RULE_SNAPSHOT } from "@/lib/platform-partnerships/constants";
import { db } from "@/services/drizzle";
import { organizations, platformPartnerCommissions, platformPartnerReferrals } from "@/services/drizzle/schema";
import { constructStripeWebhookEvent, getStripeClient } from "@/services/stripe";
import { waitUntil } from "@vercel/functions";
import { and, count, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

// Price da consultoria na conta SYNCRONIZA. Congelado desde que as vendas passaram para a
// RECOMPRACRM, mas as assinaturas antigas continuam faturando com ele — sem reconhecê-lo, a
// consultoria entraria na base comissionável do parceiro.
const SYNCRONIZA_CONSULTORIA_PRICE_ID = "price_1TeyrbJu49WpVubjENhMHgzK";

// Prices dos adicionais comissionáveis a taxa fixa (hoje, o Hub de Atendimentos). Só existem na
// conta de vendas: nenhuma assinatura da SYNCRONIZA tem esses itens.
const COMMISSIONABLE_ADDON_PRICE_IDS = new Set(
	[SUBSCRIPTION_ADDONS.HUB_ATENDIMENTOS.pricing.monthly.stripePriceId, SUBSCRIPTION_ADDONS.HUB_ATENDIMENTOS.pricing.yearly?.stripePriceId].filter(
		(priceId): priceId is string => !!priceId,
	),
);

const allowedStripeEvents: Stripe.Event.Type[] = [
	"customer.subscription.created",
	"customer.subscription.updated",
	"customer.subscription.deleted",
	"invoice.paid",
	"invoice.payment_succeeded",
	// PIX Automático: o débito de renovação é assíncrono e pode falhar após a
	// pré-notificação de 3 dias. A mudança de status da assinatura chega via
	// customer.subscription.updated (past_due), mas rastreamos a falha no nível do
	// invoice para observabilidade.
	"invoice.payment_failed",
	// Boleto (1ª cobrança): "completed" = boleto emitido, não pago — abre a janela de acesso
	// otimista. Os async_payment_* são observabilidade; a consolidação financeira é exclusiva
	// do invoice.paid, e a revogação acontece sozinha quando a janela local expira.
	"checkout.session.completed",
	"checkout.session.async_payment_succeeded",
	"checkout.session.async_payment_failed",
];

export async function POST(req: NextRequest) {
	const body = await req.text();

	const signature = (await headers()).get("Stripe-Signature");

	if (!signature) return NextResponse.json({}, { status: 400 });

	// As duas contas Stripe entregam nesta URL; o segredo que valida a assinatura diz de qual veio.
	const verified = constructStripeWebhookEvent({ body, signature });
	if (!verified) {
		console.log("[STRIPE HOOK] Invalid event signature");
		return NextResponse.json({}, { status: 400 });
	}
	const { event, account } = verified;

	if (!allowedStripeEvents.includes(event.type)) return NextResponse.json({ received: true });

	// Inbox durável: arquivar ANTES de processar. Se o insert falhar, a exceção propaga e o
	// handler devolve 5xx — a Stripe reentrega. "Catch + 200" aqui seria evento financeiro
	// perdido com a Stripe achando que entregou.
	const { id: archivedEventId } = await archiveExternalEvent({ origem: "STRIPE", tipo: event.type, payload: event });

	waitUntil(
		runArchivedEventProcessing({
			eventId: archivedEventId,
			run: async () => {
				await processEvent({ event, stripe: getStripeClient(account) });
			},
			resolveOrganizationId: () => resolveEventOrganizationId(event),
		}),
	);

	return NextResponse.json({ received: true });
}

// Best-effort, só para carimbar a linha do inbox (deleção por org / observabilidade).
async function resolveEventOrganizationId(event: Stripe.Event): Promise<string | null> {
	const { customer } = event.data.object as { customer?: string | { id?: string } | null };
	const customerId = typeof customer === "string" ? customer : (customer?.id ?? null);
	if (!customerId) return null;
	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.stripeCustomerId, customerId),
		columns: { id: true },
	});
	return organization?.id ?? null;
}

// Customer IDs são únicos em toda a Stripe, então o lookup local por customer não precisa da
// conta. Ela só importa para chamar a API de volta: `stripe` é o client da conta que emitiu o evento.
async function processEvent({ event, stripe }: { event: Stripe.Event; stripe: Stripe }) {
	if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
		return await handleInvoicePaid(event.data.object as Stripe.Invoice);
	}

	if (event.type === "checkout.session.completed") {
		return await handleCheckoutSessionCompleted({ session: event.data.object as Stripe.Checkout.Session, stripe });
	}

	if (event.type === "checkout.session.async_payment_succeeded" || event.type === "checkout.session.async_payment_failed") {
		// Observabilidade apenas. Sucesso: o invoice.paid correspondente consolida o acesso —
		// tratar aqui criaria um segundo caminho financeiro. Falha (boleto vencido): nenhuma
		// revogação ativa — o acesso expira sozinho em assinaturaAcessoProvisorioFim, preservando
		// a folga de compensação para quem pagou em cima do vencimento.
		const checkoutSession = event.data.object as Stripe.Checkout.Session;
		console.log("[STRIPE HOOK] [CHECKOUT_ASYNC_PAYMENT]", {
			eventType: event.type,
			sessionId: checkoutSession.id,
			customerId: typeof checkoutSession.customer === "string" ? checkoutSession.customer : checkoutSession.customer?.id,
			paymentStatus: checkoutSession.payment_status,
		});
		return;
	}

	if (event.type === "invoice.payment_failed") {
		const invoice = event.data.object as Stripe.Invoice;
		// Não altera o status da org aqui — isso é feito por customer.subscription.updated
		// (past_due), que dispara o grace period. Aqui apenas registramos para diagnóstico
		// de falhas de débito PIX (e de cartão).
		console.log("[STRIPE HOOK] [INVOICE_PAYMENT_FAILED]", {
			invoiceId: invoice.id,
			customerId: getInvoiceCustomerId(invoice),
			subscriptionId: getInvoiceSubscriptionId(invoice),
			status: invoice.status,
		});
		return;
	}

	// All the events I track have a customerId
	const { customer: customerId } = event.data.object as {
		customer: string; // Sadly TypeScript does not know this
	};
	if (typeof customerId !== "string") {
		throw new Error(`[STRIPE HOOK] Customer ID is not a string??? \n Event type: ${event.type}`);
	}

	// Deals (multi-licença): o customer pertence ao deal, não a uma organização. O status
	// é gravado no deal e replicado (fan-out) para todas as organizações vinculadas —
	// as orgs de deal não têm stripeCustomerId próprio, então o fluxo abaixo não as acharia.
	const deal = await findDealByStripeCustomerId(customerId);
	if (deal) {
		const { id, status } = event.data.object as Stripe.Subscription;
		const stripeStatus = event.type === "customer.subscription.deleted" ? "canceled" : status;
		console.log("[STRIPE HOOK] [HANDLE_DEAL_SUBSCRIPTION_EVENT]", {
			dealId: deal.id,
			customerId,
			eventType: event.type,
			stripeStatus,
		});
		return await syncDealSubscriptionState({
			dealId: deal.id,
			stripeStatus,
			stripeSubscriptionId: id,
		});
	}

	if (event.type === "customer.subscription.deleted") {
		console.log("[STRIPE HOOK] [HANDLE_SUBSCRIPTION_DELETED]", {
			customerId,
			event,
		});
		return await db
			.update(organizations)
			.set({ stripeSubscriptionStatus: "canceled", stripeSubscriptionStatusUltimaAlteracao: new Date() })
			.where(eq(organizations.stripeCustomerId, customerId));
	}
	if (event.type === "customer.subscription.created" || event.type === "customer.discount.updated") {
		const { id, status } = event.data.object as Stripe.Subscription;

		console.log("[STRIPE HOOK] [HANDLE_SUBSCRIPTION_CREATED_DISCOUNT_UPDATED]", {
			customerId,
			event,
			eventObject: event.data.object,
		});
		await db
			.update(organizations)
			.set({
				stripeSubscriptionStatus: status,
				stripeSubscriptionId: id,
				stripeSubscriptionStatusUltimaAlteracao: new Date(),
			})
			.where(eq(organizations.stripeCustomerId, customerId));
		// customer.discount.updated cai neste mesmo ramo, mas o objeto dele é um Discount: só o
		// evento de assinatura carrega itens para sincronizar.
		if (event.type === "customer.subscription.created") {
			await syncOrganizationEntitlementsFromSubscription({ customerId, subscription: event.data.object as Stripe.Subscription });
		}
		return;
	}

	if (event.type === "customer.subscription.updated") {
		console.log("[STRIPE HOOK] [HANDLE_SUBSCRIPTION_UPDATED]", {
			customerId,
			event,
			eventObject: event.data.object,
		});
		const { id, status } = event.data.object as Stripe.Subscription;
		await db
			.update(organizations)
			.set({
				stripeSubscriptionStatus: status,
				stripeSubscriptionId: id,
				// Só reancora o timestamp quando o status realmente muda: eventos repetidos de
				// past_due reiniciariam o grace period de 15 dias a cada redelivery.
				stripeSubscriptionStatusUltimaAlteracao: sql`CASE WHEN ${organizations.stripeSubscriptionStatus} IS DISTINCT FROM ${status} THEN NOW() ELSE ${organizations.stripeSubscriptionStatusUltimaAlteracao} END`,
			})
			.where(eq(organizations.stripeCustomerId, customerId));
		// Adicional contratado ou cancelado, troca de plano-base: é aqui que o acesso acompanha.
		await syncOrganizationEntitlementsFromSubscription({ customerId, subscription: event.data.object as Stripe.Subscription });
		return;
	}
	return;
}

function getInvoiceCustomerId(invoice: Stripe.Invoice) {
	const customer = invoice.customer;
	if (typeof customer === "string") return customer;
	return customer?.id ?? null;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
	const invoiceRecord = invoice as unknown as Record<string, unknown>;
	const subscription = invoiceRecord.subscription;
	if (typeof subscription === "string") return subscription;
	if (subscription && typeof subscription === "object" && "id" in subscription) {
		const id = (subscription as { id?: unknown }).id;
		return typeof id === "string" ? id : null;
	}
	const parent = invoiceRecord.parent as { subscription_details?: { subscription?: string | { id?: string } } } | undefined;
	const parentSubscription = parent?.subscription_details?.subscription;
	if (typeof parentSubscription === "string") return parentSubscription;
	return parentSubscription?.id ?? null;
}

function getInvoiceLineAmount(line: Stripe.InvoiceLineItem) {
	const lineRecord = line as unknown as Record<string, unknown>;
	const amount = lineRecord.amount;
	return typeof amount === "number" ? amount : 0;
}

// Desde a API 2025-03-31 a linha não traz mais `price`: o ID vem em pricing.price_details.price.
// Os dois formatos são lidos porque cada endpoint de webhook renderiza o evento na própria versão.
function getInvoiceLinePriceId(line: Stripe.InvoiceLineItem) {
	const lineRecord = line as unknown as {
		pricing?: { price_details?: { price?: string | { id?: string } | null } | null } | null;
		price?: { id?: string | null } | null;
	};
	const price = lineRecord.pricing?.price_details?.price;
	if (typeof price === "string") return price;
	return price?.id ?? lineRecord.price?.id ?? null;
}

// A linha não carrega mais o intervalo do price. O período cobrado diz o mesmo: um ciclo anual
// cobre ~365 dias, um mensal no máximo 31. Proração de troca de plano gera período menor e conta
// como mensal — a mesma leitura conservadora de antes.
const YEARLY_LINE_MIN_PERIOD_SECONDS = 300 * 24 * 60 * 60;

function isYearlyInvoiceLine(line: Stripe.InvoiceLineItem) {
	const lineRecord = line as unknown as { price?: { recurring?: { interval?: string | null } | null } | null };
	if (lineRecord.price?.recurring?.interval) return lineRecord.price.recurring.interval === "year";
	const { start, end } = line.period ?? {};
	return typeof start === "number" && typeof end === "number" && end - start >= YEARLY_LINE_MIN_PERIOD_SECONDS;
}

function buildInvoiceSnapshot(invoice: Stripe.Invoice) {
	return {
		id: invoice.id,
		customer: getInvoiceCustomerId(invoice),
		subscription: getInvoiceSubscriptionId(invoice),
		status: invoice.status,
		currency: invoice.currency,
		amountPaid: invoice.amount_paid,
		amountDue: invoice.amount_due,
		total: invoice.total,
		subtotal: invoice.subtotal,
		created: invoice.created,
		lines: invoice.lines.data.map((line) => ({
			id: line.id,
			amount: getInvoiceLineAmount(line),
			priceId: getInvoiceLinePriceId(line),
			interval: isYearlyInvoiceLine(line) ? "year" : "month",
			description: line.description,
			period: line.period,
		})),
		metadata: invoice.metadata,
	};
}

function addDays(date: Date, days: number) {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

// Para boleto, "completed" significa boleto EMITIDO, não pago — a assinatura fica `incomplete`
// até a compensação. Abre a janela de acesso otimista com data absoluta local; a consolidação
// financeira é exclusiva do invoice.paid.
async function handleCheckoutSessionCompleted({ session, stripe }: { session: Stripe.Checkout.Session; stripe: Stripe }) {
	if (session.mode !== "subscription") return;
	// Cartão (e PIX instantâneo) confirmam na hora: o invoice.paid consolida, nada a fazer aqui.
	if (session.payment_status === "paid") return;

	const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
	if (!customerId) return;

	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.stripeCustomerId, customerId),
		columns: { id: true },
	});
	// Deals e customers desconhecidos ficam fora do fluxo otimista (org de deal não tem
	// stripeCustomerId próprio).
	if (!organization) return;

	const subscriptionId = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
	const boletoExpiresAt = subscriptionId ? await findBoletoVoucherExpiresAt({ subscriptionId, stripe }) : null;

	// Vencimento real do boleto + folga de compensação. Sem vencimento conhecido (PIX aguardando
	// confirmação, ou falha na leitura do voucher), janela-teto curta — sempre uma data absoluta,
	// nunca acesso em aberto.
	const provisionalEnd = boletoExpiresAt ? addDays(boletoExpiresAt, BOLETO_COMPENSATION_DAYS) : addDays(new Date(), PENDING_FIRST_CHARGE_FALLBACK_DAYS);

	console.log("[STRIPE HOOK] [CHECKOUT_COMPLETED_PENDING]", {
		organizationId: organization.id,
		sessionId: session.id,
		subscriptionId,
		boletoExpiresAt,
		provisionalEnd,
	});

	await grantProvisionalAccess({ organizationId: organization.id, until: provisionalEnd });
}

// O PaymentIntent pendente do boleto vive no latest_invoice da assinatura. Na API atual o
// caminho é invoice.payments[].payment.payment_intent; em versões anteriores era
// invoice.payment_intent — lemos os dois formatos defensivamente, no mesmo idioma dos helpers
// de invoice acima. Falha em qualquer passo → null (o chamador usa a janela-teto).
async function findBoletoVoucherExpiresAt({ subscriptionId, stripe }: { subscriptionId: string; stripe: Stripe }): Promise<Date | null> {
	try {
		const subscription = await stripe.subscriptions.retrieve(subscriptionId);
		const latestInvoice = (subscription as unknown as { latest_invoice?: string | { id?: string } | null }).latest_invoice;
		const invoiceId = typeof latestInvoice === "string" ? latestInvoice : (latestInvoice?.id ?? null);
		if (!invoiceId) return null;

		const invoice = await stripe.invoices.retrieve(invoiceId);
		const invoiceRecord = invoice as unknown as Record<string, unknown>;

		let paymentIntentId: string | null = null;
		const payments = invoiceRecord.payments as { data?: Array<{ payment?: { payment_intent?: string | { id?: string } } }> } | undefined;
		for (const invoicePayment of payments?.data ?? []) {
			const candidate = invoicePayment.payment?.payment_intent;
			const candidateId = typeof candidate === "string" ? candidate : (candidate?.id ?? null);
			if (candidateId) {
				paymentIntentId = candidateId;
				break;
			}
		}
		if (!paymentIntentId) {
			const legacy = invoiceRecord.payment_intent as string | { id?: string } | null | undefined;
			paymentIntentId = typeof legacy === "string" ? legacy : (legacy?.id ?? null);
		}
		if (!paymentIntentId) return null;

		const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
		const expiresAt = paymentIntent.next_action?.boleto_display_details?.expires_at;
		return typeof expiresAt === "number" ? new Date(expiresAt * 1000) : null;
	} catch (error) {
		console.error("[STRIPE HOOK] Falha ao ler o vencimento do boleto:", error);
		return null;
	}
}

// Gera a comissão do parceiro a partir de um invoice efetivamente pago. Com PIX
// Automático o pagamento é assíncrono, então este handler só dispara APÓS a confirmação
// (invoice.paid / invoice.payment_succeeded) — nunca durante o estado pendente do PIX.
// É idempotente por invoice.id (ver guarda existingCommission abaixo), então recebê-lo
// mais de uma vez não duplica a comissão.
async function handleInvoicePaid(invoice: Stripe.Invoice) {
	if (!invoice.id) return;

	const customerId = getInvoiceCustomerId(invoice);
	if (!customerId) return;

	// Faturas de deal (multi-licença) ficam fora do fluxo de comissões de parceiros: são
	// vendas fechadas diretamente pelo admin, sem indicação. O lookup por organização
	// abaixo já não as encontraria (orgs de deal não têm stripeCustomerId), mas o skip
	// explícito documenta a decisão e evita processamento desnecessário.
	const deal = await findDealByStripeCustomerId(customerId);
	if (deal) {
		console.log("[STRIPE HOOK] [INVOICE_PAID] Fatura pertence a um deal — sem comissão de parceiro.", {
			dealId: deal.id,
			invoiceId: invoice.id,
		});
		return;
	}

	const organization = await db.query.organizations.findFirst({
		where: eq(organizations.stripeCustomerId, customerId),
	});
	if (!organization) return;

	// Consolidação do acesso ANTES de qualquer early-return de comissão: todo invoice pago
	// estende o período da organização, tenha ela indicação de parceiro ou não. Idempotente
	// (GREATEST) — redelivery não move datas.
	await consolidatePaidAccess({ organizationId: organization.id, invoice });

	const existingCommission = await db.query.platformPartnerCommissions.findFirst({
		where: eq(platformPartnerCommissions.stripeInvoiceId, invoice.id),
	});
	if (existingCommission) return;

	const referral = await db.query.platformPartnerReferrals.findFirst({
		where: eq(platformPartnerReferrals.organizacaoId, organization.id),
		with: {
			partner: true,
		},
	});
	if (!referral || referral.partner.status !== "ATIVO") return;

	const consultoriaPriceIds = new Set([CONSULTORIA_ADDON.stripePriceId, SYNCRONIZA_CONSULTORIA_PRICE_ID].filter(Boolean));
	const { valorConsultoriaCentavos, valorAdicionaisCentavos, valorBaseComissionavelCentavos, hasYearlyBaseLine } = splitInvoiceCommissionBase({
		lines: invoice.lines.data.map((line) => ({
			amount: getInvoiceLineAmount(line),
			priceId: getInvoiceLinePriceId(line),
			isYearly: isYearlyInvoiceLine(line),
		})),
		consultoriaPriceIds,
		addonPriceIds: COMMISSIONABLE_ADDON_PRICE_IDS,
	});

	// Um invoice só de adicional (o proporcional cobrado ao contratar o Hub no meio do ciclo)
	// também gera comissão; só não há nada a pagar quando as duas parcelas são nulas.
	if (valorBaseComissionavelCentavos <= 0 && valorAdicionaisCentavos <= 0) return;

	// A numeração que decide o bônus conta só invoices com plano-base. Sem isso, o invoice
	// avulso de um adicional ocuparia a posição 2 ou 3 e deslocaria o bônus da 3ª mensalidade.
	const previousCommissionsResult = await db
		.select({ count: count(platformPartnerCommissions.id) })
		.from(platformPartnerCommissions)
		.where(
			and(
				eq(platformPartnerCommissions.referralId, referral.id),
				isNotNull(platformPartnerCommissions.stripeInvoiceId),
				isNull(platformPartnerCommissions.ajusteOrigemCommissionId),
				gt(platformPartnerCommissions.valorBaseComissionavelCentavos, 0),
			),
		);
	const previousBaseInvoices = previousCommissionsResult[0]?.count ?? 0;
	const { numeroInvoiceAssinatura, percentualComissaoBps, percentualComissaoAdicionaisBps, valorComissaoCentavos } = resolveInvoiceCommission({
		previousBaseInvoices,
		valorBaseComissionavelCentavos,
		valorAdicionaisCentavos,
		hasYearlyBaseLine,
	});
	const now = new Date();

	await db.transaction(async (tx) => {
		await tx.insert(platformPartnerCommissions).values({
			partnerId: referral.partnerId,
			referralId: referral.id,
			organizacaoId: organization.id,
			stripeInvoiceId: invoice.id,
			stripeSubscriptionId: getInvoiceSubscriptionId(invoice),
			stripeCustomerId: customerId,
			numeroInvoiceAssinatura,
			valorInvoiceBrutoCentavos: invoice.amount_paid ?? invoice.total ?? valorBaseComissionavelCentavos + valorAdicionaisCentavos + valorConsultoriaCentavos,
			valorConsultoriaCentavos,
			valorBaseComissionavelCentavos,
			percentualComissaoBps,
			valorAdicionaisCentavos,
			percentualComissaoAdicionaisBps,
			valorComissaoCentavos,
			regraVersao: PLATFORM_PARTNER_COMMISSION_RULE_VERSION,
			regraSnapshot: PLATFORM_PARTNER_RULE_SNAPSHOT,
			invoiceSnapshot: buildInvoiceSnapshot(invoice),
			status: "PENDENTE",
			dataElegibilidade: addDays(now, 30),
		});

		await tx
			.update(platformPartnerReferrals)
			.set({
				status: "PAGAMENTO_CONFIRMADO",
				dataPrimeiroPagamento: referral.dataPrimeiroPagamento ?? now,
			})
			.where(eq(platformPartnerReferrals.id, referral.id));
	});
}
