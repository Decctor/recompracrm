import { getCurrentSession } from "@/lib/authentication/session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SubscriptionPage from "./subscription-page";

export const metadata: Metadata = {
	title: "Assinatura",
	robots: { index: false, follow: false },
};

/**
 * Página de assinatura — o destino de quem está bloqueado por falta de plano. Vive fora de
 * `app/dashboard` de propósito: o antigo paywall era um overlay renderizado dentro do layout do
 * dashboard, então a aplicação inteira montava e disparava as queries por trás do scrim, para uma
 * organização que não está pagando. Aqui nada do app monta, e o bloqueio deixa de ser cosmético
 * (o overlay dependia de um fetch no cliente e podia ser removido pelo devtools).
 */
export default async function Page() {
	const session = await getCurrentSession();
	if (!session) redirect("/auth/signin");
	if (!session.membership) redirect("/onboarding");
	if (!session.membership.organizacao.dataOnboardingConclusao) redirect("/onboarding");
	// Quem tem acesso não tem o que fazer aqui — evita virar um beco sem saída depois do pagamento.
	if (session.membership.organizacao.assinaturaAtiva) redirect("/dashboard");

	return <SubscriptionPage isPlatformAdmin={session.user.admin === true} />;
}
