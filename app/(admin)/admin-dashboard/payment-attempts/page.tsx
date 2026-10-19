import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import PaymentAttemptsAdminPage from "./payment-attempts-page";

export default async function PaymentAttemptsAdmin() {
	const session = await getCurrentSession();
	if (!session) redirect("/auth/signin");
	if (!session.user.admin) redirect("/dashboard");

	return <PaymentAttemptsAdminPage />;
}
