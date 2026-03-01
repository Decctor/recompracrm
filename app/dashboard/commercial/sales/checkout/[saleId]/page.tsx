import { getCurrentSession } from "@/lib/authentication/session";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CheckoutPage from "./checkout-page";

export const metadata: Metadata = {
	title: "Checkout - POS",
	description: "Finalização de venda",
};

export default async function Checkout({ params }: { params: Promise<{ saleId: string }> }) {
	const sessionUser = await getCurrentSession();
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");

	const { saleId } = await params;

	return <CheckoutPage user={sessionUser.user} membership={sessionUser.membership} saleId={saleId} />;
}
