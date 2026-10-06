import type {
	TFiscalClientTaxIndicatorEnum,
	TFiscalIcmsCsosnEnum,
	TFiscalOperationFinalityEnum,
	TFiscalPisCofinsCstEnum,
	TFiscalProductOriginEnum,
	TFiscalTaxRuleScopeEnum,
} from "@/schemas/enums";
import type { TFiscalTaxGroupEntity, TFiscalTaxGroupRuleEntity } from "@/services/drizzle/schema";

export type TFiscalTaxGroupWithRules = TFiscalTaxGroupEntity & {
	regras: TFiscalTaxGroupRuleEntity[];
};

// Cenario da operacao que dirige a resolucao tributaria de um item.
export type TFiscalTaxScenario = {
	regimeTributario: number; // CRT do emitente
	ufOrigem: string;
	ufDestino: string;
	escopo: TFiscalTaxRuleScopeEnum;
	consumidorFinal: boolean;
	finalidade: TFiscalOperationFinalityEnum;
	indicadorDestinatario: TFiscalClientTaxIndicatorEnum;
};

// Configuracao tributaria efetiva apos aplicar a regra mais especifica sobre os defaults do grupo.
export type TEffectiveTaxConfig = {
	csosn: TFiscalIcmsCsosnEnum;
	aliquotaIcms: number;
	percentualReducaoBc: number;
	modalidadeBc: number;
	percentualCreditoSn: number | null;
	temSubstituicaoTributaria: boolean;
	mvaSt: number | null;
	aliquotaIcmsSt: number | null;
	aliquotaInternaDestino: number | null;
	percentualReducaoBcSt: number | null;
	aliquotaFcp: number;
	aliquotaFcpSt: number;
	cstPis: TFiscalPisCofinsCstEnum;
	aliquotaPis: number;
	cstCofins: TFiscalPisCofinsCstEnum;
	aliquotaCofins: number;
};

export type TFiscalItemInput = {
	produtoId: string;
	origemMercadoria: TFiscalProductOriginEnum;
	cfopBase: string | null; // CFOP do perfil do produto ou da operacao
	cest?: string | null; // CEST do produto (indicativo de substituicao tributaria)
	quantidade: number;
	valorBruto: number; // valor total bruto do item (sem desconto)
	valorDesconto: number;
	valorFrete?: number; // parcela do frete alocada ao item
	valorOutros?: number; // parcela do acrescimo (nao frete) alocada ao item — vOutro
};

export type TFiscalValidationSeverity = "ERRO" | "AVISO";

export type TFiscalValidationError = {
	codigo: string;
	severidade: TFiscalValidationSeverity;
	mensagem: string;
	produtoId?: string;
};

export type TIcmsTaxResult = {
	csosn: TFiscalIcmsCsosnEnum;
	/** Codigo 0-8 do campo orig (inteiro na API Nuvem Fiscal). */
	origem: number;
	vBC: number;
	pICMS: number;
	vICMS: number;
	vFCP: number;
	pCredSN: number | null;
	vCredICMSSN: number | null;
	st: {
		vBCST: number;
		pMVAST: number;
		pICMSST: number;
		vICMSST: number;
		vFCPST: number;
	} | null;
};

export type TItemTaxResult = {
	produtoId: string;
	cfop: string | null;
	icms: TIcmsTaxResult;
	pis: { cst: TFiscalPisCofinsCstEnum; vBC: number; pPIS: number; vPIS: number };
	cofins: { cst: TFiscalPisCofinsCstEnum; vBC: number; pCOFINS: number; vCOFINS: number };
	vTotTrib: number;
	erros: TFiscalValidationError[];
};

export type TDocumentTaxTotals = {
	vBC: number;
	vICMS: number;
	vFCP: number;
	vBCST: number;
	vST: number;
	vFCPST: number;
	vProd: number;
	vDesc: number;
	vPIS: number;
	vCOFINS: number;
	vTotTrib: number;
	/** Frete cobrado do destinatário (entrega própria de canal gerenciado). Compõe o vNF. */
	vFrete: number;
	/** Acréscimo da venda que não é frete (ex.: acréscimo geral do PDV). Compõe o vNF. */
	vOutro: number;
	vNF: number;
};
