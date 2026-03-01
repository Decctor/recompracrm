import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { LocalPaymentProvider } from "./providers/local";
import type { IPaymentProvider } from "./types";

/**
 * Factory function that returns the appropriate payment provider
 * based on the organization's payment configuration.
 */
export function getPaymentProvider(organization: Pick<TOrganizationEntity, "pagamentoProvedor">): IPaymentProvider {
	switch (organization.pagamentoProvedor) {
		case "LOCAL":
		case null:
		case undefined:
			return new LocalPaymentProvider();

		case "MERCADO_PAGO":
			// TODO: implement MercadoPagoProvider
			throw new Error("Provedor Mercado Pago ainda não implementado.");

		case "STRIPE_CONNECT":
			// TODO: implement StripeConnectProvider
			throw new Error("Provedor Stripe Connect ainda não implementado.");

		case "PAGARME":
			// TODO: implement PagarmeProvider
			throw new Error("Provedor Pagar.me ainda não implementado.");

		default:
			return new LocalPaymentProvider();
	}
}

export type { IPaymentProvider, TPaymentIntentResult, TPaymentSplit, TProcessPaymentsInput } from "./types";
