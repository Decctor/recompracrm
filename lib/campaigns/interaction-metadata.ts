import {
	generateCashbackForCampaign,
	generateCashbackForCampaignBatch,
	type TCampaignCashbackBatchClientBalance,
} from "@/lib/cashback/generate-campaign-cashback";
import { generateCouponGrantForCampaign, generateCouponGrantsForCampaignBatch } from "@/lib/coupons/generate-campaign-coupon";
import type { TInteractionContextMetadados } from "@/lib/message-templates";
import { formatDateAsLocale } from "@/lib/formatting";
import type { TCashbackProgramAccumulationTypeEnum, TCashbackProgramTerminologyEnum, TTimeDurationUnitsEnum } from "@/schemas/enums";
import type { DBTransaction } from "@/services/drizzle";

type TCampaignCashbackGenerationConfig = {
	id: string;
	cashbackGeracaoAtivo: boolean;
	cashbackGeracaoTipo: TCashbackProgramAccumulationTypeEnum | null;
	cashbackGeracaoValor: number | null;
	cashbackGeracaoExpiracaoMedida: TTimeDurationUnitsEnum | null;
	cashbackGeracaoExpiracaoValor: number | null;
	// Geração de cupom (opcional para compatibilidade com chamadores que selecionam colunas específicas)
	cupomGeracaoAtivo?: boolean | null;
	cupomGeracaoCupomId?: string | null;
	cupomGeracaoExpiracaoMedida?: TTimeDurationUnitsEnum | null;
	cupomGeracaoExpiracaoValor?: number | null;
};

type TBuildBasePurchaseInteractionMetadataParams = {
	terminologia: TCashbackProgramTerminologyEnum;
	saleValue: number;
	transactionAccumulatedCashback: number;
	availableBalance: number;
	accumulatedTotal: number;
	redeemedTotal?: number;
	sellerName?: string;
	totalPurchaseCount?: number;
	totalPurchaseValue?: number;
};

type TBuildBaseCashbackInteractionMetadataParams = {
	terminologia: TCashbackProgramTerminologyEnum;
	availableBalance?: number;
	accumulatedTotal?: number;
	redeemedTotal?: number;
};

export function buildBaseCashbackInteractionMetadata({
	terminologia,
	availableBalance = 0,
	accumulatedTotal = 0,
	redeemedTotal = 0,
}: TBuildBaseCashbackInteractionMetadataParams): TInteractionContextMetadados {
	return {
		terminologia,
		cashbackSaldoDisponivel: availableBalance,
		cashbackTotalAcumuladoVida: accumulatedTotal,
		cashbackTotalResgatadoVida: redeemedTotal,
	};
}

export function buildBasePurchaseInteractionMetadata({
	terminologia,
	saleValue,
	transactionAccumulatedCashback,
	availableBalance,
	accumulatedTotal,
	redeemedTotal,
	sellerName,
	totalPurchaseCount,
	totalPurchaseValue,
}: TBuildBasePurchaseInteractionMetadataParams): TInteractionContextMetadados {
	return {
		terminologia,
		compraValor: saleValue,
		compraCashbackAcumulado: transactionAccumulatedCashback,
		compraCashbackNovoSaldo: availableBalance,
		compraVendedorNome: sellerName,
		compraQuantidadeTotal: totalPurchaseCount,
		compraValorTotalAcumulado: totalPurchaseValue,
		cashbackSaldoDisponivel: availableBalance,
		cashbackTotalAcumuladoVida: accumulatedTotal,
		cashbackTotalResgatadoVida: redeemedTotal,
	};
}

export type TApplyCampaignBonusResult = {
	metadata: TInteractionContextMetadados;
	bonusAmount: number | null;
	runningAvailableBalance: number;
	runningAccumulatedTotal: number;
};

export type TApplyCampaignBatchEffectsResult = {
	cashbackGenerated: number;
	// Contexto por cliente pronto para congelar em interactions.metadados: efeitos (cashback/cupom)
	// mesclados sobre o contexto-base do chamador (ex.: produto sugerido da promoção).
	metadadosByClientId: Map<string, TInteractionContextMetadados>;
};

/**
 * Versão em lote de applyCampaignBonusToInteractionMetadata, para os crons de campanha que
 * enfileiram chunks (uso único, promoção de produtos, recorrente): gera cashback FIXO e
 * atribuições de cupom para o lote e devolve o contexto por cliente que DEVE ser persistido em
 * `interactions.metadados` e repassado ao envio imediato. Sem esse contexto, as variáveis de
 * cashback renderizam "R$ 0,00" e as de cupom renderizam vazias — com o cupom já consumido.
 *
 * Roda dentro da transação de enfileiramento do chamador: efeito e interação são atômicos, e a
 * deduplicação de clientes por chunk (feita antes) vale para os dois.
 */
export async function applyCampaignBatchEffectsToInteractionMetadata({
	tx,
	organizationId,
	campaign,
	clientIds,
	interactionIdByClientId,
	baseMetadataByClientId,
}: {
	tx: DBTransaction;
	organizationId: string;
	campaign: TCampaignCashbackGenerationConfig;
	clientIds: string[];
	interactionIdByClientId?: Map<string, string>; // Grava metadados.interacaoId nas transações de cashback, habilitando estorno em bloqueio de envio
	baseMetadataByClientId?: Map<string, TInteractionContextMetadados>;
}): Promise<TApplyCampaignBatchEffectsResult> {
	const metadadosByClientId = new Map<string, TInteractionContextMetadados>();
	if (clientIds.length === 0) return { cashbackGenerated: 0, metadadosByClientId };

	// Em lote só existe FIXO: PERCENTUAL depende do valor de uma venda, que não há neste fluxo
	// (mesma regra imposta na validação de criação da campanha).
	const cashbackActive = campaign.cashbackGeracaoAtivo && campaign.cashbackGeracaoTipo === "FIXO" && (campaign.cashbackGeracaoValor ?? 0) > 0;

	let cashbackGenerated = 0;
	let cashbackTerminology: TCashbackProgramTerminologyEnum | null = null;
	let cashbackBalancesByClientId = new Map<string, TCampaignCashbackBatchClientBalance>();
	if (cashbackActive) {
		const cashbackResult = await generateCashbackForCampaignBatch({
			tx,
			organizationId,
			campaignId: campaign.id,
			clientIds,
			cashbackValue: campaign.cashbackGeracaoValor ?? 0,
			expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
			expirationValue: campaign.cashbackGeracaoExpiracaoValor,
			interactionIdByClientId,
		});
		cashbackGenerated = cashbackResult.generatedCount;
		cashbackTerminology = cashbackResult.terminologia;
		cashbackBalancesByClientId = cashbackResult.balancesByClientId;
	}

	// O cupom é uniforme no chunk (mesmo código/título/expiração para todos os clientes).
	let couponMetadata: Pick<TInteractionContextMetadados, "cupomCodigo" | "cupomTitulo" | "cupomExpiracaoData"> = {};
	if (campaign.cupomGeracaoAtivo && campaign.cupomGeracaoCupomId) {
		const couponResult = await generateCouponGrantsForCampaignBatch({
			tx,
			organizationId,
			campaignId: campaign.id,
			clientIds,
			couponId: campaign.cupomGeracaoCupomId,
			expirationMeasure: campaign.cupomGeracaoExpiracaoMedida ?? null,
			expirationValue: campaign.cupomGeracaoExpiracaoValor ?? null,
		});
		if (couponResult.generatedCount > 0 && couponResult.couponCode) {
			couponMetadata = {
				cupomCodigo: couponResult.couponCode,
				cupomTitulo: couponResult.couponTitle ?? undefined,
				cupomExpiracaoData: (couponResult.expirationDate ? formatDateAsLocale(couponResult.expirationDate) : undefined) ?? undefined,
			};
		}
	}

	for (const clientId of clientIds) {
		const baseMetadata = baseMetadataByClientId?.get(clientId);
		const balances = cashbackBalancesByClientId.get(clientId);
		const merged: TInteractionContextMetadados = {
			...baseMetadata,
			...(cashbackTerminology ? { terminologia: cashbackTerminology } : {}),
			...(balances
				? {
						cashbackSaldoDisponivel: balances.saldoDisponivel,
						cashbackTotalAcumuladoVida: balances.totalAcumulado,
						cashbackTotalResgatadoVida: balances.totalResgatado,
					}
				: {}),
			...couponMetadata,
		};
		if (Object.keys(merged).length > 0) metadadosByClientId.set(clientId, merged);
	}

	return { cashbackGenerated, metadadosByClientId };
}

export async function applyCampaignBonusToInteractionMetadata({
	tx,
	baseMetadata,
	campaign,
	organizationId,
	clientId,
	saleId,
	saleValue,
	interactionId,
	enabled = true,
}: {
	tx: DBTransaction;
	baseMetadata: TInteractionContextMetadados;
	campaign: TCampaignCashbackGenerationConfig;
	organizationId: string;
	clientId: string;
	saleId: string | null;
	saleValue: number | null;
	interactionId?: string | null; // ID pré-gerado da interação que concede o bônus; gravado em metadados.interacaoId da transação para permitir estorno em bloqueio de envio
	enabled?: boolean;
}): Promise<TApplyCampaignBonusResult> {
	const runningAvailableBalance = baseMetadata.cashbackSaldoDisponivel ?? baseMetadata.compraCashbackNovoSaldo ?? 0;
	const runningAccumulatedTotal = baseMetadata.cashbackTotalAcumuladoVida ?? 0;

	// Geração de cupom (efeito colateral independente do bônus de cashback)
	let couponMetadata: Pick<TInteractionContextMetadados, "cupomCodigo" | "cupomTitulo" | "cupomExpiracaoData"> = {};
	if (enabled && campaign.cupomGeracaoAtivo && campaign.cupomGeracaoCupomId) {
		const couponGrantResult = await generateCouponGrantForCampaign({
			tx,
			organizationId,
			clientId,
			campaignId: campaign.id,
			couponId: campaign.cupomGeracaoCupomId,
			expirationMeasure: campaign.cupomGeracaoExpiracaoMedida ?? null,
			expirationValue: campaign.cupomGeracaoExpiracaoValor ?? null,
		});
		if (couponGrantResult) {
			couponMetadata = {
				cupomCodigo: couponGrantResult.couponCode,
				cupomTitulo: couponGrantResult.couponTitle,
				cupomExpiracaoData: (couponGrantResult.expirationDate ? formatDateAsLocale(couponGrantResult.expirationDate) : undefined) ?? undefined,
			};
		}
	}

	if (!enabled || !campaign.cashbackGeracaoAtivo || !campaign.cashbackGeracaoTipo || !campaign.cashbackGeracaoValor) {
		return {
			metadata: { ...baseMetadata, ...couponMetadata },
			bonusAmount: null,
			runningAvailableBalance,
			runningAccumulatedTotal,
		};
	}

	const result = await generateCashbackForCampaign({
		tx,
		organizationId,
		clientId,
		campaignId: campaign.id,
		cashbackType: campaign.cashbackGeracaoTipo,
		cashbackValue: campaign.cashbackGeracaoValor,
		saleId,
		saleValue,
		expirationMeasure: campaign.cashbackGeracaoExpiracaoMedida,
		expirationValue: campaign.cashbackGeracaoExpiracaoValor,
		interactionId,
	});

	if (!result) {
		return {
			metadata: { ...baseMetadata, ...couponMetadata },
			bonusAmount: null,
			runningAvailableBalance,
			runningAccumulatedTotal,
		};
	}

	return {
		metadata: {
			...baseMetadata,
			...couponMetadata,
			cashbackSaldoDisponivel: result.clientNewAvailableBalance,
			compraCashbackNovoSaldo: result.clientNewAvailableBalance,
			cashbackTotalAcumuladoVida: result.clientNewAccumulatedTotal,
		},
		bonusAmount: result.cashbackAmount,
		runningAvailableBalance: result.clientNewAvailableBalance,
		runningAccumulatedTotal: result.clientNewAccumulatedTotal,
	};
}
