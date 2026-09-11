import dayjs from "dayjs";
import type { TPaymentEffectivenessTypeEnum } from "./schemas";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import type { TDeliveryModeEnum, TPaymentMethodEnum } from "@/schemas/enums";

type TOrganizationPaymentMethodsConfig = TOrganizationConfiguration["defaults"]["pagamentos"]["metodos"];
type TPaymentMethodDefaultsConfig = TOrganizationPaymentMethodsConfig[TPaymentMethodEnum];

export type TResolvedPaymentMethodDefault = {
	metodo: TPaymentMethodEnum;
	efetivacaoTipo: TPaymentEffectivenessTypeEnum;
	dataPrevisao: string | null;
	totalParcelas: number | null;
	contaFinanceiraPadraoId: string | null;
	contaFinanceiraEditavel: boolean;
	parcelasDisponiveis: number[];
};

const DEFAULT_PAYMENT_METHOD_CONFIG: TPaymentMethodDefaultsConfig = {
	suportado: false,
	contaFinanceiraPadraoId: null,
	contaFinanceiraPadraoKey: null,
	contaFinanceiraEditavel: false,
	efetivacaoTipoPadrao: "IMEDIATA",
	delayDiasPadrao: 0,
	parcelamento: {
		permitido: false,
		minParcelas: 0,
		maxParcelas: null,
		intervaloMeses: null,
	},
};

export const FALLBACK_PAYMENT_METHOD_DEFAULTS: TOrganizationPaymentMethodsConfig = {
	DINHEIRO: {
		...DEFAULT_PAYMENT_METHOD_CONFIG,
		suportado: true,
		contaFinanceiraPadraoKey: "caixa_principal",
	},
	PIX: {
		...DEFAULT_PAYMENT_METHOD_CONFIG,
		suportado: true,
		contaFinanceiraPadraoKey: "carteira_digital_pix",
	},
	CARTAO_DEBITO: {
		...DEFAULT_PAYMENT_METHOD_CONFIG,
		suportado: true,
		contaFinanceiraPadraoKey: "conta_bancaria_principal",
	},
	CARTAO_CREDITO: {
		...DEFAULT_PAYMENT_METHOD_CONFIG,
		suportado: true,
		contaFinanceiraPadraoKey: "conta_bancaria_principal",
		parcelamento: {
			permitido: true,
			minParcelas: 1,
			maxParcelas: 12,
			intervaloMeses: 1,
		},
	},
	BOLETO: {
		...DEFAULT_PAYMENT_METHOD_CONFIG,
		contaFinanceiraPadraoKey: "conta_bancaria_principal",
		efetivacaoTipoPadrao: "PENDENTE",
		delayDiasPadrao: 3,
	},
	TRANSFERENCIA: {
		...DEFAULT_PAYMENT_METHOD_CONFIG,
		contaFinanceiraPadraoKey: "conta_bancaria_principal",
	},
	CASHBACK: { ...DEFAULT_PAYMENT_METHOD_CONFIG },
	VALE: { ...DEFAULT_PAYMENT_METHOD_CONFIG },
	A_DEFINIR: {
		...DEFAULT_PAYMENT_METHOD_CONFIG,
		suportado: true,
		efetivacaoTipoPadrao: "PENDENTE",
	},
	FIADO_NOTA: {
		...DEFAULT_PAYMENT_METHOD_CONFIG,
		suportado: true,
		efetivacaoTipoPadrao: "PENDENTE",
		delayDiasPadrao: 30,
	},
	OUTRO: { ...DEFAULT_PAYMENT_METHOD_CONFIG },
};

export function getOrganizationPaymentMethodsConfig(
	organizationConfig?: Pick<TOrganizationConfiguration, "defaults"> | null,
): TOrganizationPaymentMethodsConfig {
	return organizationConfig?.defaults.pagamentos.metodos ?? FALLBACK_PAYMENT_METHOD_DEFAULTS;
}

export function getPaymentInstallmentsOptions(config?: TPaymentMethodDefaultsConfig | null) {
	if (!config) return [];
	if (!config.parcelamento.permitido) return [];
	if (config.parcelamento.maxParcelas == null) return [];
	const start = Math.max(1, config.parcelamento.minParcelas);
	const end = Math.max(start, config.parcelamento.maxParcelas);
	return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function getOrganizationPaymentMethodDefault({
	organizationConfig,
	metodo,
	baseDate,
	entregaModalidade,
}: {
	organizationConfig?: Pick<TOrganizationConfiguration, "defaults"> | null;
	metodo: TPaymentMethodEnum;
	baseDate?: string | Date;
	// Modalidade da venda em curso. ENTREGA muda o default de efetivação para PENDENTE — o dinheiro
	// só troca de mãos na porta do cliente (previsão = âncora + delay do método; delay 0 cai em
	// "previsto para hoje"). É default, não invariante: o operador pode voltar para IMEDIATA
	// (ex.: PIX antecipado numa entrega).
	entregaModalidade?: TDeliveryModeEnum | null;
}): TResolvedPaymentMethodDefault {
	const methods = getOrganizationPaymentMethodsConfig(organizationConfig);
	const config = methods[metodo] ?? DEFAULT_PAYMENT_METHOD_CONFIG;
	const anchorDate = baseDate ? dayjs(baseDate) : dayjs();
	const dataPrevisao = anchorDate.add(config.delayDiasPadrao ?? 0, "day").format("YYYY-MM-DD");

	return {
		metodo,
		efetivacaoTipo: entregaModalidade === "ENTREGA" ? "PENDENTE" : config.efetivacaoTipoPadrao,
		dataPrevisao,
		totalParcelas: null,
		contaFinanceiraPadraoId: config.contaFinanceiraPadraoId,
		// Organizações anteriores ao campo não têm a chave no jsonb (que não é parseado na leitura).
		contaFinanceiraEditavel: config.contaFinanceiraEditavel ?? false,
		parcelasDisponiveis: getPaymentInstallmentsOptions(config),
	};
}
