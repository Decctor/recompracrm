import { getCurrentSession } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import { platformPartners } from "@/services/drizzle/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PLATFORM_PARTNER_MAIN_APP_HREF } from "@/lib/platform-partnerships/constants";
import PartnerOnboardingPage from "./partner-onboarding-page";

export default async function PartnerOnboarding() {
	const session = await getCurrentSession();
	if (!session) redirect(`/auth/signin?redirectTo=${encodeURIComponent("/partner-dashboard/onboarding")}`);

	// Quem já enviou (em análise ou não aprovado) volta para revisar com os dados preenchidos; ativo vai ao painel.
	const partner = await db.query.platformPartners.findFirst({
		where: eq(platformPartners.usuarioId, session.user.id),
		columns: {
			status: true,
			nome: true,
			email: true,
			telefone: true,
			tipoPessoa: true,
			cpfCnpj: true,
			chavePix: true,
			chavePixTipo: true,
			arquivos: true,
		},
	});
	if (partner?.status === "ATIVO") redirect("/partner-dashboard");

	return (
		<PartnerOnboardingPage
			user={session.user}
			existingPartner={partner ?? null}
			mainAppHref={session.membership ? PLATFORM_PARTNER_MAIN_APP_HREF : null}
		/>
	);
}
