import { accumulateCashbackForClient } from "@/lib/cashback/accumulation";
import { reverseSaleCashback } from "@/lib/cashback/reverse-sale-cashback";
import { recordPurchaseCampaignEvent } from "@/lib/campaigns/events/purchases";
import type { TEventDispatchResult } from "@/lib/campaigns/engine";
import { processConversionAttribution } from "@/lib/conversions/attribution";
import { cashbackProgramBalances, cashbackPrograms } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { TDataCollectingV2EffectsOptions, TDataCollectingV2Executor, TPersistedSaleForEffects } from "./types";

type TProcessEffectsResult = {
	campaignEventsCapturedCount: number;
	createdDispatchesCount: number;
	immediateDispatchesCount: number;
	cashbackTransactionsCount: number;
	cashbackAccumulatedValue: number;
	firstPurchaseDispatchesCount: number;
	cashbackAccumulationDispatchesCount: number;
	// Compatibility field: dispatches are now created by campaign-event consumers.
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
	persistedSales,
	options,
	publicationAllowed = true,
}: {
	tx: TDataCollectingV2Executor;
	organizationId: string;
	persistedSales: TPersistedSaleForEffects[];
	options: TDataCollectingV2EffectsOptions;
	publicationAllowed?: boolean;
}): Promise<TProcessEffectsResult> {
	const eventDispatches: TEventDispatchResult[] = [];
	let campaignEventsCapturedCount = 0;
	let cashbackTransactionsCount = 0;
	let cashbackAccumulatedValue = 0;

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
	// O cache de saldos só é lido para o comprador de cada venda (contexto da interação) e escrito
	// para comprador e parceiro — carregar os saldos da organização inteira a cada lote era a
	// segunda maior fonte de egress do banco.
	const balanceClientIds = Array.from(
		new Set(persistedSales.flatMap((sale) => [sale.clientId, sale.partnerClientId]).filter((clientId): clientId is string => !!clientId)),
	);
	const existingBalances =
		cashbackProgram && balanceClientIds.length > 0
			? await tx.query.cashbackProgramBalances.findMany({
					where: and(
						eq(cashbackProgramBalances.organizacaoId, organizationId),
						eq(cashbackProgramBalances.programaId, cashbackProgram.id),
						inArray(cashbackProgramBalances.clienteId, balanceClientIds),
					),
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

		// Freeze ingestion facts; trigger evaluation belongs to the event consumer.
		const balance = balancesByClientId.get(clientId);
		const eventId = await recordPurchaseCampaignEvent({
			tx,
			organizationId,
			clientId,
			sourceId: persistedSale.id,
			idempotencyKey: `compra:${persistedSale.id}`,
			publicationAllowed,
			snapshot: {
				compraValor: persistedSale.sale.totalValue,
				comprasQuantidadeAnterior: persistedSale.previousTotalPurchaseCount ?? 0,
				comprasQuantidadePosterior: persistedSale.newTotalPurchaseCount ?? 0,
				comprasValorAnterior: persistedSale.previousTotalPurchaseValue ?? 0,
				comprasValorPosterior: persistedSale.newTotalPurchaseValue ?? 0,
				primeiraCompra: persistedSale.isFirstPurchase,
				contabilizarCompra: persistedSale.newTotalPurchaseCount !== null,
				vendedorNome: persistedSale.sale.sellerName,
				terminologia: cashbackProgram?.terminologia ?? "DINHEIRO",
				cashbackAcumulado: saleCashbackAccumulation?.buyerAccumulatedValue ?? 0,
				cashbackSaldoDisponivel: balance?.saldoValorDisponivel ?? 0,
				cashbackTotalAcumulado: balance?.saldoValorAcumuladoTotal ?? 0,
				origem: "INTEGRACAO",
				canal: persistedSale.sale.channel ?? null,
				dataCompra: persistedSale.sale.occurredAt.toISOString(),
			},
		});
		if (eventId) campaignEventsCapturedCount++;
	}

	return {
		campaignEventsCapturedCount,
		createdDispatchesCount: 0,
		immediateDispatchesCount: eventDispatches.filter((dispatch) => dispatch.immediate).length,
		cashbackTransactionsCount,
		cashbackAccumulatedValue,
		firstPurchaseDispatchesCount: 0,
		cashbackAccumulationDispatchesCount: 0,
		eventDispatches,
	};
}
