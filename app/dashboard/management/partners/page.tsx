import { getCurrentSession } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { redirect } from "next/navigation";
import PartnersPage from "./partners-page";

type PartnersPageProps = {
	user: TAuthUserSession["user"];
};
export default async function Partners({ user }: PartnersPageProps) {
	const sessionUser = await getCurrentSession();
	if (!sessionUser) redirect("/auth/signin");
	return <PartnersPage user={sessionUser.user} canEditPartners={sessionUser.membership?.permissoes.empresa.editar ?? false} />;
}
