import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { canManageClientBase, canViewClients } from "@/lib/permissions/clients";
import { requireDashboardCapability } from "@/lib/access/guards";
import { canViewFinances } from "@/lib/permissions/finances";
import { redirect } from "next/navigation";
import SaleByIdPage from "./sale-by-id-page";

export default async function SalePage({ params }: { params: Promise<{ saleId: string }> }) {
	const { saleId } = await params;
	const id = saleId;
	if (!id) return <ErrorComponent msg="ID inválido" />;
	const access = await requireDashboardCapability("sales");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership?.organizacao) redirect("/onboarding");

	const orgHasERPAccess = sessionUser.membership.organizacao.configuracao.recursos.erp.acesso;
	const userHasFiscalViewPermission = sessionUser.membership.permissoes.fiscal.visualizar;
	const userHasFiscalConfigurePermission = sessionUser.membership.permissoes.fiscal.configurar;
	const userHasFiscalEmitPermission = sessionUser.membership.permissoes.fiscal.emitir;
	const userHasFiscalCancelPermission = sessionUser.membership.permissoes.fiscal.cancelar;
	const userCanDeleteSales = sessionUser.membership.permissoes.vendas.excluir;
	const userCanEditSales = sessionUser.membership.permissoes.vendas.editar;
	const userCanReconcileClients = canManageClientBase(sessionUser.membership.permissoes);
	const userCanViewClients = canViewClients(sessionUser.membership.permissoes);
	// Só para decidir se o pagamento vira link para o lançamento contábil: a seção de pagamentos
	// aparece com o módulo de ERP, mas `/dashboard/finance/entries` exige permissão do financeiro.
	const userCanViewFinances = canViewFinances(sessionUser.membership.permissoes);
	return (
		<SaleByIdPage
			saleId={saleId}
			orgHasERPAccess={orgHasERPAccess}
			userCanDeleteSales={userCanDeleteSales}
			userCanEditSales={userCanEditSales}
			userCanReconcileClients={userCanReconcileClients}
			userCanViewClients={userCanViewClients}
			userCanViewFinances={userCanViewFinances}
			userFiscalPermissions={{
				view: userHasFiscalViewPermission,
				configure: userHasFiscalConfigurePermission,
				emit: userHasFiscalEmitPermission,
				cancel: userHasFiscalCancelPermission,
			}}
		/>
	);
}
