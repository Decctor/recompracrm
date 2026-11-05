import { getCurrentSession } from "@/lib/authentication/session";
import { canConfigureSales } from "@/lib/permissions/sales";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ShopPage from "./shop-page";

export const metadata: Metadata = {
	title: "Loja Digital",
	description: "Configure sua loja digital",
};

export default async function Shop() {
	const sessionUser = await getCurrentSession();
	if (!sessionUser) redirect("/auth/signin");

	const userOrg = sessionUser.membership?.organizacao;
	if (!userOrg) redirect("/dashboard");

	return <ShopPage slug={userOrg.slug} canConfigure={canConfigureSales(sessionUser.membership?.permissoes)} />;
}
