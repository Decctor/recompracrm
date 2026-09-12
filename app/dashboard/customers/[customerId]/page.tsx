import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { requireDashboardCapability } from "@/lib/access/guards";
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
	return <ClientPage id={customerId} canReconcileClients={canReconcileClients} />;
}
