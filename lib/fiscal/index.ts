import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { ManualFiscalProvider } from "./providers/manual";
import type { IFiscalProvider } from "./types";

/**
 * Factory function that returns the appropriate fiscal provider
 * based on the organization's fiscal configuration.
 */
export function getFiscalProvider(organization: Pick<TOrganizationEntity, "fiscalProvedor">): IFiscalProvider {
	switch (organization.fiscalProvedor) {
		case "MANUAL":
		case null:
		case undefined:
			return new ManualFiscalProvider();

		case "NUVEM_FISCAL":
			// TODO: implement NuvemFiscalProvider
			throw new Error("Provedor NuvemFiscal ainda não implementado.");

		default:
			return new ManualFiscalProvider();
	}
}

export type { IFiscalProvider, TEmitirDocumentoInput, TEmitirDocumentoResult } from "./types";
