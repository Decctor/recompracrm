import { CAMPAIGN_PROMOTION_PRODUCTS_LIMIT, type TCampaignState } from "@/schemas/campaigns";
import type { TBuilderStageId } from "./stages";

export type TStageValidationResult = {
	valid: boolean;
	reason?: string;
};

type TCampaign = TCampaignState["campaign"];
type TSegmentations = TCampaignState["segmentations"];

function activeSegmentationsCount(segmentations: TSegmentations): number {
	return segmentations.filter((s) => !s.deletar).length;
}

function validateTriggerStage(campaign: TCampaign, segmentations: TSegmentations): TStageValidationResult {
	const t = campaign.gatilhoTipo;
	switch (t) {
		case "USO-UNICO":
			if (!campaign.gatilhoUsoUnicoDataReferencia) return { valid: false, reason: "Selecione a data de disparo." };
			return { valid: true };
		case "PROMOCAO-PRODUTOS": {
			if (!campaign.gatilhoPromocaoDataReferencia) return { valid: false, reason: "Selecione a data de disparo." };
			const promotionProducts = campaign.gatilhoPromocaoProdutos ?? [];
			if (promotionProducts.length === 0) return { valid: false, reason: "Selecione ao menos um produto para a promoção." };
			if (promotionProducts.length > CAMPAIGN_PROMOTION_PRODUCTS_LIMIT) {
				return { valid: false, reason: `A promoção suporta no máximo ${CAMPAIGN_PROMOTION_PRODUCTS_LIMIT} produtos.` };
			}
			if (promotionProducts.some((promotionProduct) => !promotionProduct.produtoId)) {
				return { valid: false, reason: "Há linhas sem produto selecionado." };
			}
			const productIds = promotionProducts.map((promotionProduct) => promotionProduct.produtoId);
			if (new Set(productIds).size !== productIds.length) return { valid: false, reason: "Há produtos repetidos na lista." };
			if (promotionProducts.some((promotionProduct) => promotionProduct.precoPromocional != null && promotionProduct.precoPromocional <= 0)) {
				return { valid: false, reason: "O preço promocional deve ser maior que zero." };
			}
			return { valid: true };
		}
		case "RECORRENTE":
			if (!campaign.recorrenciaTipo) return { valid: false, reason: "Selecione a frequência da recorrência." };
			if (!campaign.recorrenciaIntervalo || campaign.recorrenciaIntervalo < 1) {
				return { valid: false, reason: "Defina um intervalo válido (≥ 1)." };
			}
			if (campaign.recorrenciaTipo === "SEMANAL") {
				try {
					const days = JSON.parse(campaign.recorrenciaDiasSemana ?? "[]");
					if (!Array.isArray(days) || days.length === 0) {
						return { valid: false, reason: "Selecione ao menos um dia da semana." };
					}
				} catch {
					return { valid: false, reason: "Selecione ao menos um dia da semana." };
				}
			}
			if (campaign.recorrenciaTipo === "MENSAL") {
				try {
					const days = JSON.parse(campaign.recorrenciaDiasMes ?? "[]");
					if (!Array.isArray(days) || days.length === 0) {
						return { valid: false, reason: "Selecione ao menos um dia do mês." };
					}
				} catch {
					return { valid: false, reason: "Selecione ao menos um dia do mês." };
				}
			}
			return { valid: true };
		case "PERMANÊNCIA-SEGMENTAÇÃO":
			if (!campaign.gatilhoTempoPermanenciaMedida || !campaign.gatilhoTempoPermanenciaValor || campaign.gatilhoTempoPermanenciaValor <= 0) {
				return { valid: false, reason: "Defina o tempo de permanência." };
			}
			if (activeSegmentationsCount(segmentations) === 0) {
				return { valid: false, reason: "Selecione ao menos uma segmentação." };
			}
			return { valid: true };
		case "ENTRADA-SEGMENTAÇÃO":
			if (activeSegmentationsCount(segmentations) === 0) {
				return { valid: false, reason: "Selecione ao menos uma segmentação." };
			}
			return { valid: true };
		case "CASHBACK-EXPIRANDO":
			if (!campaign.gatilhoCashbackExpirandoAntecedenciaMedida || !campaign.gatilhoCashbackExpirandoAntecedenciaValor) {
				return { valid: false, reason: "Defina a antecedência do aviso." };
			}
			return { valid: true };
		case "CASHBACK-ACUMULADO":
			// Both are optional — campaign can fire on any new cashback. Treat as valid.
			return { valid: true };
		case "QUANTIDADE-TOTAL-COMPRAS":
			if (!campaign.gatilhoQuantidadeTotalCompras || campaign.gatilhoQuantidadeTotalCompras <= 0) {
				return { valid: false, reason: "Defina a quantidade de compras." };
			}
			return { valid: true };
		case "VALOR-TOTAL-COMPRAS":
			if (!campaign.gatilhoValorTotalCompras || campaign.gatilhoValorTotalCompras <= 0) {
				return { valid: false, reason: "Defina o valor total de compras." };
			}
			return { valid: true };
		default:
			return { valid: true };
	}
}

function validateSendStage(campaign: TCampaign): TStageValidationResult {
	if (!campaign.whatsappTemplateId) return { valid: false, reason: "Selecione um template de mensagem." };
	if (!campaign.execucaoAgendadaBloco) return { valid: false, reason: "Selecione o bloco de horário." };
	const requiresDelay =
		campaign.gatilhoTipo !== "RECORRENTE" && campaign.gatilhoTipo !== "USO-UNICO" && campaign.gatilhoTipo !== "PROMOCAO-PRODUTOS";
	if (requiresDelay && (campaign.execucaoAgendadaValor === null || campaign.execucaoAgendadaValor === undefined)) {
		return { valid: false, reason: "Defina o valor do atraso de execução." };
	}
	return { valid: true };
}

function validateAudienceStage(): TStageValidationResult {
	// Audience is optional — empty filters and no segmentations send to everyone.
	return { valid: true };
}

function validateEffectsStage(campaign: TCampaign): TStageValidationResult {
	if (!campaign.cashbackGeracaoAtivo) return { valid: true };
	if (!campaign.cashbackGeracaoTipo) return { valid: false, reason: "Selecione o tipo de cashback." };
	if (!campaign.cashbackGeracaoValor || campaign.cashbackGeracaoValor <= 0) {
		return { valid: false, reason: "Defina o valor do cashback." };
	}
	const allowsPercentual = campaign.gatilhoTipo === "NOVA-COMPRA" || campaign.gatilhoTipo === "PRIMEIRA-COMPRA";
	if (!allowsPercentual && campaign.cashbackGeracaoTipo === "PERCENTUAL") {
		return { valid: false, reason: "PERCENTUAL só vale para NOVA/PRIMEIRA COMPRA. Troque para FIXO." };
	}
	return { valid: true };
}

function validateSettingsStage(campaign: TCampaign): TStageValidationResult {
	if (campaign.permitirRecorrencia && (!campaign.frequenciaIntervaloValor || campaign.frequenciaIntervaloValor <= 0)) {
		return { valid: false, reason: "Defina uma frequência de intervalo maior que zero." };
	}
	if (!campaign.atribuicaoModelo) return { valid: false, reason: "Selecione um modelo de atribuição." };
	if (!campaign.atribuicaoJanelaDias || campaign.atribuicaoJanelaDias <= 0) {
		return { valid: false, reason: "Defina a janela de atribuição em dias." };
	}
	return { valid: true };
}

function validateReviewStage(campaign: TCampaign): TStageValidationResult {
	if (!campaign.titulo || campaign.titulo.trim().length === 0) {
		return { valid: false, reason: "Dê um título para a campanha." };
	}
	return { valid: true };
}

export function validateStage(
	stage: TBuilderStageId,
	campaign: TCampaign,
	segmentations: TSegmentations,
): TStageValidationResult {
	switch (stage) {
		case "trigger":
			return validateTriggerStage(campaign, segmentations);
		case "send":
			return validateSendStage(campaign);
		case "audience":
			return validateAudienceStage();
		case "effects":
			return validateEffectsStage(campaign);
		case "settings":
			return validateSettingsStage(campaign);
		case "review":
			return validateReviewStage(campaign);
	}
}
