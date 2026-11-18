import { requireDashboardCapability } from "@/lib/access/guards";
import { canManageClientBase } from "@/lib/permissions/clients";
import { canExportClients } from "@/lib/permissions/sensitive-data";
import { redirect } from "next/navigation";
import SegmentsPage from "./segments-page";
import { db } from "@/services/drizzle";
import { utils } from "@/services/drizzle/schema";
import { and } from "drizzle-orm";
import { eq } from "drizzle-orm";

export default async function Segments() {
	const access = await requireDashboardCapability("segments");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");

	const orgId = sessionUser.membership?.organizacao.id;
	if (!orgId) redirect("/onboarding");

	const rfmConfig = await db.query.utils.findFirst({
		where: and(eq(utils.identificador, "CONFIG_RFM"), eq(utils.organizacaoId, orgId)),
	});
	const orgRFMConfig = rfmConfig?.valor.identificador === "CONFIG_RFM" ? rfmConfig.valor : null;
	return (
		<SegmentsPage
			user={sessionUser.user}
			orgRFMConfig={orgRFMConfig}
			canExportClients={canExportClients(sessionUser.membership?.permissoes)}
			canManageClientBase={canManageClientBase(sessionUser.membership?.permissoes)}
		/>
	);
}
