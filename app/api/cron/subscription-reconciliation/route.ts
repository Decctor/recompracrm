import { appApiHandler } from "@/lib/app-api";
import { assertCronAuthorized } from "@/lib/cron/assert-cron-authorized";
import { clearProvisionalAccess, consolidatePaidAccess } from "@/lib/subscriptions/access";
import { db } from "@/services/drizzle";
import { getStripeClient, resolveStripeAccount } from "@/services/stripe";
import { type NextRequest, NextResponse } from "next/server";

// Retaguarda dos webhooks Stripe (plano: docs/dev-planning/stripe-boleto-plan.md): a checagem
// de datas nas requisições já bloqueia acesso vencido sem depender deste cron — aqui a gente
// consulta a Stripe para resolver o que os webhooks eventualmente perderam, nos dois sentidos:
// consolidar quem pagou (inclusive depois do bloqueio) e normalizar quem não pagou.

// Janela de tolerância para a divergência "active sem período pago vigente": todo ciclo mensal
// renova o período via invoice.paid, então um assinaturaPeriodoPagoFim parado há mais de isso
// indica webhook perdido ou assinatura zumbi.
const ACTIVE_WITHOUT_PAID_PERIOD_TOLERANCE_DAYS = 40;

async function reconcileSubscriptions() {
	const now = new Date();
	let consolidated = 0;
	let cleared = 0;
	let failed = 0;

	// 1. Janelas provisórias vencidas sem período pago vigente: a cobrança pendente (boleto/PIX)
	// não confirmou dentro da tolerância — buscar o estado real na Stripe e decidir.
	const staleOrganizations = await db.query.organizations.findMany({
		where: (fields, { and, isNotNull, isNull, lt, or }) =>
			and(
				isNotNull(fields.assinaturaAcessoProvisorioFim),
				lt(fields.assinaturaAcessoProvisorioFim, now),
				or(isNull(fields.assinaturaPeriodoPagoFim), lt(fields.assinaturaPeriodoPagoFim, now)),
			),
		columns: { id: true, stripeConta: true, stripeSubscriptionId: true, assinaturaAcessoProvisorioFim: true },
	});

	console.log(`[SUBSCRIPTION_RECONCILIATION] ${staleOrganizations.length} organizações com janela provisória vencida.`);

	for (const organization of staleOrganizations) {
		try {
			if (!organization.stripeSubscriptionId) {
				await clearProvisionalAccess({ organizationId: organization.id });
				cleared++;
				continue;
			}

			const stripe = getStripeClient(resolveStripeAccount(organization.stripeConta));
			const subscription = await stripe.subscriptions.retrieve(organization.stripeSubscriptionId);
			const latestInvoice = (subscription as unknown as { latest_invoice?: string | { id?: string } | null }).latest_invoice;
			const invoiceId = typeof latestInvoice === "string" ? latestInvoice : (latestInvoice?.id ?? null);
			const invoice = invoiceId ? await stripe.invoices.retrieve(invoiceId) : null;

			if (invoice?.status === "paid") {
				// Pagou (webhook perdido, ou compensou depois do bloqueio) — consolidar restaura o acesso.
				await consolidatePaidAccess({ organizationId: organization.id, invoice });
				consolidated++;
				continue;
			}

			// Continua pendente/vencida além da tolerância: o bloqueio já vale pela data ter
			// passado — limpar a janela apenas normaliza o registro.
			await clearProvisionalAccess({ organizationId: organization.id });
			cleared++;
		} catch (error) {
			failed++;
			console.error(`[SUBSCRIPTION_RECONCILIATION] Falha ao reconciliar organização ${organization.id}:`, error);
		}
	}

	// 2. Divergência (log apenas, v1): assinatura `active` local com período pago parado há mais
	// de um ciclo — indício de invoice.paid perdido. NULL fica de fora: é o legado pré-backfill,
	// consolidado naturalmente no próximo invoice pago.
	const divergenceCutoff = new Date(now.getTime() - ACTIVE_WITHOUT_PAID_PERIOD_TOLERANCE_DAYS * 24 * 60 * 60 * 1000);
	const divergentOrganizations = await db.query.organizations.findMany({
		where: (fields, { and, eq, isNotNull, lt }) =>
			and(eq(fields.stripeSubscriptionStatus, "active"), isNotNull(fields.assinaturaPeriodoPagoFim), lt(fields.assinaturaPeriodoPagoFim, divergenceCutoff)),
		columns: { id: true, assinaturaPeriodoPagoFim: true },
	});
	if (divergentOrganizations.length > 0) {
		console.warn("[SUBSCRIPTION_RECONCILIATION] [DIVERGENCE] Organizações `active` sem período pago vigente:", {
			count: divergentOrganizations.length,
			organizationIds: divergentOrganizations.map((organization) => organization.id),
		});
	}

	return {
		data: { checked: staleOrganizations.length, consolidated, cleared, failed, divergent: divergentOrganizations.length },
		message: "Reconciliação de assinaturas concluída.",
	};
}
export type TReconcileSubscriptionsOutput = Awaited<ReturnType<typeof reconcileSubscriptions>>;

async function reconcileSubscriptionsRoute(request: NextRequest) {
	assertCronAuthorized(request);
	const result = await reconcileSubscriptions();
	console.log("[SUBSCRIPTION_RECONCILIATION] Resultado:", result.data);
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: reconcileSubscriptionsRoute });
