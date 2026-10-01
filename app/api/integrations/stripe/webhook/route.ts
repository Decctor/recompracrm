import { BOLETO_COMPENSATION_DAYS, CONSULTORIA_ADDON, PENDING_FIRST_CHARGE_FALLBACK_DAYS } from "@/config";
import { findDealByStripeCustomerId, syncDealSubscriptionState } from "@/lib/deals";
import { archiveExternalEvent, runArchivedEventProcessing } from "@/lib/external-events/archive";
import { consolidatePaidAccess, grantProvisionalAccess } from "@/lib/subscriptions/access";
import {
	PLATFORM_PARTNER_COMMISSION_RULE_VERSION,
	PLATFORM_PARTNER_RULE_SNAPSHOT,
	getPlatformPartnerCommissionBps,
} from "@/lib/platform-partnerships/constants";
import { getPayoutDateForEligibility } from "@/lib/platform-partnerships/earnings";
import { notifyPlatformPartnerNewCommission } from "@/lib/platform-partnerships/notifications";
import { db } from "@/services/drizzle";
import { organizations, platformPartnerCommissions, platformPartnerReferrals } from "@/services/drizzle/schema";
import { stripe } from "@/services/stripe";
import { waitUntil } from "@vercel/functions";
import { and, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

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

	let event: Stripe.Event;
	try {
		event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SIGNATURE_SECRET as string);
	} catch (error) {
		console.log("[STRIPE HOOK] Invalid event signature", error);
		return NextResponse.json({}, { status: 400 });
	}

	if (!allowedStripeEvents.includes(event.type)) return NextResponse.json({ received: true });

	// Inbox durável: arquivar ANTES de processar. Se o insert falhar, a exceção propaga e o
	// handler devolve 5xx — a Stripe reentrega. "Catch + 200" aqui seria evento financeiro
	// perdido com a Stripe achando que entregou.
	const { id: archivedEventId } = await archiveExternalEvent({ origem: "STRIPE", tipo: event.type, payload: event });

	waitUntil(
		runArchivedEventProcessing({
			eventId: archivedEventId,
			run: async () => {
				await processEvent(event);
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

async function processEvent(event: Stripe.Event) {
	if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
		return await handleInvoicePaid(event.data.object as Stripe.Invoice);
	}

	if (event.type === "checkout.session.completed") {
		return await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
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
		return await db
			.update(organizations)
			.set({
				stripeSubscriptionStatus: status,
				stripeSubscriptionId: id,
				stripeSubscriptionStatusUltimaAlteracao: new Date(),
			})
			.where(eq(organizations.stripeCustomerId, customerId));
	}

	if (event.type === "customer.subscription.updated") {
		console.log("[STRIPE HOOK] [HANDLE_SUBSCRIPTION_UPDATED]", {
			customerId,
			event,
			eventObject: event.data.object,
		});
		const { id, status } = event.data.object as Stripe.Subscription;
		return await db
			.update(organizations)
			.set({
				stripeSubscriptionStatus: status,
				stripeSubscriptionId: id,
				// Só reancora o timestamp quando o status realmente muda: eventos repetidos de
				// past_due reiniciariam o grace period de 15 dias a cada redelivery.
				stripeSubscriptionStatusUltimaAlteracao: sql`CASE WHEN ${organizations.stripeSubscriptionStatus} IS DISTINCT FROM ${status} THEN NOW() ELSE ${organizations.stripeSubscriptionStatusUltimaAlteracao} END`,
			})
			.where(eq(organizations.stripeCustomerId, customerId));
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

function getInvoiceLinePriceId(line: Stripe.InvoiceLineItem) {
	const lineRecord = line as unknown as { price?: { id?: string | null; recurring?: { interval?: string | null } | null } | null };
	return lineRecord.price?.id ?? null;
}

function getInvoiceLineRecurringInterval(line: Stripe.InvoiceLineItem) {
	const lineRecord = line as unknown as { price?: { recurring?: { interval?: string | null } | null } | null };
	return lineRecord.price?.recurring?.interval ?? null;
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
			interval: getInvoiceLineRecurringInterval(line),
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
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
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
	const boletoExpiresAt = subscriptionId ? await findBoletoVoucherExpiresAt(subscriptionId) : null;

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
async function findBoletoVoucherExpiresAt(subscriptionId: string): Promise<Date | null> {
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

	const consultoriaPriceId = CONSULTORIA_ADDON.stripePriceId;
	let valorConsultoriaCentavos = 0;
	let valorBaseComissionavelCentavos = 0;
	let hasYearlyLine = false;

	for (const line of invoice.lines.data) {
		const amount = getInvoiceLineAmount(line);
		const priceId = getInvoiceLinePriceId(line);
		if (consultoriaPriceId && priceId === consultoriaPriceId) {
			valorConsultoriaCentavos += amount;
			continue;
		}

		valorBaseComissionavelCentavos += amount;
		if (getInvoiceLineRecurringInterval(line) === "year") hasYearlyLine = true;
	}

	if (valorBaseComissionavelCentavos <= 0) return;

	const previousCommissionsResult = await db
		.select({ count: count(platformPartnerCommissions.id) })
		.from(platformPartnerCommissions)
		.where(
			and(
				eq(platformPartnerCommissions.referralId, referral.id),
				isNotNull(platformPartnerCommissions.stripeInvoiceId),
				isNull(platformPartnerCommissions.ajusteOrigemCommissionId),
			),
		);
	const numeroInvoiceAssinatura = (previousCommissionsResult[0]?.count ?? 0) + 1;
	const percentualComissaoBps = getPlatformPartnerCommissionBps({ numeroInvoiceAssinatura, anual: hasYearlyLine });
	const valorComissaoCentavos = Math.round((valorBaseComissionavelCentavos * percentualComissaoBps) / 10000);
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
			valorInvoiceBrutoCentavos: invoice.amount_paid ?? invoice.total ?? valorBaseComissionavelCentavos + valorConsultoriaCentavos,
			valorConsultoriaCentavos,
			valorBaseComissionavelCentavos,
			percentualComissaoBps,
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

	notifyPlatformPartnerNewCommission(referral.partner, {
		lojaNome: organization.nome,
		numeroInvoiceAssinatura,
		percentualComissaoBps,
		valorComissaoCentavos,
		dataPix: getPayoutDateForEligibility(addDays(now, 30)),
	});
}
