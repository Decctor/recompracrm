import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { appApiHandler } from "@/lib/app-api";
import { PAYMENT_TERMINAL_CLIENT_CODE, PAYMENT_TERMINAL_ONLINE_WINDOW_MS } from "@/lib/payment-attempts";
import { db } from "@/services/drizzle";
import { accessClients, accessPrincipals } from "@/services/drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

// Terminais de pagamento (maquininhas com o RecompraCRM POS) da organização, para o bloco de
// pagamento do checkout. Todos os ativos voltam, com `online` derivado do heartbeat: o operador
// vê o terminal desligado em vez de procurar por que ele sumiu da lista.
async function getPaymentTerminals({ organizationId }: { organizationId: string }) {
	const now = Date.now();
	const rows = await db
		.select({ id: accessPrincipals.id, nome: accessPrincipals.nome, ultimoAcesso: accessPrincipals.ultimoAcesso, metadados: accessPrincipals.metadados })
		.from(accessPrincipals)
		.innerJoin(accessClients, eq(accessClients.id, accessPrincipals.accessClientId))
		.where(
			and(
				eq(accessPrincipals.organizacaoId, organizationId),
				eq(accessPrincipals.tipo, "DISPOSITIVO"),
				eq(accessPrincipals.status, "ATIVO"),
				eq(accessClients.codigo, PAYMENT_TERMINAL_CLIENT_CODE),
			),
		)
		.orderBy(desc(accessPrincipals.ultimoAcesso), accessPrincipals.nome);

	const terminals = rows.map((row) => ({
		id: row.id,
		nome: row.nome,
		ultimoAcesso: row.ultimoAcesso,
		online: row.ultimoAcesso ? now - row.ultimoAcesso.getTime() <= PAYMENT_TERMINAL_ONLINE_WINDOW_MS : false,
		versaoApp: typeof row.metadados?.versaoApp === "string" ? row.metadados.versaoApp : null,
	}));

	return { data: { terminals }, message: "Terminais de pagamento listados com sucesso." };
}
export type TGetPaymentTerminalsOutput = Awaited<ReturnType<typeof getPaymentTerminals>>;
export type TPaymentTerminalListItem = TGetPaymentTerminalsOutput["data"]["terminals"][number];

async function getPaymentTerminalsRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	if (!session.membership.permissoes.vendas.criar && !session.membership.permissoes.vendas.visualizar) {
		throw new createHttpError.Forbidden("Você não tem permissão para acessar o PDV.");
	}
	const result = await getPaymentTerminals({ organizationId: session.membership.organizacao.id });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getPaymentTerminalsRoute });
