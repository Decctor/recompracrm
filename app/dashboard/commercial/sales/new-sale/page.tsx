import { getCurrentSession } from "@/lib/authentication/session";
import { db } from "@/services/drizzle";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import NewSalePage from "./new-sale-page";

export const metadata: Metadata = {
	title: "Nova Venda - POS",
	description: "Sistema de Ponto de Venda",
};

export default async function NewSale() {
	const sessionUser = await getCurrentSession();
	if (!sessionUser) redirect("/auth/signin");
	if (!sessionUser.membership) redirect("/onboarding");

	return redirect("/dashboard/commercial");
	// DISABLED FOR NOW
	// const organizationId = sessionUser.membership.organizacao.id;
	// const organizationCashbackProgram = await db.query.cashbackPrograms.findFirst({
	// 	where: (fields, { eq }) => eq(fields.organizacaoId, organizationId),
	// });
	// return <NewSalePage organizationCashbackProgram={organizationCashbackProgram ?? null} />;
}
