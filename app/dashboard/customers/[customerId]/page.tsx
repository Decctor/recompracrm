import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { requireDashboardCapability } from "@/lib/access/guards";
import { canEditFinances, canViewFinances } from "@/lib/permissions/finances";
import { redirect } from "next/navigation";
import ClientPage from "./client-page";

export default async function Client({ params }: { params: Promise<{ customerId: string }> }) {
	const { customerId } = await params;
	if (!customerId) return <ErrorComponent msg="ID inválido" />;
	const access = await requireDashboardCapability("customers");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");
	const canReconcileClients = sessionUser.membership?.permissoes.empresa.editar ?? false;
	// O bloco de fiado é financeiro morando numa página de cliente: precisa do módulo E da permissão,
	// senão a aba COMPRAS vazaria saldo devedor para quem não pode ver o financeiro.
	const membership = sessionUser.membership;
	const canViewStoreCredit = !!membership?.organizacao.configuracao.recursos.erp.acesso && canViewFinances(membership?.permissoes);
	return (
		<ClientPage
			id={customerId}
			canReconcileClients={canReconcileClients}
			organizationId={membership?.organizacao.id ?? ""}
			canViewStoreCredit={canViewStoreCredit}
			canReceiveStoreCredit={canViewStoreCredit && canEditFinances(membership?.permissoes)}
		/>
	);
}
