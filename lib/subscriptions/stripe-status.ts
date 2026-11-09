// Statuses em que a assinatura ainda cobra, ou vai voltar a cobrar quando o pagamento for
// regularizado. Enquanto um deles vale, um checkout novo criaria uma segunda assinatura: troca de
// plano e de forma de pagamento passam pelo portal de cobrança, na conta onde a assinatura vive.
export const CHARGEABLE_STRIPE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid"];

export function hasChargeableStripeSubscription(stripeSubscriptionStatus: string | null | undefined) {
	return !!stripeSubscriptionStatus && CHARGEABLE_STRIPE_SUBSCRIPTION_STATUSES.includes(stripeSubscriptionStatus);
}
