import type { TCanonicalImportBatch, TCanonicalSale } from "@/lib/data-connectors";
import type { TCampaignFilters } from "@/schemas/campaigns";
import type { DBTransaction } from "@/services/drizzle";
import type {
	TCampaignEntity,
	TCampaignSegmentationEntity,
	TMessageTemplate,
	TWhatsappConnection,
	TWhatsappConnectionPhone,
} from "@/services/drizzle/schema";

export type TDataCollectingV2Executor = DBTransaction;

export type TDataCollectingV2EffectsOptions = {
	processCashback: boolean;
	processCampaigns: boolean;
	processConversionAttribution: boolean;
};

export type TCampaignWithAudienceRelations = TCampaignEntity & {
	segmentacoes: TCampaignSegmentationEntity[];
	filtros: TCampaignFilters | null;
	whatsappTemplate?: TMessageTemplate | null;
	whatsappConexaoTelefone?: (TWhatsappConnectionPhone & { conexao?: Pick<TWhatsappConnection, "token" | "gatewaySessaoId"> | null }) | null;
};

export type TResolvedClientForImport = {
	id: string;
	name: string;
	basePhone: string;
	rfmTitle: string | null;
	metadataTotalPurchases: number;
	metadataTotalPurchaseValue: number;
	isNew: boolean;
};

export type TResolvedVariantForImport = {
	produtoId: string;
	// Vinculo de catalogo pode apontar para o produto sem variante; `sync-sales` ja trata o null.
	produtoVarianteId: string | null;
	// Snapshot dos eixos (Cor: Preto, Tamanho: G) para gravar em sale_items.metadados.
	opcoes: Array<{ eixo: string; valor: string }>;
};

export type TResolvedAuxiliaryEntities = {
	clientsByExternalId: Map<string, TResolvedClientForImport>;
	clientsByName: Map<string, TResolvedClientForImport>;
	clientsByBasePhone: Map<string, TResolvedClientForImport>;
	productsByCode: Map<string, string>;
	/**
	 * Vínculos de catálogo (catalog_links) por id do item remoto. É o casamento EXATO: o
	 * `codigo ↔ externalCode` continua como fallback, mas um item vinculado nunca depende dele.
	 */
	productsByExternalItemId: Map<string, TResolvedVariantForImport>;
	variantsByCode: Map<string, TResolvedVariantForImport>;
	sellersByIdentifier: Map<string, string>;
	partnersByIdentifier: Map<string, { id: string; clientId: string | null }>;
	productAddOnsByExternalId: Map<string, string>;
	productAddOnOptionsByExternalId: Map<string, string>;
	createdClientsCount: number;
	createdProductsCount: number;
	createdSellersCount: number;
	createdPartnersCount: number;
};

export type TPersistedSaleForEffects = {
	id: string;
	sourceSaleId: string;
	clientId: string | null;
	partnerClientId: string | null;
	sale: TCanonicalSale;
	isNewSale: boolean;
	isNewClient: boolean;
	isFirstPurchase: boolean;
	previouslyValid: boolean;
	/**
	 * A venda tornou-se válida NESTE sync (nova já válida, ou existente que era inválida —
	 * ex.: pedido iFood visto primeiro em PLACED e confirmado depois). É o gatilho único dos
	 * efeitos de "nova compra" (cashback, atribuição, campanhas, métricas do cliente) — o gate
	 * antigo `isNewSale && isValidSale` perdia a transição PLACED→CONFIRMED com ingestão em
	 * tempo real.
	 */
	becameValid: boolean;
	nowCanceled: boolean;
	/**
	 * Assinatura da projeção de persistência bateu com a carimbada — nenhuma escrita foi
	 * feita NESTE sync. Assinatura igual prova que a transação de import deste exato estado
	 * já commitou antes, então os efeitos (que são por-transição, mas `nowCanceled` é estado)
	 * devem ignorar a venda: sem isso, uma venda cancelada inalterada dispararia a reversão
	 * de cashback a cada run.
	 */
	skipped: boolean;
	/**
	 * Venda de canal gerenciado entregue com `policy.fiscal` ligada — candidata à emissão fiscal
	 * automática. O disparo acontece APÓS o commit da organização (a emissão lê via `db` e não
	 * enxergaria o estado pré-commit); a elegibilidade completa é re-checada lá (idempotente).
	 */
	managedFiscalEmissionCandidate: boolean;
	newTotalPurchaseCount: number | null;
	newTotalPurchaseValue: number | null;
	previousTotalPurchaseCount: number | null;
	previousTotalPurchaseValue: number | null;
};

export type TDataCollectingV2RunError = {
	organizationId: string;
	/** Linha de `integrations` que originou o erro. Null em erros fora do loop por integração. */
	integrationId: string | null;
	integrationType: string | null;
	message: string;
};

export type TDataCollectingV2RawBatch = {
	organizationId: string;
	integrationId: string;
	source: TCanonicalImportBatch["source"];
	window: TCanonicalImportBatch["window"];
	raw: unknown;
};

export type TDataCollectingV2RunSummary = {
	organizationId: string;
	integrationId: string;
	source: TCanonicalImportBatch["source"];
	importedSalesCount: number;
	/** Colisões de idExterno fail-closed (D4) — itens ignorados sem alterar a venda existente. */
	saleIdCollisionsCount: number;
	createdSalesCount: number;
	/** Escritas reais: existentes com assinatura divergente (exclui as puladas). */
	updatedSalesCount: number;
	/** Existentes puladas por assinatura igual (nenhuma escrita neste sync). */
	unchangedSalesCount: number;
	createdClientsCount: number;
	createdProductsCount: number;
	createdSellersCount: number;
	createdPartnersCount: number;
	resolvedCampaignAudiencesCount: number;
	campaignEventsCapturedCount: number;
	/** @deprecated Dispatch creation is asynchronous; this synchronous count is zero. */
	createdInteractionsCount: number;
	immediateInteractionsCount: number;
	cashbackTransactionsCount: number;
	cashbackAccumulatedValue: number;
	firstPurchaseInteractionsCount: number;
	cashbackAccumulationInteractionsCount: number;
};
