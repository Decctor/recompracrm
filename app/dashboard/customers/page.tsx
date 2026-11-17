import ClientsEmptyState from "@/components/Clients/ClientsEmptyState";
import { requireDashboardCapability } from "@/lib/access/guards";
import { canExportClients } from "@/lib/permissions/sensitive-data";
import { db } from "@/services/drizzle";
import { redirect } from "next/navigation";
import ClientsPage from "./clients-page";

export default async function CommercialClients() {
	const access = await requireDashboardCapability("customers");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");

	const orgId = sessionUser.membership?.organizacao.id;
	if (!orgId) redirect("/onboarding");

	// Check if the organization has any clients
	const firstClient = await db.query.clients.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, orgId),
		columns: { id: true },
	});
	const hasClients = !!firstClient;

	if (!hasClients) {
		return <ClientsEmptyState />;
	}

	const canReconcileClients = sessionUser.membership?.permissoes.empresa.editar ?? false;
	return (
		<ClientsPage
			user={sessionUser.user}
			canReconcileClients={canReconcileClients}
			canExportClients={canExportClients(sessionUser.membership?.permissoes)}
		/>
	);
}
