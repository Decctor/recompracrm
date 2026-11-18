import { requireDashboardCapability } from "@/lib/access/guards";
import { resolveVisualKitBrand } from "@/lib/visual-kits/brand";
import { canEditCommunication } from "@/lib/permissions/communication";
import { appRoutes } from "@/lib/navigation/routes";
import { redirect } from "next/navigation";
import KitBuilderLoader from "../_module/builder/kit-builder-loader";
import { isKitStageId } from "../_module/builder/stages";

export default async function VisualKitBuilderPage({
	params,
	searchParams,
}: {
	params: Promise<{ kitId: string }>;
	searchParams: Promise<{ stage?: string }>;
}) {
	const { sessionUser, unauthorized } = await requireDashboardCapability("visualKits");
	if (unauthorized) return unauthorized;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
	// O construtor salva a cada etapa: sem comunicacao.editar não há o que fazer nele (a API recusaria).
	if (!canEditCommunication(sessionUser.membership.permissoes)) redirect(appRoutes.channels.visualKits());
	const [{ kitId }, { stage }] = await Promise.all([params, searchParams]);
	const organization = sessionUser.membership.organizacao;
	return (
		<KitBuilderLoader
			kitId={kitId}
			// Kit existente abre direto no Visual: é onde se confere e ajusta as peças já montadas.
			initialStage={isKitStageId(stage) ? stage : "visual"}
			brand={resolveVisualKitBrand(organization)}
			orgHasERPAccess={organization.configuracao.recursos.erp.acesso}
		/>
	);
}
