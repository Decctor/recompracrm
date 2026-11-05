import { resolveSalesOperationPermissions } from "@/lib/permissions/sales";
import { requireDashboardCapability } from "@/lib/access/guards";
import { EMPTY_AUTO_EMISSION_EXCEPTIONS } from "@/lib/fiscal/auto-emission-policy";
import { isOrganizationAutoFiscalCapable } from "@/lib/fiscal/auto-emission-capability";
import { getFiscalSettings } from "@/lib/fiscal/settings";
import { getSelectableFinancialAccounts } from "@/lib/payments";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { db } from "@/services/drizzle";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CheckoutPage from "./checkout-page";

export const metadata: Metadata = {
	title: "Checkout - POS",
	description: "Finalização de venda",
};

export default async function Checkout({ params }: { params: Promise<{ saleId: string }> }) {
	const access = await requireDashboardCapability("sales");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");

	const { saleId } = await params;
	const organizationId = sessionUser.membership.organizacao.id;
	const organizationConfiguration = sessionUser.membership.organizacao.configuracao as TOrganizationConfiguration;

	const [organizationCashbackProgram, fiscalSettings, organizationFinancialAccounts] = await Promise.all([
		db.query.cashbackPrograms.findFirst({
			where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
		}),
		getFiscalSettings(organizationId),
		getSelectableFinancialAccounts({ organizationId, configuracao: organizationConfiguration }),
	]);

	return (
		<CheckoutPage
			organizationId={organizationId}
			saleId={saleId}
			organizationCashbackProgram={organizationCashbackProgram ?? null}
			organizationConfiguration={organizationConfiguration}
			organizationFinancialAccounts={organizationFinancialAccounts}
			organizationAutoFiscalEmission={fiscalSettings.fiscalEmissaoAutomatica}
			organizationAutoFiscalCapable={isOrganizationAutoFiscalCapable(fiscalSettings)}
			autoEmissionExceptions={fiscalSettings.fiscalConfiguracao?.emissaoAutomatica?.excecoes ?? EMPTY_AUTO_EMISSION_EXCEPTIONS}
			canEmitFiscal={sessionUser.membership.permissoes.fiscal.emitir}
			cashPermissions={resolveSalesOperationPermissions(sessionUser.membership.permissoes)}
		/>
	);
}
