import type { TCanonicalSale } from "@/lib/data-connectors";
import { FIRST_PARTY_ACCOUNT_KEYS } from "@/lib/finances/first-party-accounts";
import { processManagedSaleFinancials } from "@/lib/sales/fulfillment-channels/managed-sale-financials";
import { getChannelErpPolicy } from "@/lib/sales/fulfillment-channels/policy";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { clients, sales } from "@/services/drizzle/schema";
import { and, eq, isNull } from "drizzle-orm";
import { resolveCampaignAudiences } from "./campaign-audiences";
import { processDataCollectingV2Effects } from "./effects";
import { shouldProcessIntegratedSaleConfirmation } from "./integrated-sale-confirmation-policy";
import { loadPurchaseEffectCampaigns } from "./purchase-effect-campaigns";
import type { TDataCollectingV2Executor, TPersistedSaleForEffects } from "./types";
import { attendanceStatusValues } from "@/lib/sales/sale-processing/attendance";

export async function processIntegratedSaleConfirmation({
	tx,
	organizationId,
	saleId,
	sale,
	organizationConfiguration,
}: {
	tx: TDataCollectingV2Executor;
	organizationId: string;
	saleId: string;
	sale: TCanonicalSale;
	organizationConfiguration: TOrganizationConfiguration | null;
}) {
	const existingSale = await tx.query.sales.findFirst({
		where: and(eq(sales.id, saleId), eq(sales.organizacaoId, organizationId)),
		columns: { id: true, clienteId: true, parceiroId: true, statusVenda: true, statusAtendimento: true },
		with: {
			cliente: {
				columns: {
					id: true,
					primeiraCompraId: true,
					metadataTotalCompras: true,
					metadataValorTotalCompras: true,
				},
			},
			parceiro: { columns: { clienteId: true } },
		},
	});
	if (!existingSale) throw new Error(`Venda ${saleId} não encontrada para confirmação.`);
	if (!shouldProcessIntegratedSaleConfirmation(existingSale)) {
		return { processed: false, immediateProcessingDataList: [] };
	}

	// Idempotência temporária: CONFIRMADA representa tanto a transição comercial quanto a
	// conclusão dos seus efeitos. A evolução correta é separar essas responsabilidades com um
	// marcador/ledger transacional de efeitos de confirmação, permitindo repetir efeitos que
	// falharam sem regredir o status comercial da venda.
	const claimed = await tx
		.update(sales)
		.set({ statusVenda: "CONFIRMADA", ...attendanceStatusValues("EM_PREPARO") })
		.where(and(eq(sales.id, saleId), eq(sales.organizacaoId, organizationId), isNull(sales.statusVenda), eq(sales.statusAtendimento, "NAO_INICIADO")))
		.returning({ id: sales.id });
	if (claimed.length === 0) return { processed: false, immediateProcessingDataList: [] };

	const client = existingSale.cliente;
	const previousTotalPurchaseCount = client?.metadataTotalCompras ?? 0;
	const previousTotalPurchaseValue = client?.metadataValorTotalCompras ?? 0;
	const newTotalPurchaseCount = client ? previousTotalPurchaseCount + 1 : null;
	const newTotalPurchaseValue = client ? previousTotalPurchaseValue + sale.totalValue : null;
	const isFirstPurchase = !!client && !client.primeiraCompraId && previousTotalPurchaseCount === 0;

	if (client && newTotalPurchaseCount !== null && newTotalPurchaseValue !== null) {
		await tx
			.update(clients)
			.set({
				ultimaCompraData: sale.occurredAt,
				ultimaCompraId: saleId,
				primeiraCompraData: isFirstPurchase ? sale.occurredAt : undefined,
				primeiraCompraId: isFirstPurchase ? saleId : undefined,
				metadataTotalCompras: newTotalPurchaseCount,
				metadataValorTotalCompras: newTotalPurchaseValue,
				metadataUltimaAtualizacao: new Date(),
			})
			.where(and(eq(clients.id, client.id), eq(clients.organizacaoId, organizationId)));
	}

	const persistedSale: TPersistedSaleForEffects = {
		id: saleId,
		sourceSaleId: sale.sourceSaleId,
		clientId: existingSale.clienteId,
		partnerClientId: existingSale.parceiro?.clienteId ?? null,
		sale: { ...sale, isValidSale: true, isCanceled: false },
		isNewSale: false,
		isNewClient: false,
		isFirstPurchase,
		previouslyValid: false,
		becameValid: true,
		nowCanceled: false,
		skipped: false,
		managedFiscalEmissionCandidate: false,
		newTotalPurchaseCount,
		newTotalPurchaseValue,
		previousTotalPurchaseCount: client ? previousTotalPurchaseCount : null,
		previousTotalPurchaseValue: client ? previousTotalPurchaseValue : null,
	};

	const purchaseCampaigns = await loadPurchaseEffectCampaigns(tx, organizationId);
	const audiencesByCampaignId = await resolveCampaignAudiences({
		tx,
		organizationId,
		campaigns: purchaseCampaigns,
	});
	const effectsResult = await processDataCollectingV2Effects({
		tx,
		organizationId,
		campaigns: purchaseCampaigns,
		audiencesByCampaignId,
		persistedSales: [persistedSale],
		options: { processCashback: true, processCampaigns: true, processConversionAttribution: true },
	});

	if (getChannelErpPolicy(organizationConfiguration).financeiro) {
		await processManagedSaleFinancials(tx, {
			organizationId,
			saleId,
			sale: persistedSale.sale,
			channelAccountKey: FIRST_PARTY_ACCOUNT_KEYS.IFOOD,
			organizationConfiguration,
		});
	}

	return { processed: true, immediateProcessingDataList: effectsResult.immediateProcessingDataList };
}
