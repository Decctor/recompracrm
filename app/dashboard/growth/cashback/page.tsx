import { requireDashboardCapability } from "@/lib/access/guards";
import { canConfigureCashback } from "@/lib/permissions/cashback";
import { db } from "@/services/drizzle";
import { redirect } from "next/navigation";
import CashbackProgramsPage from "./control-cashback-programs-page";
import NewCashbackProgramsPage from "./new-cashback-programs-page";

export default async function CashbackPrograms() {
	const access = await requireDashboardCapability("cashback");
	if (access.unauthorized) return access.unauthorized;
	const sessionUser = access.sessionUser;
	if (!sessionUser) redirect("/auth/signin");

	const userOrg = sessionUser.membership?.organizacao;
	if (!userOrg) redirect("/dashboard");

	const cashbackProgram = await db.query.cashbackPrograms.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, userOrg.id),
		with: {
			recompensas: {
				with: {
					produto: {
						columns: {
							grupo: true,
							precoVenda: true,
						},
					},
					produtoVariante: {
						columns: {
							precoVenda: true,
						},
					},
				},
			},
		},
	});
	const canConfigure = canConfigureCashback(sessionUser.membership?.permissoes);
	if (!cashbackProgram) return <NewCashbackProgramsPage user={sessionUser.user} userOrg={userOrg} canConfigure={canConfigure} />;
	return <CashbackProgramsPage userOrg={userOrg} cashbackProgram={cashbackProgram} canConfigure={canConfigure} />;
}
