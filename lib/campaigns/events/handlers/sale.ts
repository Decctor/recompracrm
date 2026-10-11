import { campaigns, clients, sales, cashbackProgramTransactions } from "@/services/drizzle/schema";
import { and, eq, lte } from "drizzle-orm";
import { resolveCampaignAudiencesByCampaignId } from "@/lib/campaigns/filters";
import { canScheduleCampaignForClient, createEventCampaignDispatch, resolveTriggeredCampaigns } from "@/lib/campaigns/engine";
import { resolveEventDispatchScheduledAt } from "@/lib/campaigns/dispatch/schedule";
import { buildBasePurchaseInteractionMetadata } from "@/lib/campaigns/interaction-metadata";
import { getSaleCampaignEventDiscardReason, SALE_CAMPAIGN_EVENT_MAX_AGE_MS } from "./sale-policy";

import { SaleCampaignEventSnapshotSchema } from "@/schemas/sale-campaign-events";
import type { TSaleCampaignEventSnapshot } from "@/schemas/sale-campaign-events";
import { memoize, type TCampaignEventHandler, type TCampaignEventRecipientClient, type TCampaignEventRecipientValidationContext } from "../types";

const RECIPIENT_CLIENT_COLUMNS = { id: true, comunicacaoPausadaAte: true, analiseRFMTitulo: true, dataNascimento: true } as const;

async function resolveRecipientClient({
	executor,
	event,
	recipient,
	client,
}: Pick<
	TCampaignEventRecipientValidationContext<unknown>,
	"executor" | "event" | "recipient" | "client"
>): Promise<TCampaignEventRecipientClient | null> {
	if (client !== undefined) return client;
	return (
		(await executor.query.clients.findFirst({
			where: and(eq(clients.id, recipient.clienteId), eq(clients.organizacaoId, event.organizacaoId)),
			columns: RECIPIENT_CLIENT_COLUMNS,
		})) ?? null
	);
}

export const saleCampaignEventHandler: TCampaignEventHandler<TSaleCampaignEventSnapshot> = {
	parse: (payload) => SaleCampaignEventSnapshotSchema.parse(payload),
	process: processSaleEvent,
	validateRecipient: async (context) => {
		const { executor, event, payload, recipient, scheduledAt, now, memo } = context;
		const expired = now.getTime() - (scheduledAt ?? event.dataEvento).getTime() > SALE_CAMPAIGN_EVENT_MAX_AGE_MS;
		if (event.fonteTipo === "CLIENTE") {
			if (payload.origem !== "POI" || event.fonteId !== event.clienteId) return { motivo: "EVENTO_INVALIDO", erro: "Origem da transação inválida." };
			if (expired) return { motivo: "EVENTO_EXPIRADO", erro: "Evento expirado." };
			const client = await resolveRecipientClient(context);
			return !client
				? { motivo: "EVENTO_INVALIDO", erro: "Cliente não encontrado." }
				: client.comunicacaoPausadaAte && client.comunicacaoPausadaAte > now
					? { motivo: "COMUNICACAO_PAUSADA", erro: "Comunicação pausada." }
					: null;
		}
		if (event.fonteTipo === "TRANSACAO_CASHBACK") {
			const transaction = await memoize(memo, "transaction", () =>
				executor.query.cashbackProgramTransactions.findFirst({
					where: and(
						eq(cashbackProgramTransactions.id, event.fonteId),
						eq(cashbackProgramTransactions.organizacaoId, event.organizacaoId),
						eq(cashbackProgramTransactions.clienteId, event.clienteId ?? ""),
					),
					columns: { tipo: true, status: true },
				}),
			);
			if (!transaction || transaction.tipo === "CANCELAMENTO" || transaction.status === "EXPIRADO")
				return { motivo: "EVENTO_INVALIDO", erro: "Transação da ocorrência inválida." };
			if (expired) return { motivo: "EVENTO_EXPIRADO", erro: "Evento expirado." };
			const client = await resolveRecipientClient(context);
			if (!client) return { motivo: "EVENTO_INVALIDO", erro: "Cliente não encontrado." };
			return client.comunicacaoPausadaAte && client.comunicacaoPausadaAte > now ? { motivo: "COMUNICACAO_PAUSADA", erro: "Comunicação pausada." } : null;
		}
		const sale = await memoize(memo, "sale", async () => {
			const [row] = await executor
				.select({ clienteId: sales.clienteId, statusVenda: sales.statusVenda })
				.from(sales)
				.where(and(eq(sales.id, event.fonteId), eq(sales.organizacaoId, event.organizacaoId)));
			return row ?? null;
		});
		if (
			event.fonteTipo !== "VENDA" ||
			event.fonteId !== recipient.vendaId ||
			!sale ||
			(sale.statusVenda !== "CONFIRMADA" && !(payload.origem === "REGISTRO" && sale.statusVenda === null)) ||
			sale.clienteId !== event.clienteId
		) {
			return { motivo: "VENDA_INVALIDA", erro: "Venda cancelada, removida ou atribuída a outro cliente." };
		}
		const client = await resolveRecipientClient(context);
		if (!client) return { motivo: "VENDA_INVALIDA", erro: "Cliente da venda não encontrado." };
		if (client.comunicacaoPausadaAte && client.comunicacaoPausadaAte > now)
			return { motivo: "COMUNICACAO_PAUSADA", erro: "Comunicação com o cliente está pausada." };
		if (expired) return { motivo: "EVENTO_EXPIRADO", erro: "Janela de envio do evento expirou." };
		return null;
	},
};

async function processSaleEvent({ tx, event, payload, now }: Parameters<TCampaignEventHandler<TSaleCampaignEventSnapshot>["process"]>[0]) {
	if (!event.clienteId) return { dispatches: [], discardReason: "Evento de compra sem cliente." };
	if (
		event.fonteTipo !== "VENDA" &&
		event.fonteTipo !== "TRANSACAO_CASHBACK" &&
		!(event.fonteTipo === "CLIENTE" && payload.origem === "POI" && event.fonteId === event.clienteId)
	)
		return { dispatches: [], discardReason: "Fonte de compra inválida." };
	const [sale] = await tx
		.select({ clienteId: sales.clienteId, statusVenda: sales.statusVenda })
		.from(sales)
		.where(and(eq(sales.id, event.fonteId), eq(sales.organizacaoId, event.organizacaoId)))
		.for("share");
	const transaction =
		event.fonteTipo === "TRANSACAO_CASHBACK"
			? await tx.query.cashbackProgramTransactions.findFirst({
					where: and(
						eq(cashbackProgramTransactions.id, event.fonteId),
						eq(cashbackProgramTransactions.organizacaoId, event.organizacaoId),
						eq(cashbackProgramTransactions.clienteId, event.clienteId),
					),
				})
			: null;
	const reason =
		event.fonteTipo === "VENDA"
			? getSaleCampaignEventDiscardReason({ event, snapshot: payload, sale, now })
			: event.fonteTipo === "TRANSACAO_CASHBACK" && (!transaction || transaction.tipo === "CANCELAMENTO" || transaction.status === "EXPIRADO")
				? "Transação inválida."
				: now.getTime() - event.dataEvento.getTime() > SALE_CAMPAIGN_EVENT_MAX_AGE_MS
					? "Evento expirado."
					: null;
	if (reason) return { dispatches: [], discardReason: reason };
	const snapshot = payload;
	const activeCampaigns = await tx.query.campaigns.findMany({
		where: and(eq(campaigns.organizacaoId, event.organizacaoId), eq(campaigns.ativo, true), lte(campaigns.dataInsercao, event.dataEvento)),
		with: { segmentacoes: true },
	});
	const purchaseTypes = ["PRIMEIRA-COMPRA", "QUANTIDADE-TOTAL-COMPRAS", "VALOR-TOTAL-COMPRAS", "NOVA-COMPRA", "CASHBACK-ACUMULADO"];
	const eligibleCampaigns = activeCampaigns.filter(
		(campaign) =>
			purchaseTypes.includes(campaign.gatilhoTipo) &&
			(event.tipo === "COMPRA_CONFIRMADA" || campaign.gatilhoTipo === "CASHBACK-ACUMULADO") &&
			(campaign.segmentacoes.length === 0 || campaign.segmentacoes.some((segment) => segment.segmentacao === snapshot.segmentacao)),
	);
	// Segmentation is frozen; all other filters and communication pauses still use the shared resolver.
	const audiences = await resolveCampaignAudiencesByCampaignId({
		executor: tx,
		organizationId: event.organizacaoId,
		campaigns: eligibleCampaigns.map((campaign) => ({ ...campaign, segmentacoes: [] })),
		restrictToClientIds: [event.clienteId],
	});
	const triggered = resolveTriggeredCampaigns({
		campaigns: eligibleCampaigns,
		audiencesByCampaignId: audiences,
		sale: {
			clientId: event.clienteId,
			isFirstPurchase: snapshot.primeiraCompra ?? snapshot.comprasQuantidadeAnterior === 0,
			saleValue: snapshot.compraValor,
			previousTotalPurchaseCount: snapshot.contabilizarCompra === false ? null : snapshot.comprasQuantidadeAnterior,
			newTotalPurchaseCount: snapshot.contabilizarCompra === false ? null : snapshot.comprasQuantidadePosterior,
			previousTotalPurchaseValue: snapshot.contabilizarCompra === false ? null : snapshot.comprasValorAnterior,
			newTotalPurchaseValue: snapshot.contabilizarCompra === false ? null : snapshot.comprasValorPosterior,
			cashbackAccumulatedValue: snapshot.cashbackAcumulado,
			cashbackAvailableBalance: snapshot.cashbackSaldoDisponivel,
		},
	});
	const dispatches = [];
	for (const { campaign, grupo } of triggered) {
		if (!(await canScheduleCampaignForClient({ executor: tx, campaign, clientId: event.clienteId, now }))) continue;
		dispatches.push(
			await createEventCampaignDispatch({
				tx,
				organizationId: event.organizacaoId,
				campaign,
				janelaReferencia: snapshot.janelaReferencia ?? `venda:${event.fonteId}`,
				campanhaEventoId: event.id,
				scheduledAt: resolveEventDispatchScheduledAt({ campaign, now: event.dataEvento }),
				now,
				recipients: [
					{
						clienteId: event.clienteId,
						vendaId: event.fonteTipo === "VENDA" ? event.fonteId : null,
						campanhaEventoId: event.id,
						descricao: `Cliente se enquadrou no gatilho ${campaign.gatilhoTipo}.`,
						contexto: {
							...buildBasePurchaseInteractionMetadata({
								terminologia: snapshot.terminologia,
								saleValue: snapshot.compraValor,
								transactionAccumulatedCashback: snapshot.cashbackAcumulado,
								availableBalance: snapshot.cashbackSaldoDisponivel,
								accumulatedTotal: snapshot.cashbackTotalAcumulado,
								redeemedTotal: snapshot.cashbackTotalResgatado,
								sellerName: snapshot.vendedorNome,
								totalPurchaseCount: snapshot.contabilizarCompra === false ? undefined : snapshot.comprasQuantidadePosterior,
								totalPurchaseValue: snapshot.contabilizarCompra === false ? undefined : snapshot.comprasValorPosterior,
							}),
							...(grupo === "CASHBACK" ? { cashbackAcumuladoValor: snapshot.cashbackAcumulado } : {}),
						},
					},
				],
			}),
		);
	}
	return { dispatches };
}
