import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import { assertCanViewClients } from "@/lib/clients/access";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import {
	cashbackProgramBalances,
	cashbackProgramTransactions,
	chats,
	clientDuplicateCandidates,
	clients,
	couponGrants,
	couponRedemptions,
	interactions,
	sales,
	tabs,
} from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Dois modos: `pairId` (par da fila) ou `clientIds` (dois clientes escolhidos à mão no menu de
// mesclagem, que podem nem ter par). O par manual não é criado só por abrir a comparação: a fila
// não pode encher de pares que o usuário olhou e fechou.
const GetClientDuplicateComparisonInputSchema = z
	.object({
		pairId: z.string({ invalid_type_error: "Tipo não válido para o ID do par de duplicidade." }).optional().nullable(),
		clientIds: z
			.string({ invalid_type_error: "Tipo não válido para os IDs dos clientes." })
			.optional()
			.nullable()
			.transform((v) => (v ? v.split(",").filter(Boolean) : [])),
	})
	.refine((input) => !!input.pairId || (input.clientIds.length === 2 && input.clientIds[0] !== input.clientIds[1]), {
		message: "Informe o par de duplicidade ou dois clientes diferentes.",
	});
export type TGetClientDuplicateComparisonInput = z.infer<typeof GetClientDuplicateComparisonInputSchema>;

async function countLinkedRecords({ organizacaoId, clienteId }: { organizacaoId: string; clienteId: string }) {
	async function countFor(table: typeof sales): Promise<number> {
		const [{ count } = { count: 0 }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(table)
			.where(and(eq(table.organizacaoId, organizacaoId), eq(table.clienteId, clienteId)));
		return count;
	}

	const [{ totalComprado } = { totalComprado: 0 }] = await db
		.select({ totalComprado: sql<number>`coalesce(sum(${sales.valorTotal}), 0)` })
		.from(sales)
		.where(and(eq(sales.organizacaoId, organizacaoId), eq(sales.clienteId, clienteId), eq(sales.statusVenda, "CONFIRMADA")));

	return {
		vendas: await countFor(sales),
		valorTotalComprado: totalComprado,
		conversas: await countFor(chats as unknown as typeof sales),
		interacoes: await countFor(interactions as unknown as typeof sales),
		cuponsAtribuidos: await countFor(couponGrants as unknown as typeof sales),
		cuponsResgatados: await countFor(couponRedemptions as unknown as typeof sales),
		comandas: await countFor(tabs as unknown as typeof sales),
	};
}

async function getCashbackBalances({ organizacaoId, clienteId }: { organizacaoId: string; clienteId: string }) {
	const balances = await db.query.cashbackProgramBalances.findMany({
		where: and(eq(cashbackProgramBalances.organizacaoId, organizacaoId), eq(cashbackProgramBalances.clienteId, clienteId)),
		with: { programa: { columns: { id: true, titulo: true, terminologia: true } } },
	});
	return balances.map((balance) => ({
		programaId: balance.programaId,
		programaTitulo: balance.programa?.titulo ?? "Programa de cashback",
		programaTerminologia: balance.programa?.terminologia ?? "DINHEIRO",
		saldoValorDisponivel: balance.saldoValorDisponivel,
		saldoValorAcumuladoTotal: balance.saldoValorAcumuladoTotal,
		saldoValorResgatadoTotal: balance.saldoValorResgatadoTotal,
		dataAdesao: balance.dataAdesao,
	}));
}

async function resolveComparisonTarget({ input, organizacaoId }: { input: TGetClientDuplicateComparisonInput; organizacaoId: string }) {
	if (input.pairId) {
		const pair = await db.query.clientDuplicateCandidates.findFirst({
			where: and(eq(clientDuplicateCandidates.id, input.pairId), eq(clientDuplicateCandidates.organizacaoId, organizacaoId)),
			with: { clienteA: true, clienteB: true },
		});
		if (!pair || !pair.clienteA || !pair.clienteB) throw new createHttpError.NotFound("Par de duplicidade não encontrado.");
		return { pair, clienteA: pair.clienteA, clienteB: pair.clienteB };
	}

	const [clienteXId, clienteYId] = input.clientIds as [string, string];
	const [clienteA, clienteB] = await Promise.all(
		[clienteXId, clienteYId].map((clienteId) =>
			db.query.clients.findFirst({ where: and(eq(clients.id, clienteId), eq(clients.organizacaoId, organizacaoId)) }),
		),
	);
	if (!clienteA || !clienteB) throw new createHttpError.NotFound("Cliente não encontrado.");
	// O par pode já existir (pendente ou descartado): os motivos dele ainda informam a comparação.
	const [pairAId, pairBId] = clienteXId < clienteYId ? [clienteXId, clienteYId] : [clienteYId, clienteXId];
	const pair = await db.query.clientDuplicateCandidates.findFirst({
		where: and(
			eq(clientDuplicateCandidates.organizacaoId, organizacaoId),
			eq(clientDuplicateCandidates.clienteAId, pairAId),
			eq(clientDuplicateCandidates.clienteBId, pairBId),
		),
	});
	return { pair: pair ?? null, clienteA, clienteB };
}

async function getClientDuplicateComparison({ input, session }: { input: TGetClientDuplicateComparisonInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const { pair, clienteA, clienteB } = await resolveComparisonTarget({ input, organizacaoId });

	const [countsA, countsB, cashbackA, cashbackB] = await Promise.all([
		countLinkedRecords({ organizacaoId, clienteId: clienteA.id }),
		countLinkedRecords({ organizacaoId, clienteId: clienteB.id }),
		getCashbackBalances({ organizacaoId, clienteId: clienteA.id }),
		getCashbackBalances({ organizacaoId, clienteId: clienteB.id }),
	]);

	// Alerta: acúmulo dos DOIS lados na MESMA venda quase sempre significa
	// comprador × parceiro — duas pessoas reais, sinal de descarte, não de merge.
	const otherSideTransactions = alias(cashbackProgramTransactions, "other_side_transactions");
	const [{ sharedSaleAccumulations } = { sharedSaleAccumulations: 0 }] = await db
		.select({ sharedSaleAccumulations: sql<number>`count(*)::int` })
		.from(cashbackProgramTransactions)
		.innerJoin(
			otherSideTransactions,
			and(
				eq(cashbackProgramTransactions.vendaId, otherSideTransactions.vendaId),
				eq(otherSideTransactions.clienteId, clienteB.id),
				eq(otherSideTransactions.tipo, "ACÚMULO"),
			),
		)
		.where(
			and(
				eq(cashbackProgramTransactions.organizacaoId, organizacaoId),
				eq(cashbackProgramTransactions.clienteId, clienteA.id),
				eq(cashbackProgramTransactions.tipo, "ACÚMULO"),
				sql`${cashbackProgramTransactions.vendaId} is not null`,
			),
		);

	const cpfCnpjA = clienteA.cpfCnpj?.replace(/\D/g, "") ?? "";
	const cpfCnpjB = clienteB.cpfCnpj?.replace(/\D/g, "") ?? "";

	return {
		data: {
			/** Nulo quando os dois clientes foram escolhidos à mão e ainda não formam um par. */
			id: pair?.id ?? null,
			status: pair?.status ?? null,
			motivos: pair?.motivos ?? [],
			clienteA: { ...clienteA, registros: countsA, saldosCashback: cashbackA },
			clienteB: { ...clienteB, registros: countsB, saldosCashback: cashbackB },
			alerts: {
				// Estas flags viram avisos acima do botão de mesclar na UI.
				acumuloNaMesmaVenda: sharedSaleAccumulations > 0,
				cpfCnpjDivergentes: !!cpfCnpjA && !!cpfCnpjB && cpfCnpjA !== cpfCnpjB,
			},
		},
		message: "Comparação carregada.",
	};
}
export type TGetClientDuplicateComparisonOutput = Awaited<ReturnType<typeof getClientDuplicateComparison>>;

async function getClientDuplicateComparisonRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	assertCanViewClients(session);

	const searchParams = request.nextUrl.searchParams;
	const input = GetClientDuplicateComparisonInputSchema.parse({ pairId: searchParams.get("pairId"), clientIds: searchParams.get("clientIds") });
	const result = await getClientDuplicateComparison({ input, session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getClientDuplicateComparisonRoute });
