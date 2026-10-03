import { requireDashboardCapability } from "@/lib/access/guards";
import { resolveVisualKitBrand } from "@/lib/visual-kits/brand";
import { redirect } from "next/navigation";
import KitBuilder from "../_module/builder/kit-builder";

export default async function NewVisualKit() {
	const { sessionUser, unauthorized } = await requireDashboardCapability("visualKits");
	if (unauthorized) return unauthorized;
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");
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
