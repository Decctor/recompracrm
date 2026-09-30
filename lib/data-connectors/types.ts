import type { TDataSourceIntegrationType } from "@/lib/integrations/data-sources";
import type { TPaymentMethodEnum, TSaleAttendanceStatusEnum } from "@/schemas/enums";
import type { TDataSourceIntegrationConfig } from "@/schemas/integrations";
import type { TSaleIntegrationMetadata } from "@/schemas/sales";

export type TDataConnectorKind = TDataSourceIntegrationType;

export type TCanonicalDeliveryMode = "PRESENCIAL" | "RETIRADA" | "ENTREGA" | "COMANDA" | null;

export type TCanonicalSaleItemRewritePolicy = "INSERT_ONLY_FOR_NEW_SALES" | "REPLACE_ON_EVERY_SYNC";

export type TCanonicalClientResolutionStrategy = "EXTERNAL_ID_THEN_PHONE" | "NAME_THEN_PHONE";

export type TCanonicalImportWindow = {
	startDate: Date;
	endDate: Date;
};

export type TCanonicalConnectorPolicies = {
	saleItemRewritePolicy: TCanonicalSaleItemRewritePolicy;
	clientResolutionStrategy: TCanonicalClientResolutionStrategy;
};

export type TCanonicalClient = {
	externalId: string | null;
	name: string;
	phone: string;
	basePhone: string;
	/** A fonte enviou uma rota temporária/mascarada; um telefone cadastral anterior deve ser limpo. */
	phoneIsTemporary?: boolean;
	cpfCnpj?: string | null;
	stateRegistration?: string | null;
	email?: string | null;
	location?: {
		cep?: string | null;
		state?: string | null;
		city?: string | null;
		neighborhood?: string | null;
		street?: string | null;
		number?: string | null;
		complement?: string | null;
		latitude?: string | null;
		longitude?: string | null;
	};
};

export type TCanonicalProduct = {
	externalId: string | null;
	code: string;
	description: string;
	unit: string;
	group: string;
	ncm: string;
	type: string;
};

export type TCanonicalSeller = {
	identifier: string;
	name: string;
};

export type TCanonicalPartner = {
	identifier: string;
	name: string;
	affiliateCode?: string | null;
	cpfCnpj?: string | null;
	clientLink?: {
		name: string;
		cpfCnpj?: string | null;
	};
};

export type TCanonicalProductAddOn = {
	externalId: string;
	name: string;
	minOptions: number;
	maxOptions: number;
};

export type TCanonicalProductAddOnOption = {
	externalId: string;
	addOnExternalId: string;
	name: string;
	code: string | null;
	priceDelta: number;
	maxQuantityPerItem: number;
};

export type TCanonicalSaleItemModifier = {
	addOnExternalId: string;
	optionExternalId: string;
	name?: string;
	quantity: number;
	unitValue: number;
};

export type TCanonicalSalePayment = {
	metodo: TPaymentMethodEnum;
	valor: number;
	/**
	 * true = pago online no canal (o dinheiro fica com o canal até o repasse — entra na conta
	 * de repasse first-party); false = pago na entrega/retirada (entra direto no caixa).
	 */
	pagoOnline: boolean;
	descricao?: string | null;
	/**
	 * Dinheiro na entrega: nota com que o cliente vai pagar (troco = trocoPara − valor). Informativo
	 * para quem entrega — não gera transação de troco. Ausente quando não há troco a levar.
	 */
	trocoPara?: number | null;
};

export type TCanonicalSaleItem = {
	productExternalId: string | null;
	productCode: string;
	quantity: number;
	unitSaleValue: number;
	unitCostValue: number;
	grossSaleValue: number;
	discountValue: number;
	netSaleValue: number;
	totalCostValue: number;
	notes?: string | null;
	metadata?: Record<string, unknown>;
	modifiers?: TCanonicalSaleItemModifier[];
};

export type TCanonicalSale = {
	sourceSaleId: string;
	displayId?: string | null;
	totalValue: number;
	totalCost: number;
	totalDiscount: number;
	totalSurcharge: number;
	sellerName: string;
	channel: string | null;
	deliveryMode: TCanonicalDeliveryMode;
	partnerIdentifier: string | null;
	key: string;
	document: string;
	model: string;
	movement: string;
	nature: string;
	series: string;
	statusText: string;
	type: string;
	notes?: string | null;
	occurredAt: Date;
	client: TCanonicalClient | null;
	seller: TCanonicalSeller | null;
	partner: TCanonicalPartner | null;
	items: TCanonicalSaleItem[];
	isValidSale: boolean;
	isCanceled: boolean;
	/**
	 * Status operacional granular informado pelo conector (ex.: ciclo de pedido do iFood).
	 * null/undefined = conector sem granularidade de fulfillment (comportamento legado:
	 * venda externa chega como histórico concluído).
	 */
	attendanceStatus?: TSaleAttendanceStatusEnum | null;
	/**
	 * Pagamentos informados pelo canal (ex.: payload do pedido iFood). null/undefined =
	 * conector sem dados de pagamento — nenhum efeito financeiro é gerado.
	 */
	payments?: TCanonicalSalePayment[] | null;
	/**
	 * Detalhamento do canal para fiscal/conciliação (frete próprio, descontos por patrocinador,
	 * taxas do canal). Persistido em `sales.integracaoMetadados`. null = sem detalhamento.
	 */
	integrationMetadata?: TSaleIntegrationMetadata | null;
	raw?: unknown;
};

/** Batch como cada conector o monta — sem `integrationId`, que é carimbado pelo dispatcher. */
export type TCanonicalConnectorBatch = {
	source: TDataConnectorKind;
	organizationId: string;
	window: TCanonicalImportWindow;
	policies: TCanonicalConnectorPolicies;
	sales: TCanonicalSale[];
	products: TCanonicalProduct[];
	sellers: TCanonicalSeller[];
	partners: TCanonicalPartner[];
	productAddOns: TCanonicalProductAddOn[];
	productAddOnOptions: TCanonicalProductAddOnOption[];
	raw?: unknown;
	postProcess?: () => Promise<void>;
};

/** Batch consumido pelo pipeline: sempre sabe de qual linha de `integrations` veio. */
export type TCanonicalImportBatch = TCanonicalConnectorBatch & {
	integrationId: string;
};

export type TDataConnectorFetchInput<TConfig extends TDataSourceIntegrationConfig = TDataSourceIntegrationConfig> = {
	organizationId: string;
	/** Linha de `integrations` dona da config — alvo dos refreshes de token row-scoped. */
	integrationId: string;
	config: TConfig;
	window: TCanonicalImportWindow;
};

export type TDataConnector<TConfig extends TDataSourceIntegrationConfig = TDataSourceIntegrationConfig> = {
	kind: TDataConnectorKind;
	fetchImportBatch: (input: TDataConnectorFetchInput<TConfig>) => Promise<TCanonicalConnectorBatch>;
};

export type TListedSaleClassification = "ELEGIVEL" | "IGNORADO" | "DESCONHECIDO";
export type TDataConnectorHistory<TConfig> = {
 describe: () => { supportsHistory: boolean; listIncludesStatus: boolean; supportsStatusFilterOnList: boolean; maxWindowDays: number | null; defaultStepDays: number; rateLimit: { perSecond: number | null; perDay: number | null } };
 listSales: (input: { config: TConfig; window: TCanonicalImportWindow; page: number }) => Promise<{ items: Array<{ sourceSaleId: string; statusText: string; occurredAt: Date | null }>; last: boolean; requests: number }>;
 classifyListedSale: (item: { statusText: string }) => TListedSaleClassification;
 buildBatchForSales: (input: { organizationId: string; integrationId: string; config: TConfig; window: TCanonicalImportWindow; sourceSaleIds: string[] }) => Promise<TCanonicalConnectorBatch & { requests: number }>;
};
