import type {
	TAcquisitionNatureEnum,
	TPurchaseCostCounterpartyEnum,
	TPurchaseCostModifierKeyEnum,
	TPurchaseCostTreatmentEnum,
	TPurchaseEntryTaxRegimeEnum,
} from "@/schemas/enums";

/**
 * Presets de tratamento tributário na entrada, por regime de apuração (ADR-0002, decisão 7).
 * Função pura: (regime, destinação, chave, CRT do emitente) → tratamento. A organização sobrepõe
 * por `fiscalConfiguracao.entrada.tratamentos[destinacao][chave]`. A classificação concreta deve
 * ser validada com a contabilidade — isto é o padrão razoável, não a lei.
 *
 * Regra geral (CPC 16 + LC 87/96): tributo recuperável não é custo; uso e consumo não gera crédito
 * de ICMS (art. 33); fornecedor do Simples não destaca ICMS/PIS/COFINS, só o crédito presumido
 * (vCredICMSSN). Para um tributo INCLUSO_NO_VALOR, "custo" significa "deixa no preço" — o
 * componente é descartado, não gravado.
 */

export type TEntryTaxRuleResolution = {
	tratamento: TPurchaseCostTreatmentEnum | null;
	origem: "CONFIGURACAO" | "PRESET" | null;
	motivo: string;
};

export type TEntryTaxOverrides = Partial<Record<TAcquisitionNatureEnum, Partial<Record<TPurchaseCostModifierKeyEnum, TPurchaseCostTreatmentEnum>>>>;

const REGIME_LABELS: Record<TPurchaseEntryTaxRegimeEnum, string> = {
	SIMPLES_NACIONAL: "Simples Nacional",
	LUCRO_PRESUMIDO: "Lucro Presumido",
	LUCRO_REAL: "Lucro Real",
};

const DESTINATION_LABELS: Record<TAcquisitionNatureEnum, string> = {
	REVENDA: "revenda",
	INSUMO: "insumo",
	USO_CONSUMO: "uso e consumo",
	ATIVO_IMOBILIZADO: "ativo imobilizado",
};

const TAX_KEYS = new Set<TPurchaseCostModifierKeyEnum>([
	"IMPOSTOS_IPI",
	"IMPOSTOS_ICMS",
	"IMPOSTOS_ICMS_SN",
	"IMPOSTOS_PIS",
	"IMPOSTOS_COFINS",
	"IMPOSTOS_ICMS_ST",
	"IMPOSTOS_FCP_ST",
	"IMPOSTOS_ICMS_ST_ENTRADA",
	"IMPOSTOS_DIFAL",
	"IMPOSTOS_FCP_DIFAL",
	"IMPOSTOS_ANTECIPACAO",
	"IMPOSTOS_IBS",
	"IMPOSTOS_CBS",
]);

export function isTaxModifierKey(chave: TPurchaseCostModifierKeyEnum) {
	return TAX_KEYS.has(chave);
}

function presetTreatment({
	regime,
	contribuinteIpi,
	destinacao,
	chave,
}: {
	regime: TPurchaseEntryTaxRegimeEnum;
	contribuinteIpi: boolean;
	destinacao: TAcquisitionNatureEnum;
	chave: TPurchaseCostModifierKeyEnum;
}): TPurchaseCostTreatmentEnum {
	const creditable = destinacao === "REVENDA" || destinacao === "INSUMO";
	if (regime === "SIMPLES_NACIONAL") return "CUSTO_ESTOQUE";
	switch (chave) {
		case "IMPOSTOS_ICMS":
		case "IMPOSTOS_ICMS_SN":
			// Ativo imobilizado tem crédito, mas parcelado (CIAP): tratado pelo patrimônio, não aqui.
			return creditable ? "CREDITO_TRIBUTARIO" : "CUSTO_ESTOQUE";
		case "IMPOSTOS_IPI":
			return contribuinteIpi && creditable ? "CREDITO_TRIBUTARIO" : "CUSTO_ESTOQUE";
		case "IMPOSTOS_PIS":
		case "IMPOSTOS_COFINS":
			// Não cumulativo só no Lucro Real.
			return regime === "LUCRO_REAL" && creditable ? "CREDITO_TRIBUTARIO" : "CUSTO_ESTOQUE";
		case "IMPOSTOS_IBS":
		case "IMPOSTOS_CBS":
			return creditable ? "CREDITO_TRIBUTARIO" : "CUSTO_ESTOQUE";
		// ST, FCP-ST, DIFAL, antecipação: o destinatário não recupera.
		default:
			return "CUSTO_ESTOQUE";
	}
}

/**
 * Tratamento de um tributo de entrada. Override da organização → preset do regime → pendente
 * (sem regime configurado). `crtEmitente === 1` zera o crédito de ICMS/PIS/COFINS destacados: um
 * fornecedor do Simples não transfere esses créditos, só o presumido (`IMPOSTOS_ICMS_SN`).
 */
export function resolveEntryTaxTreatment({
	regime,
	contribuinteIpi = false,
	overrides,
	destinacao,
	chave,
	contrapartida,
	crtEmitente,
}: {
	regime: TPurchaseEntryTaxRegimeEnum | null | undefined;
	contribuinteIpi?: boolean;
	overrides?: TEntryTaxOverrides | null;
	destinacao: TAcquisitionNatureEnum;
	chave: TPurchaseCostModifierKeyEnum;
	contrapartida: TPurchaseCostCounterpartyEnum;
	crtEmitente?: number | null;
}): TEntryTaxRuleResolution {
	if (!isTaxModifierKey(chave)) return { tratamento: "CUSTO_ESTOQUE", origem: "PRESET", motivo: "Não é tributo: compõe o custo." };

	if (crtEmitente === 1 && contrapartida === "INCLUSO_NO_VALOR" && chave !== "IMPOSTOS_ICMS_SN")
		return { tratamento: "CUSTO_ESTOQUE", origem: "PRESET", motivo: "Fornecedor do Simples Nacional não transfere crédito de ICMS, PIS ou COFINS." };

	const override = overrides?.[destinacao]?.[chave];
	if (override) return { tratamento: override, origem: "CONFIGURACAO", motivo: `Configuração da organização para ${DESTINATION_LABELS[destinacao]}.` };

	if (!regime) return { tratamento: null, origem: null, motivo: "Regime de apuração não configurado em Fiscal › Entrada de compras." };

	const tratamento = presetTreatment({ regime, contribuinteIpi, destinacao, chave });
	return { tratamento, origem: "PRESET", motivo: `Preset ${REGIME_LABELS[regime]} · ${DESTINATION_LABELS[destinacao]}.` };
}

/** Regime de apuração deduzido do CRT quando a organização ainda não escolheu. CRT 3 é ambíguo. */
export function inferEntryTaxRegime(regimeTributario: number | null | undefined): TPurchaseEntryTaxRegimeEnum | null {
	if (regimeTributario === 1 || regimeTributario === 2 || regimeTributario === 4) return "SIMPLES_NACIONAL";
	return null;
}
