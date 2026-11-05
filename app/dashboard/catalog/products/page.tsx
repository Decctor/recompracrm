import { requireDashboardCapability } from "@/lib/access/guards";
import { redirect } from "next/navigation";
import ProductsPage from "./products-page";

export default async function Products() {
	const { sessionUser, unauthorized } = await requireDashboardCapability("products");
	if (unauthorized) return unauthorized;
	if (!sessionUser) redirect("/auth/signin");

	const userMembership = sessionUser.membership;
	if (!userMembership) redirect("/onboarding");
	const userOrg = userMembership.organizacao;

	return <ProductsPage user={sessionUser.user} userOrg={userOrg} userMembership={userMembership} />;
}
