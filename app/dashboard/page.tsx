import { getCurrentSession } from "@/lib/authentication/session";
import { resolveResultsScopeSellerIds } from "@/lib/permissions/results-scope";
import { redirect } from "next/navigation";
import { DashboardPage } from "./dashboard-page";

export default async function Main() {
	const authSession = await getCurrentSession();
	if (!authSession) redirect("/auth/signin");
	const membership = authSession.membership;
	if (!membership) redirect("/onboarding");

	// Toda organização vê o hub, com ou sem venda: sem nenhuma, o bloco de primeiros passos diz qual é a
	// primeira ação para o segmento dela (lib/onboarding/activation.ts). A tela genérica de "registre sua
	// primeira venda" ignorava a prontidão e oferecia "Configurar integração" a quem já estava importando.
	// `resultados.escopo` guarda ids de usuários; os filtros de vendedor trabalham com ids de vendedor.
	const scopeSellersIds = await resolveResultsScopeSellerIds({
		organizacaoId: membership.organizacao.id,
		resultsScope: membership.permissoes.resultados.escopo,
	});

	return <DashboardPage user={authSession.user} userOrg={membership.organizacao} membership={membership} scopeSellersIds={scopeSellersIds} />;
}
