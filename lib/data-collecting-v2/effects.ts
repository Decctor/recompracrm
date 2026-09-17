import { accumulateCashbackForClient } from "@/lib/cashback/accumulation";
import { reverseSaleCashback } from "@/lib/cashback/reverse-sale-cashback";
import {
	canScheduleCampaignForClient,
	createEventCampaignDispatch,
	resolveTriggeredCampaigns,
	type TEventDispatchResult,
} from "@/lib/campaigns/engine";
import { buildBasePurchaseInteractionMetadata } from "@/lib/campaigns/interaction-metadata";
import { processConversionAttribution } from "@/lib/conversions/attribution";
import { cashbackProgramBalances, cashbackPrograms } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import type { TCampaignWithAudienceRelations, TDataCollectingV2EffectsOptions, TDataCollectingV2Executor, TPersistedSaleForEffects } from "./types";

type TProcessEffectsResult = {
	createdDispatchesCount: number;
	immediateDispatchesCount: number;
	cashbackTransactionsCount: number;
	cashbackAccumulatedValue: number;
	firstPurchaseDispatchesCount: number;
	cashbackAccumulationDispatchesCount: number;
	// Disparos criados nesta transação; o chamador publica os imediatos DEPOIS do commit.
	eventDispatches: TEventDispatchResult[];
};

type TBalanceCacheEntry = {
	programaId: string;
	clienteId: string;
	saldoValorDisponivel: number;
	saldoValorAcumuladoTotal: number;
};

type TSaleCashbackAccumulation = {
	buyerAccumulatedValue: number;
	buyerAvailableBalance: number;
	buyerAccumulatedTotal: number;
	partnerAccumulatedValue: number;
	partnerClientId: string | null;
};

function buildInteractionDescription(
	campaign: TCampaignWithAudienceRelations,
	persistedSale: TPersistedSaleForEffects,
	accumulation: TSaleCashbackAccumulation | null,
) {
	if (campaign.gatilhoTipo === "PRIMEIRA-COMPRA") return "Cliente realizou sua primeira compra.";
	if (campaign.gatilhoTipo === "NOVA-COMPRA") return `Cliente realizou nova compra via ${persistedSale.sale.channel ?? "integração"}.`;
	if (campaign.gatilhoTipo === "QUANTIDADE-TOTAL-COMPRAS") return `Cliente atingiu ${persistedSale.newTotalPurchaseCount} compras totais.`;
	if (campaign.gatilhoTipo === "VALOR-TOTAL-COMPRAS") return `Cliente atingiu R$ ${persistedSale.newTotalPurchaseValue} em compras totais.`;
	if (campaign.gatilhoTipo === "CASHBACK-ACUMULADO" && accumulation) {
		return `Cliente acumulou R$ ${accumulation.buyerAccumulatedValue.toFixed(2)} em cashback. Total acumulado: R$ ${accumulation.buyerAccumulatedTotal.toFixed(2)} via campanha ${campaign.titulo}.`;
	}
	return `Cliente se enquadrou no gatilho ${campaign.gatilhoTipo}.`;
}

function updateBalanceCache({
	balancesByClientId,
	programId,
	clientId,
	availableBalance,
	accumulatedTotal,
}: {
	balancesByClientId: Map<string, TBalanceCacheEntry>;
	programId: string;
	clientId: string;
	availableBalance: number;
	accumulatedTotal: number;
}) {
	balancesByClientId.set(clientId, {
		programaId: programId,
		clienteId: clientId,
		saldoValorDisponivel: availableBalance,
		saldoValorAcumuladoTotal: accumulatedTotal,
	});
}

export async function processDataCollectingV2Effects({
	tx,
	organizationId,
	campaigns,
	audiencesByCampaignId,
	persistedSales,
	options,
}: {
	tx: TDataCollectingV2Executor;
	organizationId: string;
	campaigns: TCampaignWithAudienceRelations[];
	audiencesByCampaignId: Map<string, Set<string>>;
	persistedSales: TPersistedSaleForEffects[];
	options: TDataCollectingV2EffectsOptions;
}): Promise<TProcessEffectsResult> {
	const eventDispatches: TEventDispatchResult[] = [];
	let cashbackTransactionsCount = 0;
	let cashbackAccumulatedValue = 0;
	let firstPurchaseDispatchesCount = 0;
	let cashbackAccumulationDispatchesCount = 0;

	const cashbackProgram = options.processCashback
		? await tx.query.cashbackPrograms.findFirst({
				where: eq(cashbackPrograms.organizacaoId, organizationId),
				columns: {
					id: true,
					ativo: true,
					terminologia: true,
					acumuloTipo: true,
					acumuloValor: true,
					acumuloValorParceiro: true,
					acumuloRegraValorMinimo: true,
					expiracaoRegraValidadeValor: true,
					acumuloPermitirViaIntegracao: true,
				},
			})
		: undefined;
	const existingBalances = cashbackProgram
		? await tx.query.cashbackProgramBalances.findMany({
				where: and(eq(cashbackProgramBalances.organizacaoId, organizationId), eq(cashbackProgramBalances.programaId, cashbackProgram.id)),
				columns: {
					programaId: true,
					clienteId: true,
					saldoValorDisponivel: true,
					saldoValorAcumuladoTotal: true,
				},
			})
		: [];
	const balancesByClientId = new Map(existingBalances.map((balance) => [balance.clienteId, balance]));

	for (const persistedSale of persistedSales) {
		// Assinatura igual = o import deste exato estado já commitou e os efeitos dele já rodaram.
		// O guard é obrigatório (não otimização): `nowCanceled` é estado, não transição — sem ele,
		// uma venda cancelada inalterada dispararia reverseSaleCashback a cada run.
		if (persistedSale.skipped) continue;

		let saleCashbackAccumulation: TSaleCashbackAccumulation | null = null;

		if (options.processConversionAttribution && persistedSale.becameValid && persistedSale.clientId) {
			await processConversionAttribution(tx, {
				vendaId: persistedSale.id,
				clienteId: persistedSale.clientId,
				organizacaoId: organizationId,
				valorVenda: persistedSale.sale.totalValue,
				dataVenda: persistedSale.sale.occurredAt,
			});
		}

		if (options.processCashback && persistedSale.previouslyValid && persistedSale.nowCanceled && persistedSale.clientId) {
			await reverseSaleCashback({
				tx,
				saleId: persistedSale.id,
				clientId: persistedSale.clientId,
				organizationId,
				reason: "VENDA_CANCELADA",
			});
		}

		if (cashbackProgram?.ativo && cashbackProgram.acumuloPermitirViaIntegracao && persistedSale.becameValid && persistedSale.clientId) {
			const buyerAccumulation = await accumulateCashbackForClient({
				tx,
				orgId: organizationId,
				clientId: persistedSale.clientId,
				saleId: persistedSale.id,
				saleValue: persistedSale.sale.totalValue,
				program: cashbackProgram,
				createdAt: persistedSale.sale.occurredAt,
			});

			if (buyerAccumulation.transactionId && !buyerAccumulation.alreadyProcessed) {
				cashbackTransactionsCount += 1;
				cashbackAccumulatedValue += buyerAccumulation.accumulatedValue;
			}

			updateBalanceCache({
				balancesByClientId,
				programId: cashbackProgram.id,
				clientId: persistedSale.clientId,
				availableBalance: buyerAccumulation.newAvailableBalance,
				accumulatedTotal: buyerAccumulation.newAccumulatedBalance,
			});

			saleCashbackAccumulation = {
				buyerAccumulatedValue: buyerAccumulation.accumulatedValue,
				buyerAvailableBalance: buyerAccumulation.newAvailableBalance,
				buyerAccumulatedTotal: buyerAccumulation.newAccumulatedBalance,
				partnerAccumulatedValue: 0,
				partnerClientId: null,
			};

			if (persistedSale.partnerClientId && persistedSale.partnerClientId !== persistedSale.clientId && cashbackProgram.acumuloValorParceiro > 0) {
				const partnerAccumulation = await accumulateCashbackForClient({
					tx,
					orgId: organizationId,
					clientId: persistedSale.partnerClientId,
					saleId: persistedSale.id,
					saleValue: persistedSale.sale.totalValue,
					program: cashbackProgram,
					accumulationValueOverride: cashbackProgram.acumuloValorParceiro,
					createdAt: persistedSale.sale.occurredAt,
					metadata: {
						ator: "PARCEIRO",
						clienteCompradorId: persistedSale.clientId,
					},
				});

				if (partnerAccumulation.transactionId && !partnerAccumulation.alreadyProcessed) {
					cashbackTransactionsCount += 1;
					cashbackAccumulatedValue += partnerAccumulation.accumulatedValue;
				}

				updateBalanceCache({
					balancesByClientId,
					programId: cashbackProgram.id,
					clientId: persistedSale.partnerClientId,
					availableBalance: partnerAccumulation.newAvailableBalance,
					accumulatedTotal: partnerAccumulation.newAccumulatedBalance,
				});

				saleCashbackAccumulation.partnerAccumulatedValue = partnerAccumulation.accumulatedValue;
				saleCashbackAccumulation.partnerClientId = persistedSale.partnerClientId;
			}
		}

		if (!options.processCampaigns || !persistedSale.becameValid || !persistedSale.clientId) continue;
		const clientId = persistedSale.clientId;

		// Motor único de gatilhos (lib/campaigns/engine): mesma decisão do POI.
		const triggered = resolveTriggeredCampaigns({
			campaigns,
			audiencesByCampaignId,
			sale: {
				clientId,
				isFirstPurchase: persistedSale.isFirstPurchase,
				saleValue: persistedSale.sale.totalValue,
				newTotalPurchaseCount: persistedSale.newTotalPurchaseCount,
				previousTotalPurchaseCount: persistedSale.previousTotalPurchaseCount,
				newTotalPurchaseValue: persistedSale.newTotalPurchaseValue,
				previousTotalPurchaseValue: persistedSale.previousTotalPurchaseValue,
				cashbackAccumulatedValue: saleCashbackAccumulation?.buyerAccumulatedValue ?? null,
				cashbackAvailableBalance: saleCashbackAccumulation?.buyerAvailableBalance ?? null,
			},
		});

		for (const { campaign, grupo } of triggered) {
			if (!(await canScheduleCampaignForClient({ executor: tx, campaign, clientId }))) continue;

			const currentBalance = balancesByClientId.get(clientId);
			const contexto = {
				...buildBasePurchaseInteractionMetadata({
					terminologia: cashbackProgram?.terminologia ?? "DINHEIRO",
					saleValue: persistedSale.sale.totalValue,
					transactionAccumulatedCashback: saleCashbackAccumulation?.buyerAccumulatedValue ?? 0,
					availableBalance: currentBalance?.saldoValorDisponivel ?? 0,
					accumulatedTotal: currentBalance?.saldoValorAcumuladoTotal ?? 0,
					sellerName: persistedSale.sale.sellerName,
					totalPurchaseCount: persistedSale.newTotalPurchaseCount ?? undefined,
					totalPurchaseValue: persistedSale.newTotalPurchaseValue ?? undefined,
				}),
				...(grupo === "CASHBACK" ? { cashbackAcumuladoValor: saleCashbackAccumulation?.buyerAccumulatedValue ?? 0 } : {}),
			};

			// Um disparo por (campanha, venda): reimportar a mesma venda nunca duplica a mensagem.
			const dispatch = await createEventCampaignDispatch({
				tx,
				organizationId,
				campaign,
				janelaReferencia: `venda:${persistedSale.id}`,
				recipients: [
					{
						clienteId: clientId,
						contexto,
						vendaId: persistedSale.id,
						descricao: buildInteractionDescription(campaign, persistedSale, saleCashbackAccumulation),
					},
				],
			});
			if (!dispatch.created) continue;

			eventDispatches.push(dispatch);
			if (campaign.gatilhoTipo === "PRIMEIRA-COMPRA") firstPurchaseDispatchesCount += 1;
			if (campaign.gatilhoTipo === "CASHBACK-ACUMULADO") cashbackAccumulationDispatchesCount += 1;
		}
	}

	return {
		createdDispatchesCount: eventDispatches.length,
		immediateDispatchesCount: eventDispatches.filter((dispatch) => dispatch.immediate).length,
		cashbackTransactionsCount,
		cashbackAccumulatedValue,
		firstPurchaseDispatchesCount,
		cashbackAccumulationDispatchesCount,
		eventDispatches,
	};
}
