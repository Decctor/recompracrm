import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { OrgColorsProvider } from "@/components/Providers/OrgColorsProvider";
import { db } from "@/services/drizzle";
import { cashbackProgramBalances, cashbackProgramTransactions } from "@/services/drizzle/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import ClientProfileContent from "./client-profile-content";

export default async function ClientProfilePage({ params }: { params: Promise<{ orgId: string; clientId: string }> }) {
	const { orgId, clientId } = await params;

	if (!orgId || !clientId) {
		return <ErrorComponent msg="Oops, parâmetro inválido." />;
	}

	// Fetch organization
	const org = await db.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
		columns: {
			id: true,
			cnpj: true,
			nome: true,
			logoUrl: true,
			telefone: true,
			corPrimaria: true,
			corPrimariaForeground: true,
			corSecundaria: true,
			corSecundariaForeground: true,
		},
	});

	if (!org) {
		return <ErrorComponent msg="Organização não encontrada" />;
	}
	const cashbackProgram = await db.query.cashbackPrograms.findFirst({
		where: (fields, { eq }) => eq(fields.organizacaoId, orgId),
	});
	if (!cashbackProgram) {
		return <ErrorComponent msg="Programa de cashback não encontrado" />;
	}

	// Fetch client with balance
	const client = await db.query.clients.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, clientId), eq(fields.organizacaoId, orgId)),
		columns: {
			id: true,
			nome: true,
			telefone: true,
			email: true,
			dataInsercao: true,
			metadataTotalCompras: true,
			metadataValorTotalCompras: true,
			ultimaCompraData: true,
		},
	});

	if (!client) {
		return <ErrorComponent msg="Cliente não encontrado" />;
	}

	// Fetch cashback balance
	const balance = await db.query.cashbackProgramBalances.findFirst({
		where: and(eq(cashbackProgramBalances.clienteId, clientId), eq(cashbackProgramBalances.organizacaoId, orgId)),
		columns: {
			saldoValorDisponivel: true,
			saldoValorAcumuladoTotal: true,
			saldoValorResgatadoTotal: true,
		},
	});

	if (!balance) {
		return <ErrorComponent msg="Saldo de cashback não encontrado para este cliente." />;
	}

	// Calculate ranking position (count clients with higher accumulated balance)
	const clientsWithHigherBalance = await db
		.select({ count: eq(cashbackProgramBalances.organizacaoId, orgId) })
		.from(cashbackProgramBalances)
		.where(
			and(
				eq(cashbackProgramBalances.organizacaoId, orgId),
				eq(cashbackProgramBalances.programaId, cashbackProgram.id),
				gt(cashbackProgramBalances.saldoValorAcumuladoTotal, balance.saldoValorAcumuladoTotal),
			),
		);

	const rankingPosition = (clientsWithHigherBalance.length || 0) + 1;

	// Fetch transaction history
	const transactions = await db.query.cashbackProgramTransactions.findMany({
		where: and(eq(cashbackProgramTransactions.clienteId, clientId), eq(cashbackProgramTransactions.organizacaoId, orgId)),
		columns: {
			id: true,
			tipo: true,
			status: true,
			valor: true,
			valorRestante: true,
			dataInsercao: true,
			saldoValorPosterior: true,
			expiracaoData: true,
		},
		orderBy: [desc(cashbackProgramTransactions.dataInsercao)],
		limit: 50,
	});

	return (
		<OrgColorsProvider
			corPrimaria={org.corPrimaria}
			corPrimariaForeground={org.corPrimariaForeground}
			corSecundaria={org.corSecundaria}
			corSecundariaForeground={org.corSecundariaForeground}
		>
			<ClientProfileContent
				orgId={orgId}
				cashbackProgram={cashbackProgram}
				client={client}
				balance={balance}
				rankingPosition={rankingPosition}
				transactions={transactions}
			/>
		</OrgColorsProvider>
	);
}
