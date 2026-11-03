import SalesEmptyState from "@/components/Sales/SalesEmptyState";
import { getCurrentSession } from "@/lib/authentication/session";
import { resolveResultsScopeSellerIds } from "@/lib/permissions/results-scope";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { db } from "@/services/drizzle";
import { redirect } from "next/navigation";
import { DashboardPage } from "./dashboard-page";

export default async function Main() {
	const authSession = await getCurrentSession();
	if (!authSession) redirect("/auth/signin");
	const membership = authSession.membership;
	if (!membership) redirect("/onboarding");

	// Sem ERP, a única coisa que alimenta o dashboard são vendas: sem nenhuma, o convite para registrar
	// a primeira vale mais que uma grade de widgets vazios. Com ERP, compras e estoque já têm o que mostrar.
	const hasErpAccess = membership.organizacao.configuracao.recursos.erp.acesso;
	// Independent reads, started together: the first-sale probe only matters without ERP, and the
	// scope translation is needed whenever the dashboard renders.
	const [firstSale, scopeSellersIds] = await Promise.all([
		hasErpAccess
			? null
			: db.query.sales.findFirst({
					where: (fields, { eq }) => eq(fields.organizacaoId, membership.organizacao.id),
					columns: { id: true },
				}),
		// `resultados.escopo` guarda ids de usuários; os filtros de vendedor trabalham com ids de vendedor.
		resolveResultsScopeSellerIds({
			organizacaoId: membership.organizacao.id,
			resultsScope: membership.permissoes.resultados.escopo,
		}),
	]);
	if (!hasErpAccess && !firstSale) {
		return (
			<SalesEmptyState
				organizationId={membership.organizacao.id}
				organizationConfig={membership.organizacao.configuracao as TOrganizationConfiguration}
			/>
		);
	}

	return <DashboardPage user={authSession.user} userOrg={membership.organizacao} membership={membership} scopeSellersIds={scopeSellersIds} />;
}
