import type { DBTransaction } from "@/services/drizzle";
import { campaignConversions, campaigns, interactions, sales } from "@/services/drizzle/schema";
import type { TConversionTypeEnum } from "@/schemas/enums";
import dayjs from "dayjs";
import { and, eq, inArray, isNotNull, lt, lte } from "drizzle-orm";
import { CAMPAIGN_SENT_INTERACTION_STATUSES } from "../campaigns/utils";

interface AttributionParams {
	vendaId: string;
	clienteId: string;
	organizacaoId: string;
	valorVenda: number;
	dataVenda: Date;
}

interface ClientProfileSnapshot {
	ticketMedio: number | null;
	cicloCompraMedio: number | null; // in days
	qtdeCompras: number;
	cicloCompraConfiavel: boolean;
	diasDesdeUltimaCompra: number | null;
	tipoConversao: TConversionTypeEnum;
	deltaFrequencia: number | null;
	deltaMonetarioAbsoluto: number | null;
	deltaMonetarioPercentual: number | null;
}

const MIN_PURCHASES_FOR_RELIABLE_CYCLE = 3;
const MAX_REACTIVATION_DAYS = 90;

/**
 * Calculate client profile snapshot at the time of conversion
 * This provides context about how this sale compares to the client's historical behavior
 */
async function calculateClientProfileSnapshot(
	tx: DBTransaction,
	clienteId: string,
	organizacaoId: string,
	dataVenda: Date,
	valorVenda: number,
): Promise<ClientProfileSnapshot> {
	// Get all previous sales for this client (before current sale)
	const previousSales = await tx.query.sales.findMany({
		where: and(eq(sales.clienteId, clienteId), eq(sales.organizacaoId, organizacaoId), lt(sales.dataVenda, dataVenda), isNotNull(sales.dataVenda)),
		columns: {
			id: true,
			valorTotal: true,
			dataVenda: true,
		},
		orderBy: (sales, { desc }) => [desc(sales.dataVenda)],
	});

	const qtdeCompras = previousSales.length;

	// First purchase - this is an acquisition
	if (qtdeCompras === 0) {
		return {
			ticketMedio: null,
			cicloCompraMedio: null,
			qtdeCompras: 0,
			cicloCompraConfiavel: false,
			diasDesdeUltimaCompra: null,
			tipoConversao: "AQUISICAO",
			deltaFrequencia: null,
			deltaMonetarioAbsoluto: null,
			deltaMonetarioPercentual: null,
		};
	}

	// Calculate ticket medio from previous purchases
	const totalPreviousValue = previousSales.reduce((sum, sale) => sum + (sale.valorTotal || 0), 0);
	const ticketMedio = totalPreviousValue / qtdeCompras;

	// Calculate days since last purchase
	const lastPurchaseDate = previousSales[0]?.dataVenda;
	const diasDesdeUltimaCompra = lastPurchaseDate ? dayjs(dataVenda).diff(dayjs(lastPurchaseDate), "day") : null;

	// Calculate average purchase cycle (only if we have enough data)
	let cicloCompraMedio: number | null = null;
	const cicloCompraConfiavel = qtdeCompras >= MIN_PURCHASES_FOR_RELIABLE_CYCLE;

	if (qtdeCompras >= 2) {
		// Calculate average days between consecutive purchases
		const sortedSales = [...previousSales].sort((a, b) => new Date(a.dataVenda!).getTime() - new Date(b.dataVenda!).getTime());

		let totalDaysBetween = 0;
		for (let i = 1; i < sortedSales.length; i++) {
			const daysDiff = dayjs(sortedSales[i]!.dataVenda).diff(dayjs(sortedSales[i - 1]!.dataVenda), "day");
			totalDaysBetween += daysDiff;
		}
		cicloCompraMedio = Math.round(totalDaysBetween / (sortedSales.length - 1));
	}

	// Determine conversion type
	let tipoConversao: TConversionTypeEnum = "REGULAR";

	if (diasDesdeUltimaCompra !== null) {
		if (cicloCompraMedio !== null && cicloCompraConfiavel) {
			// Reactivation threshold: min(3x cycle, 90 days)
			const reactivationThreshold = Math.min(cicloCompraMedio * 3, MAX_REACTIVATION_DAYS);

			if (diasDesdeUltimaCompra > reactivationThreshold) {
				tipoConversao = "REATIVACAO";
			} else if (diasDesdeUltimaCompra < cicloCompraMedio) {
				tipoConversao = "ACELERACAO";
			} else if (diasDesdeUltimaCompra > cicloCompraMedio) {
				tipoConversao = "ATRASADA";
			} else {
				tipoConversao = "REGULAR";
			}
		} else {
			// Without reliable cycle, use 90-day threshold for reactivation
			if (diasDesdeUltimaCompra > MAX_REACTIVATION_DAYS) {
				tipoConversao = "REATIVACAO";
			}
		}
	}

	// Calculate deltas
	let deltaFrequencia: number | null = null;
	let deltaMonetarioAbsoluto: number | null = null;
	let deltaMonetarioPercentual: number | null = null;

	// Frequency delta: positive means client came back faster than usual
	if (cicloCompraMedio !== null && diasDesdeUltimaCompra !== null) {
		deltaFrequencia = cicloCompraMedio - diasDesdeUltimaCompra;
	}

	// Monetary deltas
	if (ticketMedio > 0) {
		deltaMonetarioAbsoluto = valorVenda - ticketMedio;
		deltaMonetarioPercentual = (valorVenda / ticketMedio - 1) * 100;
	}

	return {
		ticketMedio,
		cicloCompraMedio,
		qtdeCompras,
		cicloCompraConfiavel,
		diasDesdeUltimaCompra,
		tipoConversao,
		deltaFrequencia,
		deltaMonetarioAbsoluto,
		deltaMonetarioPercentual,
	};
}

interface AttributionResult {
	interactionId: string;
	campanhaId: string;
	peso: number;
	receita: number;
	dataInteracao: Date;
	tempoMinutos: number;
}

/**
 * Calculate last-touch attribution - gives 100% credit to the last campaign interaction before the sale
 */
function calculateLastTouchAttribution(
	eligibleInteractions: Array<{
		id: string;
		campanhaId: string | null;
		dataExecucao: Date | null;
	}>,
	valorVenda: number,
	dataVenda: Date,
): AttributionResult[] {
	// Sort by execution date descending, take the last one (most recent before sale)
	const sorted = eligibleInteractions
		.filter((i) => i.campanhaId && i.dataExecucao)
		.sort((a, b) => new Date(b.dataExecucao!).getTime() - new Date(a.dataExecucao!).getTime());

	const last = sorted[0];
	if (!last || !last.campanhaId || !last.dataExecucao) {
		return [];
	}

	return [
		{
			interactionId: last.id,
			campanhaId: last.campanhaId,
			peso: 1.0,
			receita: valorVenda,
			dataInteracao: last.dataExecucao,
			tempoMinutos: Math.floor((dataVenda.getTime() - new Date(last.dataExecucao).getTime()) / 60000),
		},
	];
}

/**
 * Process conversion attribution for a sale
 * Looks back at all campaign interactions the client received within the attribution window
 * and attributes the sale to the last campaign that contacted them (last-touch model)
 */
export async function processConversionAttribution(tx: DBTransaction, params: AttributionParams): Promise<void> {
	const { vendaId, clienteId, organizacaoId, valorVenda, dataVenda } = params;

	// Idempotente por venda: uma venda pode voltar a ser válida (ex.: um conector que a classificava
	// errado e foi corrigido — Bling "Atendido", 2026-11-21) e passar de novo por aqui. Sem a guarda,
	// cada revalidação gravava outra conversão e inflava o resultado da campanha.
	const existingConversion = await tx.query.campaignConversions.findFirst({
		where: eq(campaignConversions.vendaId, vendaId),
		columns: { id: true },
	});
	if (existingConversion) return;

	// 1. Find all campaigns with their attribution settings for this organization
	const allCampaigns = await tx.query.campaigns.findMany({
		where: eq(campaigns.organizacaoId, organizacaoId),
		columns: {
			id: true,
			atribuicaoJanelaDias: true,
			atribuicaoModelo: true,
		},
	});

	const campaignSettingsMap = new Map(
		allCampaigns.map((c) => [
			c.id,
			{
				windowDays: c.atribuicaoJanelaDias ?? 7,
				model: c.atribuicaoModelo ?? "LAST_TOUCH",
			},
		]),
	);

	// 2. Find eligible interactions (executed before sale, type ENVIO-MENSAGEM)
	const eligibleInteractions = await tx.query.interactions.findMany({
		where: and(
			eq(interactions.clienteId, clienteId),
			eq(interactions.organizacaoId, organizacaoId),
			eq(interactions.tipo, "ENVIO-MENSAGEM"),
			isNotNull(interactions.dataExecucao),
			lte(interactions.dataExecucao, dataVenda),
			inArray(interactions.statusEnvio, CAMPAIGN_SENT_INTERACTION_STATUSES),
		),
		with: {
			campanha: true,
		},
	});

	// 3. Filter by each campaign's attribution window
	const withinWindowInteractions = eligibleInteractions.filter((interaction) => {
		if (!interaction.campanhaId || !interaction.dataExecucao) return false;

		const campaignSettings = campaignSettingsMap.get(interaction.campanhaId);
		const windowDays = campaignSettings?.windowDays ?? 14;
		const windowStart = dayjs(dataVenda).subtract(windowDays, "day").toDate();

		return new Date(interaction.dataExecucao) >= windowStart;
	});

	// 4. If no eligible interactions, mark sale as processed but not applicable
	if (withinWindowInteractions.length === 0) {
		await tx
			.update(sales)
			.set({
				atribuicaoProcessada: true,
				atribuicaoAplicavel: false,
			})
			.where(eq(sales.id, vendaId));
		return;
	}

	// 5. Calculate attribution using last-touch model
	const attributions = calculateLastTouchAttribution(withinWindowInteractions, valorVenda, dataVenda);

	if (attributions.length === 0) {
		await tx
			.update(sales)
			.set({
				atribuicaoProcessada: true,
				atribuicaoAplicavel: false,
			})
			.where(eq(sales.id, vendaId));
		return;
	}

	// 6. Calculate client profile snapshot for conversion quality analysis
	const clientProfile = await calculateClientProfileSnapshot(tx, clienteId, organizacaoId, dataVenda, valorVenda);

	let attributionConversionId: string | null = null;
	// 7. Store attributions
	for (const attr of attributions) {
		const campaignSettings = campaignSettingsMap.get(attr.campanhaId);

		const insertedCampaignConversion = await tx
			.insert(campaignConversions)
			.values({
				organizacaoId,
				vendaId,
				interacaoId: attr.interactionId,
				campanhaId: attr.campanhaId,
				clienteId,
				atribuicaoModelo: campaignSettings?.model ?? "LAST_TOUCH",
				atribuicaoPeso: attr.peso,
				atribuicaoReceita: attr.receita,
				dataInteracao: attr.dataInteracao,
				dataConversao: dataVenda,
				tempoParaConversaoMinutos: attr.tempoMinutos,
				// Client profile snapshot
				clienteTicketMedioSnapshot: clientProfile.ticketMedio,
				clienteCicloCompraMedioSnapshot: clientProfile.cicloCompraMedio,
				clienteQtdeComprasSnapshot: clientProfile.qtdeCompras,
				cicloCompraConfiavel: clientProfile.cicloCompraConfiavel,
				diasDesdeUltimaCompra: clientProfile.diasDesdeUltimaCompra,
				tipoConversao: clientProfile.tipoConversao,
				deltaFrequencia: clientProfile.deltaFrequencia,
				deltaMonetarioAbsoluto: clientProfile.deltaMonetarioAbsoluto,
				deltaMonetarioPercentual: clientProfile.deltaMonetarioPercentual,
				vendaValor: valorVenda,
			})
			.returning({ id: campaignConversions.id });
		const campaignConversionId = insertedCampaignConversion[0]?.id;

		// If no attribution conversion id is set, set it to the campaign conversion id
		// Setting the first attribution conversion id as the primary attribution conversion id
		if (!attributionConversionId) attributionConversionId = campaignConversionId;
	}

	// 8. Update sale with primary campaign (the one with highest weight, or first in last-touch)
	await tx
		.update(sales)
		.set({
			atribuicaoProcessada: true,
			atribuicaoAplicavel: true,
			atribuicaoCampanhaPrincipalId: attributions[0]?.campanhaId,
			atribuicaoCampanhaConversaoId: attributionConversionId,
			atribuicaoInteracaoId: attributions[0]?.interactionId,
		})
		.where(eq(sales.id, vendaId));
}
