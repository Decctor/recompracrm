import type { TCampaignTriggerTypeEnum, TCashbackProgramTerminologyEnum } from "@/schemas/enums";

export type TMessageTemplateVariableContextGroup = "CLIENTE" | "COMPRA" | "CASHBACK" | "CASHBACK_EXPIRANDO" | "CUPOM" | "PROMOCAO";

// CUPOM está disponível em todos os gatilhos: qualquer campanha pode atribuir um cupom ao disparar.
export const MESSAGE_TEMPLATE_TRIGGER_CONTEXT_MAP: Record<TCampaignTriggerTypeEnum, TMessageTemplateVariableContextGroup[]> = {
	"NOVA-COMPRA": ["CLIENTE", "COMPRA", "CASHBACK", "CUPOM"],
	"PRIMEIRA-COMPRA": ["CLIENTE", "COMPRA", "CASHBACK", "CUPOM"],
	"CASHBACK-ACUMULADO": ["CLIENTE", "COMPRA", "CASHBACK", "CUPOM"],
	"CASHBACK-EXPIRANDO": ["CLIENTE", "CASHBACK", "CASHBACK_EXPIRANDO", "CUPOM"],
	"PERMANÊNCIA-SEGMENTAÇÃO": ["CLIENTE", "CASHBACK", "CUPOM"],
	"ENTRADA-SEGMENTAÇÃO": ["CLIENTE", "CASHBACK", "CUPOM"],
	ANIVERSARIO_CLIENTE: ["CLIENTE", "CASHBACK", "CUPOM"],
	"QUANTIDADE-TOTAL-COMPRAS": ["CLIENTE", "COMPRA", "CASHBACK", "CUPOM"],
	"VALOR-TOTAL-COMPRAS": ["CLIENTE", "COMPRA", "CASHBACK", "CUPOM"],
	RECORRENTE: ["CLIENTE", "CASHBACK", "CUPOM"],
	"PIOR-DIA-VENDAS": ["CLIENTE", "CASHBACK", "CUPOM"],
	"USO-UNICO": ["CLIENTE", "CASHBACK", "CUPOM"],
	// PROMOCAO é exclusivo deste gatilho: só ele resolve um produto sugerido da lista promovida.
	"PROMOCAO-PRODUTOS": ["CLIENTE", "PROMOCAO", "CASHBACK", "CUPOM"],
};

export type TMessageTemplateVariables = {
	clientName: string;
	clientPhoneNumber: string;
	clientEmail: string;
	clientSegmentation: string | null;
	clientFavoriteProduct: string | null;
	clientFavoriteProductGroup: string | null;
	clientSuggestedProduct: string | null;
	purchaseValue: string;
	purchaseCashbackAccumulated: string;
	purchaseCashbackNewBalance: string;
	purchaseSellerName: string;
	cashbackAvailableBalance: string;
	cashbackLifetimeAccumulated: string;
	cashbackLifetimeRedeemed: string;
	cashbackExpiringAmount: string;
	cashbackExpiringDate: string;
	cashbackExpiringWindow: string;
	couponCode: string;
	couponTitle: string;
	couponExpirationDate: string;
	promotionProductName: string;
	promotionProductPrice: string;
	promotionProductOriginalPrice: string;
};

export type TMessageTemplateVariable = {
	id: string;
	label: string;
	value: keyof TMessageTemplateVariables;
	description: string;
	contexto: TMessageTemplateVariableContextGroup;
};

export const MessageTemplateVariables: TMessageTemplateVariable[] = [
	{
		id: "client_name",
		label: "Nome do Cliente",
		value: "clientName",
		description: "Nome completo do cliente registrado no banco de dados.",
		contexto: "CLIENTE",
	},
	{
		id: "client_phone_number",
		label: "Número de Telefone do Cliente",
		value: "clientPhoneNumber",
		description: "Número de telefone do cliente registrado no banco de dados.",
		contexto: "CLIENTE",
	},
	{
		id: "client_email",
		label: "Email do Cliente",
		value: "clientEmail",
		description: "Email do cliente registrado no banco de dados.",
		contexto: "CLIENTE",
	},
	{
		id: "client_segmentation",
		label: "Segmentação do Cliente",
		value: "clientSegmentation",
		description: "Segmentação do cliente registrado no banco de dados.",
		contexto: "CLIENTE",
	},
	{
		id: "client_favorite_product",
		label: "Produto Favorito do Cliente",
		value: "clientFavoriteProduct",
		description: "Produto favorito do cliente registrado no banco de dados.",
		contexto: "CLIENTE",
	},
	{
		id: "client_favorite_product_group",
		label: "Grupo de Produtos Favorito do Cliente",
		value: "clientFavoriteProductGroup",
		description: "Grupo de produtos favorito do cliente registrado no banco de dados.",
		contexto: "CLIENTE",
	},
	{
		id: "client_suggested_product",
		label: "Produto Sugerido para o Cliente",
		value: "clientSuggestedProduct",
		description: "Produto sugerido para o cliente registrado no banco de dados.",
		contexto: "CLIENTE",
	},
	{
		id: "purchase_value",
		label: "Valor da Compra",
		value: "purchaseValue",
		description: "Valor total da compra que acionou a campanha.",
		contexto: "COMPRA",
	},
	{
		id: "purchase_cashback_accumulated",
		label: "Cashback Acumulado na Compra",
		value: "purchaseCashbackAccumulated",
		description: "Valor de cashback acumulado nesta compra.",
		contexto: "COMPRA",
	},
	{
		id: "purchase_cashback_new_balance",
		label: "Novo Saldo de Cashback",
		value: "purchaseCashbackNewBalance",
		description: "Novo saldo total de cashback após esta compra.",
		contexto: "COMPRA",
	},
	{
		id: "purchase_seller_name",
		label: "Nome do Vendedor",
		value: "purchaseSellerName",
		description: "Nome do vendedor que realizou a venda.",
		contexto: "COMPRA",
	},
	{
		id: "cashback_available_balance",
		label: "Saldo Disponível de Cashback",
		value: "cashbackAvailableBalance",
		description: "Saldo atual disponível de cashback do cliente.",
		contexto: "CASHBACK",
	},
	{
		id: "cashback_lifetime_accumulated",
		label: "Total Acumulado de Cashback",
		value: "cashbackLifetimeAccumulated",
		description: "Total de cashback acumulado pelo cliente desde o início.",
		contexto: "CASHBACK",
	},
	{
		id: "cashback_lifetime_redeemed",
		label: "Total Resgatado de Cashback",
		value: "cashbackLifetimeRedeemed",
		description: "Total de cashback já resgatado pelo cliente.",
		contexto: "CASHBACK",
	},
	{
		id: "cashback_expiring_amount",
		label: "Valor de Cashback Expirando",
		value: "cashbackExpiringAmount",
		description: "Valor de cashback que está prestes a expirar.",
		contexto: "CASHBACK_EXPIRANDO",
	},
	{
		id: "cashback_expiring_date",
		label: "Data de Expiração do Cashback",
		value: "cashbackExpiringDate",
		description: "Data em que o cashback irá expirar.",
		contexto: "CASHBACK_EXPIRANDO",
	},
	{
		id: "cashback_expiring_window",
		label: "Janela de Cashback Expirando",
		value: "cashbackExpiringWindow",
		description: 'Texto da janela em que o cashback está prestes a expirar, como "nos próximos 7 dias".',
		contexto: "CASHBACK_EXPIRANDO",
	},
	{
		id: "coupon_code",
		label: "Código do Cupom",
		value: "couponCode",
		description: "Código do cupom atribuído ao cliente pela campanha.",
		contexto: "CUPOM",
	},
	{
		id: "coupon_title",
		label: "Título do Cupom",
		value: "couponTitle",
		description: "Título do cupom atribuído ao cliente pela campanha.",
		contexto: "CUPOM",
	},
	{
		id: "coupon_expiration_date",
		label: "Data de Expiração do Cupom",
		value: "couponExpirationDate",
		description: "Data em que a atribuição do cupom expira.",
		contexto: "CUPOM",
	},
	{
		id: "promotion_product_name",
		label: "Nome do Produto da Promoção",
		value: "promotionProductName",
		description: "Nome do produto da promoção sugerido para o cliente, escolhido entre os produtos promovidos pela campanha.",
		contexto: "PROMOCAO",
	},
	{
		id: "promotion_product_price",
		label: "Preço Promocional do Produto",
		value: "promotionProductPrice",
		description: "Preço do produto sugerido na promoção: o preço promocional definido na campanha ou, na ausência dele, o preço de venda.",
		contexto: "PROMOCAO",
	},
	{
		id: "promotion_product_original_price",
		label: "Preço Original do Produto",
		value: "promotionProductOriginalPrice",
		description: "Preço de venda do produto sugerido antes do desconto da promoção.",
		contexto: "PROMOCAO",
	},
];

export type TInteractionContextMetadados = {
	terminologia?: TCashbackProgramTerminologyEnum;
	compraValor?: number;
	compraCashbackAcumulado?: number;
	compraCashbackNovoSaldo?: number;
	compraVendedorNome?: string;
	compraQuantidadeTotal?: number;
	compraValorTotalAcumulado?: number;
	cashbackAcumuladoValor?: number;
	cashbackSaldoDisponivel?: number;
	cashbackTotalAcumuladoVida?: number;
	cashbackTotalResgatadoVida?: number;
	cashbackExpirandoValor?: number;
	cashbackExpirandoData?: string;
	cashbackExpirandoJanela?: string;
	cupomCodigo?: string;
	cupomTitulo?: string;
	cupomExpiracaoData?: string;
	// Snapshot do produto sugerido da promoção, resolvido por cliente no enfileiramento
	// (ver lib/campaigns/promotion-suggestion.ts). Congelar aqui mantém a mensagem estável
	// mesmo que o catálogo mude entre o enfileiramento e o envio.
	promocaoProdutoId?: string;
	promocaoProdutoNome?: string;
	promocaoProdutoPrecoOriginal?: number;
	promocaoProdutoPrecoPromocional?: number; // preço efetivo (sobrescrita ?? preço de venda)
	promocaoProdutoImagemUrl?: string; // sem uso na v1; habilita o cabeçalho dinâmico da v2
};

export const MESSAGE_TEMPLATE_VARIABLE_CONTEXT_GROUP_LABELS: Record<TMessageTemplateVariableContextGroup, string> = {
	CLIENTE: "Dados do Cliente",
	COMPRA: "Dados da Compra",
	CASHBACK: "Dados de Cashback",
	CASHBACK_EXPIRANDO: "Cashback Expirando",
	CUPOM: "Dados de Cupom",
	PROMOCAO: "Produto Sugerido da Promoção",
};

export function getVariablesForTrigger(triggerType: TCampaignTriggerTypeEnum): TMessageTemplateVariable[] {
	const allowedContexts = MESSAGE_TEMPLATE_TRIGGER_CONTEXT_MAP[triggerType];
	if (!allowedContexts) return MessageTemplateVariables;
	return MessageTemplateVariables.filter((variable) => allowedContexts.includes(variable.contexto));
}

export function validateTemplateForTrigger(
	parametros: { identificador?: string }[],
	triggerType: TCampaignTriggerTypeEnum,
): { valid: boolean; incompatibleVariables: string[] } {
	const allowedVariables = getVariablesForTrigger(triggerType);
	const allowedValues = new Set(allowedVariables.map((variable) => variable.value));
	const incompatibleVariables: string[] = [];

	for (const param of parametros) {
		if (param.identificador && !allowedValues.has(param.identificador as keyof TMessageTemplateVariables)) {
			const variableInfo = MessageTemplateVariables.find((variable) => variable.value === param.identificador);
			incompatibleVariables.push(variableInfo?.label ?? param.identificador);
		}
	}

	return {
		valid: incompatibleVariables.length === 0,
		incompatibleVariables,
	};
}

export const MessageTemplateNativeVariables = MessageTemplateVariables.map((variable) => ({
	identificador: variable.value,
	label: variable.label,
	description: variable.description,
	contexto: variable.contexto,
	metaId: variable.id,
}));

export type TMessageTemplateNativeVariable = (typeof MessageTemplateNativeVariables)[number];
export type TMessageTemplateNativeVariableId = TMessageTemplateNativeVariable["identificador"];

export const MessageTemplateNativeVariablesById = new Map<string, TMessageTemplateNativeVariable>(
	MessageTemplateNativeVariables.map((variable) => [variable.identificador, variable]),
);

export const MessageTemplateVariableExampleValues: Record<string, string> = {
	clientName: "Lucas",
	clientPhoneNumber: "(11) 99999-9999",
	clientEmail: "lucas@exemplo.com",
	clientSegmentation: "Cliente VIP",
	clientFavoriteProduct: "Cappuccino",
	clientFavoriteProductGroup: "Cafés especiais",
	clientSuggestedProduct: "Croissant artesanal",
	purchaseValue: "R$ 120,00",
	purchaseCashbackAccumulated: "R$ 12,00",
	purchaseCashbackNewBalance: "R$ 42,00",
	purchaseSellerName: "Mariana",
	cashbackAvailableBalance: "R$ 42,00",
	cashbackLifetimeAccumulated: "R$ 180,00",
	cashbackLifetimeRedeemed: "R$ 138,00",
	cashbackExpiringAmount: "R$ 10,00",
	cashbackExpiringDate: "27/05/2026",
	cashbackExpiringWindow: "nos próximos 7 dias",
	promotionProductName: "Cappuccino",
	promotionProductPrice: "R$ 9,90",
	promotionProductOriginalPrice: "R$ 12,90",
};

export function isAllowedMessageTemplateVariable(identifier: string) {
	return MessageTemplateNativeVariablesById.has(identifier);
}

export function getMessageTemplateVariable(identifier: string) {
	return MessageTemplateNativeVariablesById.get(identifier) ?? null;
}

export function getDefaultMessageTemplateVariableExample(identifier: string) {
	return MessageTemplateVariableExampleValues[identifier] ?? "Exemplo";
}
