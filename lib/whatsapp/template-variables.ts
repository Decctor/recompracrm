import type { TCampaignTriggerTypeEnum } from "@/schemas/enums";

// --- Context groups ---

export type TVariableContextGroup = "CLIENTE" | "COMPRA" | "CASHBACK" | "CASHBACK_EXPIRANDO";

export const TRIGGER_CONTEXT_MAP: Record<TCampaignTriggerTypeEnum, TVariableContextGroup[]> = {
	"NOVA-COMPRA": ["CLIENTE", "COMPRA", "CASHBACK"],
	"PRIMEIRA-COMPRA": ["CLIENTE", "COMPRA", "CASHBACK"],
	"CASHBACK-ACUMULADO": ["CLIENTE", "COMPRA", "CASHBACK"],
	"CASHBACK-EXPIRANDO": ["CLIENTE", "CASHBACK", "CASHBACK_EXPIRANDO"],
	"PERMANÊNCIA-SEGMENTAÇÃO": ["CLIENTE", "CASHBACK"],
	"ENTRADA-SEGMENTAÇÃO": ["CLIENTE", "CASHBACK"],
	ANIVERSARIO_CLIENTE: ["CLIENTE", "CASHBACK"],
	"QUANTIDADE-TOTAL-COMPRAS": ["CLIENTE", "COMPRA", "CASHBACK"],
	"VALOR-TOTAL-COMPRAS": ["CLIENTE", "COMPRA", "CASHBACK"],
	RECORRENTE: ["CLIENTE", "CASHBACK"],
};

// --- Variable types ---

export type TWhatsappTemplateVariables = {
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
};

export type TWhatsappTemplateVariable = {
	id: string;
	label: string;
	value: keyof TWhatsappTemplateVariables;
	description: string;
	contexto: TVariableContextGroup;
};

export const WhatsappTemplateVariables: TWhatsappTemplateVariable[] = [
	// --- CLIENTE ---
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
	// --- COMPRA ---
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
	// --- CASHBACK ---
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
	// --- CASHBACK_EXPIRANDO ---
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
];

// --- Context metadata type (used in interaction metadados JSONB) ---

export type TInteractionContextMetadados = {
	// Sale context
	compraValor?: number;
	compraCashbackAcumulado?: number;
	compraCashbackNovoSaldo?: number;
	compraVendedorNome?: string;
	// Cashback context
	cashbackSaldoDisponivel?: number;
	cashbackTotalAcumuladoVida?: number;
	cashbackTotalResgatadoVida?: number;
	// Cashback expiring context
	cashbackExpirandoValor?: number;
	cashbackExpirandoData?: string;
};

// --- Variable context group labels (for UI grouping) ---

export const VARIABLE_CONTEXT_GROUP_LABELS: Record<TVariableContextGroup, string> = {
	CLIENTE: "Dados do Cliente",
	COMPRA: "Dados da Compra",
	CASHBACK: "Dados de Cashback",
	CASHBACK_EXPIRANDO: "Cashback Expirando",
};

// --- Helper functions ---

/**
 * Get available variables for a given trigger type.
 * Filters variables by the context groups allowed for the trigger.
 */
export function getVariablesForTrigger(triggerType: TCampaignTriggerTypeEnum): TWhatsappTemplateVariable[] {
	const allowedContexts = TRIGGER_CONTEXT_MAP[triggerType];
	if (!allowedContexts) return WhatsappTemplateVariables;
	return WhatsappTemplateVariables.filter((v) => allowedContexts.includes(v.contexto));
}

/**
 * Validate whether a template's parameters are compatible with a trigger type.
 * Returns an object with `valid` and a list of `incompatibleVariables` if invalid.
 */
export function validateTemplateForTrigger(
	parametros: { identificador?: string }[],
	triggerType: TCampaignTriggerTypeEnum,
): { valid: boolean; incompatibleVariables: string[] } {
	const allowedVariables = getVariablesForTrigger(triggerType);

	const allowedValues = new Set(allowedVariables.map((v) => v.value));

	const incompatibleVariables: string[] = [];
	for (const param of parametros) {
		if (param.identificador && !allowedValues.has(param.identificador as keyof TWhatsappTemplateVariables)) {
			const variableInfo = WhatsappTemplateVariables.find((v) => v.value === param.identificador);
			incompatibleVariables.push(variableInfo?.label ?? param.identificador);
		}
	}

	return {
		valid: incompatibleVariables.length === 0,
		incompatibleVariables,
	};
}
