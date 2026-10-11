import type { DBTransaction } from "@/services/drizzle";
import { clients, sales, cashbackPrograms, cashbackProgramBalances } from "@/services/drizzle/schema";
import { getValidClientSaleWhere } from "@/lib/sales/valid-sale";
import type { accumulateCashbackForClient } from "@/lib/cashback/accumulation";
import { and, eq, ne, sql } from "drizzle-orm";
import { isCampaignEventCaptureEnabled } from "../policy";
import { recordCampaignEvent } from "../record";

type TAccumulation = Awaited<ReturnType<typeof accumulateCashbackForClient>>;

/** Called under the confirmation's existing customer-history lock, in its transaction. */
export async function captureSaleCampaignEvent({
	tx,
	organizationId,
	saleId,
	clientId,
	occurredAt,
	accumulation,
	programId,
	type = "COMPRA",
	enabled = isCampaignEventCaptureEnabled(organizationId),
}: {
	tx: DBTransaction;
	organizationId: string;
	saleId: string;
	clientId: string | null;
	occurredAt: Date;
	accumulation: TAccumulation | null;
	programId?: string | null;
	type?: "COMPRA" | "CASHBACK_ACUMULADO";
	enabled?: boolean;
}) {
	if (!enabled || !clientId) return;
	if (type === "CASHBACK_ACUMULADO" && (!accumulation?.transactionId || accumulation.alreadyProcessed || accumulation.accumulatedValue <= 0)) return;
	const sale = await tx.query.sales.findFirst({
		where: and(eq(sales.id, saleId), eq(sales.organizacaoId, organizationId)),
		columns: { valorTotal: true, vendedorNome: true, clienteId: true, statusVenda: true, processamentoOrigem: true },
	});
	if (!sale || sale.statusVenda !== "CONFIRMADA" || sale.clienteId !== clientId || sale.valorTotal <= 0) return;
	if (type === "CASHBACK_ACUMULADO" && sale.processamentoOrigem !== "INTERNO") return;
	const client = await tx.query.clients.findFirst({
		where: and(eq(clients.id, clientId), eq(clients.organizacaoId, organizationId)),
		columns: { analiseRFMTitulo: true },
	});
	if (!client) return;
	const [history] = await tx
		.select({
			quantidade: sql<number>`count(*)::integer`,
			valor: sql<number>`coalesce(sum(${sales.valorTotal}), 0)`.mapWith(Number),
		})
		.from(sales)
		.where(and(getValidClientSaleWhere({ orgId: organizationId, clientId }), ne(sales.id, saleId)));
	const program = await tx.query.cashbackPrograms.findFirst({
		where: and(
			eq(cashbackPrograms.organizacaoId, organizationId),
			eq(cashbackPrograms.ativo, true),
			programId ? eq(cashbackPrograms.id, programId) : undefined,
		),
		columns: { id: true, terminologia: true },
	});
	const balance =
		program && !accumulation
			? await tx.query.cashbackProgramBalances.findFirst({
					where: and(
						eq(cashbackProgramBalances.organizacaoId, organizationId),
						eq(cashbackProgramBalances.clienteId, clientId),
						eq(cashbackProgramBalances.programaId, program.id),
					),
					columns: { saldoValorDisponivel: true, saldoValorAcumuladoTotal: true },
				})
			: null;
	return recordCampaignEvent({
		tx,
		input: {
			organizacaoId: organizationId,
			fonteTipo: "VENDA",
			fonteId: saleId,
			clienteId: clientId,
			tipo: type === "COMPRA" ? "COMPRA_CONFIRMADA" : "CASHBACK_ACUMULADO",
			versao: 1,
			chaveIdempotencia: type === "COMPRA" ? `compra:${saleId}` : `cashback:${accumulation!.transactionId}`,
			dataEvento: occurredAt,
			contexto: {
				compraValor: sale.valorTotal,
				comprasQuantidadeAnterior: history?.quantidade ?? 0,
				comprasQuantidadePosterior: (history?.quantidade ?? 0) + 1,
				comprasValorAnterior: history?.valor ?? 0,
				comprasValorPosterior: (history?.valor ?? 0) + sale.valorTotal,
				segmentacao: client.analiseRFMTitulo,
				vendedorNome: sale.vendedorNome,
				terminologia: program?.terminologia ?? "DINHEIRO",
				cashbackAcumulado: accumulation && !accumulation.alreadyProcessed ? accumulation.accumulatedValue : 0,
				cashbackSaldoDisponivel: accumulation?.newAvailableBalance ?? balance?.saldoValorDisponivel ?? 0,
				cashbackTotalAcumulado: accumulation?.newAccumulatedBalance ?? balance?.saldoValorAcumuladoTotal ?? 0,
			},
		},
	});
}
