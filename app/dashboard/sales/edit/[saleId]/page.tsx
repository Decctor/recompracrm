import { resolveSalesOperationPermissions } from "@/lib/permissions/sales";
import { getCurrentSession } from "@/lib/authentication/session";
import { appRoutes } from "@/lib/navigation/routes";
import { EMPTY_AUTO_EMISSION_EXCEPTIONS } from "@/lib/fiscal/auto-emission-policy";
import { isOrganizationAutoFiscalCapable } from "@/lib/fiscal/auto-emission-capability";
import { getFiscalSettings } from "@/lib/fiscal/settings";
import { getSelectableFinancialAccounts } from "@/lib/payments";
import { db } from "@/services/drizzle";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PlanRestrictionComponent from "@/components/Layouts/PlanRestrictionComponent";
import EditSalePage from "./edit-sale-page";

export const metadata: Metadata = {
	title: "Editar Venda - POS",
	description: "Edição de venda confirmada",
};

export default async function EditSale({ params }: { params: Promise<{ saleId: string }> }) {
	const { saleId } = await params;
	const sessionUser = await getCurrentSession();
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	if (!sessionUser.membership.permissoes.vendas.editar) redirect(appRoutes.sales.root());

	if (sessionUser.membership.organizacao.configuracao.recursos.erp.acesso === false) {
		return (
			<PlanRestrictionComponent
				title="Acesso ao ERP"
				message="Este recurso está indisponível para sua organização. Faça um upgrade para desbloquear todo o potencial."
			/>
		);
	}

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
		<EditSalePage
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
