import { requireDashboardCapability } from "@/lib/access/guards";
import { resolveVisualKitBrand } from "@/lib/visual-kits/brand";
import { canEditCommunication } from "@/lib/permissions/communication";
import { appRoutes } from "@/lib/navigation/routes";
import { redirect } from "next/navigation";
import KitBuilder from "../_module/builder/kit-builder";

export default async function NewVisualKit() {
	const { sessionUser, unauthorized } = await requireDashboardCapability("visualKits");
	if (unauthorized) return unauthorized;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	// O construtor salva a cada etapa: sem comunicacao.editar não há o que fazer nele (a API recusaria).
	if (!canEditCommunication(sessionUser.membership.permissoes)) redirect(appRoutes.channels.visualKits());
	const organization = sessionUser.membership.organizacao;
	return (
		<KitBuilder
			kitId={null}
			// Kit novo sempre começa nas peças: as etapas seguintes dependem delas.
			initialStage="pieces"
			brand={resolveVisualKitBrand(organization)}
			orgHasERPAccess={organization.configuracao.recursos.erp.acesso}
		/>
	);
}
