import type { TCanonicalImportBatch, TCanonicalSale, TCanonicalSaleItem } from "@/lib/data-connectors";
import { mapCanonicalSaleAttendanceStatus, mapCanonicalSaleCommercialStatus } from "@/lib/data-connectors";
import { attendanceStatusRequiresPhysicalOut, attendanceStatusValuesIfChanged, isValidAttendanceTransition } from "@/lib/sales/sale-processing/attendance";
import {
	cancelManagedSaleFinancials,
	processManagedSaleFinancials,
	settleManagedSaleOfflinePayments,
} from "@/lib/sales/fulfillment-channels/managed-sale-financials";
import { isManagedFulfillmentSaleModel, type TChannelErpPolicy } from "@/lib/sales/fulfillment-channels/policy";
import { processStockDeduction } from "@/lib/sales/sale-processing/process-stock-deduction";
import { FIRST_PARTY_ACCOUNT_KEYS } from "@/lib/finances/first-party-accounts";
import type { TOrganizationConfiguration } from "@/schemas/organizations";
import { clients, saleItemModifiers, saleItems, sales } from "@/services/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import { resolveDeliveryLocationId } from "./delivery-locations";
import { computeSaleImportSignature } from "./sale-signature";
import { getCanonicalClientResolutionKey, resolveClientForCanonicalSale } from "./sync-auxiliary-entities";
import type { TDataCollectingV2Executor, TPersistedSaleForEffects, TResolvedAuxiliaryEntities, TResolvedClientForImport } from "./types";

export type TSyncSalesErpOptions = {
	policy: TChannelErpPolicy;
	stockTrackingEnabled: boolean;
	organizationConfiguration: TOrganizationConfiguration | null;
};

/**
 * Efeitos de entrega de uma venda de canal gerenciado: baixa de estoque (guardada), registro de
 * quantidade entregue e efetivação dos pagamentos "na entrega". Cada efeito roda num savepoint:
 * falha (produto sem lote, sem saldo etc.) não pode abortar a importação da organização inteira.
 * Idempotente — pode rodar em todo sync de venda entregue.
 */
async function applyManagedSaleDeliveryEffects({
	tx,
	organizationId,
	saleId,
	deductStock,
	settleOfflinePayments,
}: {
	tx: TDataCollectingV2Executor;
	organizationId: string;
	saleId: string;
	deductStock: boolean;
	settleOfflinePayments: boolean;
}) {
	const itemsForStock = await tx.query.saleItems.findMany({
		where: and(eq(saleItems.vendaId, saleId), eq(saleItems.organizacaoId, organizationId)),
		with: { adicionais: true },
	});

	if (deductStock) {
		try {
			await tx.transaction(async (nested) => {
				// Replay de webhook e seguro: a deduplicacao por item vive dentro de processStockDeduction.
				await processStockDeduction(nested, {
					organizationId,
					saleId,
					saleItems: itemsForStock,
					saleAuthorId: null,
				});
			});
		} catch (error) {
			console.error(`[SYNC_SALES] Falha na baixa de estoque da venda gerenciada ${saleId} — venda importada sem baixa.`, error);
		}
	}

	for (const item of itemsForStock) {
		if (item.quantidadeEntregue !== item.quantidade) {
			await tx.update(saleItems).set({ quantidadeEntregue: item.quantidade }).where(eq(saleItems.id, item.id));
		}
	}

	if (settleOfflinePayments) {
		try {
			await tx.transaction(async (nested) => {
				await settleManagedSaleOfflinePayments(nested, { organizationId, saleId });
			});
		} catch (error) {
			console.error(`[SYNC_SALES] Falha ao efetivar pagamentos na entrega da venda gerenciada ${saleId}.`, error);
		}
	}
}

function getSellerId(context: TResolvedAuxiliaryEntities, sale: TCanonicalSale) {
	return sale.seller?.identifier ? (context.sellersByIdentifier.get(sale.seller.identifier) ?? null) : null;
}

function getPartner(context: TResolvedAuxiliaryEntities, sale: TCanonicalSale) {
	return sale.partnerIdentifier ? (context.partnersByIdentifier.get(sale.partnerIdentifier) ?? null) : null;
}

// Resolve o item de venda: vínculo de catálogo (exato) > variante estruturada > produto plano.
function resolveSaleItemTarget(context: TResolvedAuxiliaryEntities, item: TCanonicalSaleItem) {
	// O vínculo vem primeiro porque é o único casamento que não depende de o provedor ter
	// preenchido `externalCode` com o mesmo valor do nosso `codigo`.
	const linked = item.productExternalId ? context.productsByExternalItemId.get(item.productExternalId) : undefined;
	if (linked) {
		return { produtoId: linked.produtoId, produtoVarianteId: linked.produtoVarianteId, opcoes: linked.opcoes };
	}
	const variant = context.variantsByCode.get(item.productCode);
	if (variant) {
		return { produtoId: variant.produtoId, produtoVarianteId: variant.produtoVarianteId, opcoes: variant.opcoes };
	}
	const produtoId = context.productsByCode.get(item.productCode);
	if (produtoId) {
		return { produtoId, produtoVarianteId: null, opcoes: [] as Array<{ eixo: string; valor: string }> };
	}
	return null;
}

function buildSaleValues({
	batch,
	sale,
	clientId,
	deliveryLocationId,
	sellerId,
	partnerId,
}: {
	batch: TCanonicalImportBatch;
	sale: TCanonicalSale;
	clientId: string | null;
	deliveryLocationId: string | null;
	sellerId: string | null;
	partnerId: string | null;
}) {
	return {
		organizacaoId: batch.organizationId,
		idExterno: sale.sourceSaleId,
		integracaoId: batch.integrationId,
		clienteId: clientId,
		valorTotal: sale.totalValue,
		descontosTotal: sale.totalDiscount,
		acrescimosTotal: sale.totalSurcharge,
		custoTotal: sale.totalCost,
		vendedorNome: sale.sellerName,
		vendedorId: sellerId,
		parceiro: sale.partnerIdentifier ?? "N/A",
		parceiroId: partnerId,
		chave: sale.key,
		documento: sale.document,
		modelo: sale.model,
		movimento: sale.movement,
		natureza: sale.nature,
		serie: sale.series,
		situacao: sale.statusText,
		tipo: sale.type,
		canal: sale.channel,
		entregaModalidade: sale.deliveryMode,
		entregaLocalizacaoId: deliveryLocationId,
		observacoes: sale.notes,
		dataVenda: sale.occurredAt,
		processamentoOrigem: "EXTERNO" as const,
		// Mapeamento conservador a partir dos sinais canonicos ja calculados por cada conector
		// (isValidSale/isCanceled). Vendas externas NAO geram efeitos de ERP na plataforma.
		statusVenda: mapCanonicalSaleCommercialStatus(sale),
		statusAtendimento: mapCanonicalSaleAttendanceStatus(sale),
		// Detalhamento do canal (fiscal/conciliação). null em conectores sem detalhamento.
		integracaoMetadados: sale.integrationMetadata ?? null,
	};
}

type TResolvedSaleItemRow = {
	values: Omit<typeof saleItems.$inferInsert, "vendaId">;
	modificadores: Omit<typeof saleItemModifiers.$inferInsert, "itemVendaId">[];
};

/**
 * Projeção de persistência dos itens: exatamente as linhas que `insertSaleItems` gravaria.
 * É insumo tanto da inserção quanto da assinatura de importação — construir uma vez garante
 * que a assinatura nunca diverge do que é escrito (inclusive na resolução de
 * produto/variante/modificador, que depende do estado da plataforma e pode mudar entre runs
 * sem o payload da fonte mudar).
 */
function buildSaleItemRows({
	batch,
	context,
	clientId,
	items,
}: {
	batch: TCanonicalImportBatch;
	context: TResolvedAuxiliaryEntities;
	clientId: string | null;
	items: TCanonicalSaleItem[];
}): TResolvedSaleItemRow[] {
	const rows: TResolvedSaleItemRow[] = [];
	for (const item of items) {
		const target = resolveSaleItemTarget(context, item);
		if (!target) continue;

		// Snapshot dos eixos da variante no momento da venda (robusto a rename/delete posterior).
		const metadados = target.opcoes.length > 0 ? { ...item.metadata, opcoes: target.opcoes } : item.metadata;

		rows.push({
			values: {
				organizacaoId: batch.organizationId,
				clienteId: clientId,
				produtoId: target.produtoId,
				produtoVarianteId: target.produtoVarianteId,
				quantidade: item.quantity,
				valorVendaUnitario: item.unitSaleValue,
				valorCustoUnitario: item.unitCostValue,
				valorVendaTotalBruto: item.grossSaleValue,
				valorTotalDesconto: item.discountValue,
				valorVendaTotalLiquido: item.netSaleValue,
				valorCustoTotal: item.totalCostValue,
				metadados,
			},
			modificadores: (item.modifiers ?? []).map((modifier) => ({
				opcaoId: context.productAddOnOptionsByExternalId.get(modifier.optionExternalId) ?? null,
				nome: modifier.name ?? modifier.optionExternalId,
				quantidade: modifier.quantity,
				valorUnitario: modifier.unitValue,
				valorTotal: modifier.quantity * modifier.unitValue,
			})),
		});
	}
	return rows;
}

async function insertSaleItems({ tx, saleId, rows }: { tx: TDataCollectingV2Executor; saleId: string; rows: TResolvedSaleItemRow[] }) {
	for (const row of rows) {
		const inserted = await tx
			.insert(saleItems)
			.values({ ...row.values, vendaId: saleId })
			.returning({ id: saleItems.id });

		for (const modificador of row.modificadores) {
			await tx.insert(saleItemModifiers).values({ ...modificador, itemVendaId: inserted[0].id });
		}
	}
}

async function updateClientMetrics({
	tx,
	client,
	sale,
	saleId,
	isFirstPurchase,
}: {
	tx: TDataCollectingV2Executor;
	client: TResolvedClientForImport;
	sale: TCanonicalSale;
	saleId: string;
	isFirstPurchase: boolean;
}) {
	if (!sale.isValidSale) {
		return { totalPurchaseCount: null, totalPurchaseValue: null, previousTotalPurchaseCount: null, previousTotalPurchaseValue: null };
	}

	const previousTotalPurchaseCount = client.metadataTotalPurchases;
	const previousTotalPurchaseValue = client.metadataTotalPurchaseValue;
	const totalPurchaseCount = previousTotalPurchaseCount + 1;
	const totalPurchaseValue = previousTotalPurchaseValue + sale.totalValue;

	await tx
		.update(clients)
		.set({
			ultimaCompraData: sale.occurredAt,
			ultimaCompraId: saleId,
			primeiraCompraData: isFirstPurchase ? sale.occurredAt : undefined,
			primeiraCompraId: isFirstPurchase ? saleId : undefined,
			metadataTotalCompras: totalPurchaseCount,
			metadataValorTotalCompras: totalPurchaseValue,
			metadataUltimaAtualizacao: new Date(),
		})
		.where(eq(clients.id, client.id));

	client.metadataTotalPurchases = totalPurchaseCount;
	client.metadataTotalPurchaseValue = totalPurchaseValue;

	return { totalPurchaseCount, totalPurchaseValue, previousTotalPurchaseCount, previousTotalPurchaseValue };
}

export type TSaleIdCollision = {
	sourceSaleId: string;
	existingSaleId: string;
	existingIntegrationId: string | null;
};

export type TSyncSalesResult = {
	persistedSales: TPersistedSaleForEffects[];
	/**
	 * Colisões fail-closed (D4): venda existente com o mesmo `idExterno` mas outra (ou nenhuma)
	 * `integracaoId`. O item importado NÃO altera a venda existente e NÃO executa efeitos de
	 * venda (cashback/campanhas/métricas) — aparece aqui para o summary observável do batch.
	 * Nota: as entidades auxiliares do batch (cliente/produto/vendedor/parceiro) já foram
	 * upsertadas por `syncAuxiliaryEntities` antes desta checagem — são cadastros reais da
	 * organização e os upserts são idempotentes por identidade externa; a colisão bloqueia a
	 * venda e seus efeitos, não o cadastro auxiliar.
	 */
	saleIdCollisions: TSaleIdCollision[];
};

export async function syncSales({
	tx,
	batch,
	context,
	erp,
}: {
	tx: TDataCollectingV2Executor;
	batch: TCanonicalImportBatch;
	context: TResolvedAuxiliaryEntities;
	/** Política de canal da organização. Ausente = comportamento legado (sem efeitos de ERP). */
	erp?: TSyncSalesErpOptions | null;
}): Promise<TSyncSalesResult> {
	const saleSourceIds = batch.sales.map((sale) => sale.sourceSaleId);
	if (new Set(saleSourceIds).size !== saleSourceIds.length) {
		throw new Error(`O lote canônico da integração ${batch.integrationId} contém IDs de venda repetidos.`);
	}
	const existingSales =
		saleSourceIds.length > 0
			? await tx.query.sales.findMany({
					where: and(eq(sales.organizacaoId, batch.organizationId), eq(sales.integracaoId, batch.integrationId), inArray(sales.idExterno, saleSourceIds)),
					columns: {
						id: true,
						idExterno: true,
						integracaoId: true,
						natureza: true,
						valorTotal: true,
						statusVenda: true,
						statusAtendimento: true,
						assinaturaExterna: true,
					},
				})
			: [];
	const existingSalesBySourceId = new Map(existingSales.map((sale) => [sale.idExterno, sale]));
	const persistedSales: TPersistedSaleForEffects[] = [];
	const saleIdCollisions: TSaleIdCollision[] = [];
	const firstValidSaleByClientKey = new Map<string, { sourceSaleId: string; occurredAt: Date }>();

	for (const sale of batch.sales) {
		if (!sale.isValidSale) continue;

		const clientKey = getCanonicalClientResolutionKey(batch, sale.client);
		if (!clientKey) continue;

		const currentFirstSale = firstValidSaleByClientKey.get(clientKey);
		if (!currentFirstSale || sale.occurredAt.getTime() < currentFirstSale.occurredAt.getTime()) {
			firstValidSaleByClientKey.set(clientKey, {
				sourceSaleId: sale.sourceSaleId,
				occurredAt: sale.occurredAt,
			});
		}
	}

	for (const sale of batch.sales) {
		const client = resolveClientForCanonicalSale(batch, context, sale.client);
		const clientId = client?.id ?? null;
		const sellerId = getSellerId(context, sale);
		const partner = getPartner(context, sale);
		const existingSale = existingSalesBySourceId.get(sale.sourceSaleId);

		// Colisão de idExterno entre fontes é fail-closed (D4): mesma venda externa encontrada com
		// outra (ou nenhuma) integração de origem — não altera a venda, não executa efeitos.
		if (existingSale && existingSale.integracaoId !== batch.integrationId) {
			console.warn(
				`[SYNC_SALES] Colisão de idExterno ${sale.sourceSaleId}: venda ${existingSale.id} pertence à integração ${existingSale.integracaoId ?? "SEM ATRIBUIÇÃO"} e o batch é da integração ${batch.integrationId}. Item ignorado.`,
			);
			saleIdCollisions.push({
				sourceSaleId: sale.sourceSaleId,
				existingSaleId: existingSale.id,
				existingIntegrationId: existingSale.integracaoId,
			});
			continue;
		}

		const deliveryLocationId = await resolveDeliveryLocationId({
			tx,
			organizationId: batch.organizationId,
			clientId,
			location: sale.deliveryMode === "ENTREGA" ? sale.client?.location : null,
		});
		const saleValues = buildSaleValues({ batch, sale, clientId, deliveryLocationId, sellerId, partnerId: partner?.id ?? null });

		let saleId: string;
		let isNewSale = false;
		const previouslyValid = existingSale?.statusVenda === "CONFIRMADA";
		// Tornou-se válida NESTE sync: dispara os efeitos de "nova compra" exatamente uma vez por
		// venda (na próxima sincronização previouslyValid já é true, pois o status persiste CONFIRMADA).
		const becameValid = sale.isValidSale && !previouslyValid;
		const nowCanceled = sale.isCanceled;
		const clientKey = getCanonicalClientResolutionKey(batch, sale.client);

		// Canal gerenciado: o conector informa o eixo de atendimento e a política de canal está
		// ligada — a ingestão passa a respeitar transições e a disparar os efeitos de entrega.
		const saleIsManaged = !!erp?.policy.fulfillment && isManagedFulfillmentSaleModel(sale.model) && sale.attendanceStatus != null;
		const deductStockOnDelivery = saleIsManaged && !!erp && erp.policy.estoque && erp.stockTrackingEnabled;
		const financeEnabled = saleIsManaged && !!erp && erp.policy.financeiro;
		// Status operacional efetivo pós-sync (para disparar os efeitos de entrega de forma
		// idempotente em todo sync, cobrindo também entregas feitas pelo board entre syncs).
		let effectiveAttendanceStatus = saleValues.statusAtendimento;

		const itemRows = buildSaleItemRows({ batch, context, clientId, items: sale.items });
		const externalSignature = computeSaleImportSignature({
			saleValues,
			resolvedItems: itemRows,
			saleItemRewritePolicy: batch.policies.saleItemRewritePolicy,
		});
		// Assinatura igual prova que a transação de import deste exato estado já commitou —
		// nenhuma escrita é necessária. Canal gerenciado nunca pula: applyManagedSaleDeliveryEffects
		// roda em todo sync por design (rede de segurança para entregas feitas pelo board).
		const skipped = !!existingSale && !saleIsManaged && existingSale.assinaturaExterna === externalSignature;

		if (!existingSale) {
			isNewSale = true;
			console.log(`[SYNC_SALES] Creating new sale of ${sale.sourceSaleId} (${sale.occurredAt.toISOString()})...`);
			const inserted = await tx
				.insert(sales)
				.values({ ...saleValues, assinaturaExterna: externalSignature, statusAtendimentoData: sale.occurredAt })
				.returning({ id: sales.id });
			saleId = inserted[0].id;
			existingSalesBySourceId.set(sale.sourceSaleId, {
				id: saleId,
				idExterno: sale.sourceSaleId,
				integracaoId: batch.integrationId,
				natureza: saleValues.natureza,
				valorTotal: saleValues.valorTotal,
				statusVenda: saleValues.statusVenda,
				statusAtendimento: saleValues.statusAtendimento,
				assinaturaExterna: externalSignature,
			});
			await insertSaleItems({ tx, saleId, rows: itemRows });
		} else if (skipped) {
			saleId = existingSale.id;
		} else {
			saleId = existingSale.id;
			console.log(`[SYNC_SALES] Updating existing sale of ${sale.sourceSaleId} (${sale.occurredAt.toISOString()})...`);

			const updateValues = { ...saleValues, assinaturaExterna: externalSignature };
			if (saleIsManaged) {
				// Eixo comercial nunca regride por evento atrasado (ex.: PLACED replayed após CFM).
				if (!updateValues.statusVenda && existingSale.statusVenda) updateValues.statusVenda = existingSale.statusVenda;

				// Eixo operacional só avança por transições válidas; evento fora de ordem é ignorado.
				const currentAttendance = existingSale.statusAtendimento;
				const targetAttendance = saleValues.statusAtendimento;
				if (currentAttendance !== targetAttendance && !isValidAttendanceTransition(currentAttendance, targetAttendance)) {
					console.log(
						`[SYNC_SALES] Transição de atendimento ignorada para ${sale.sourceSaleId}: ${currentAttendance} -> ${targetAttendance} (evento fora de ordem).`,
					);
					updateValues.statusAtendimento = currentAttendance;
				}
				effectiveAttendanceStatus = updateValues.statusAtendimento;
			}

			// Carimbo do momento da etapa. Condicional por necessidade: este caminho reafirma o
			// status a cada sync, e carimbar incondicionalmente faria um re-sync ressuscitar vendas
			// antigas na janela de concluidos do quadro. Canal gerenciado carimba "agora" (o evento
			// e ao vivo); importacao de ERP carimba `occurredAt`, que mantem lote historico fora da
			// janela. Sem mudanca de status, a chave nem entra no update e o valor atual sobrevive.
			Object.assign(
				updateValues,
				attendanceStatusValuesIfChanged(existingSale.statusAtendimento, updateValues.statusAtendimento, {
					at: saleIsManaged ? undefined : sale.occurredAt,
				}),
			);

			await tx.update(sales).set(updateValues).where(eq(sales.id, existingSale.id));
			if (batch.policies.saleItemRewritePolicy === "REPLACE_ON_EVERY_SYNC") {
				await tx.delete(saleItems).where(and(eq(saleItems.vendaId, existingSale.id), eq(saleItems.organizacaoId, batch.organizationId)));
				await insertSaleItems({ tx, saleId, rows: itemRows });
			}
		}

		// Financeiro do canal gerenciado: lançamento + transações quando a venda torna-se válida;
		// cancelamento das pendentes quando vira cancelada. Savepoints: falha não aborta o import.
		if (financeEnabled && becameValid) {
			try {
				await tx.transaction(async (nested) => {
					await processManagedSaleFinancials(nested, {
						organizationId: batch.organizationId,
						saleId,
						sale,
						channelAccountKey: FIRST_PARTY_ACCOUNT_KEYS.IFOOD,
						organizationConfiguration: erp?.organizationConfiguration ?? null,
					});
				});
			} catch (error) {
				console.error(`[SYNC_SALES] Falha no financeiro da venda gerenciada ${sale.sourceSaleId} — venda importada sem financeiro.`, error);
			}
		}
		if (financeEnabled && previouslyValid && nowCanceled) {
			try {
				await tx.transaction(async (nested) => {
					await cancelManagedSaleFinancials(nested, { organizationId: batch.organizationId, saleId });
				});
			} catch (error) {
				console.error(`[SYNC_SALES] Falha ao cancelar financeiro da venda gerenciada ${sale.sourceSaleId}.`, error);
			}
		}

		const saleIsDelivered = saleIsManaged && attendanceStatusRequiresPhysicalOut(effectiveAttendanceStatus);
		if (saleIsDelivered && (deductStockOnDelivery || financeEnabled)) {
			await applyManagedSaleDeliveryEffects({
				tx,
				organizationId: batch.organizationId,
				saleId,
				deductStock: deductStockOnDelivery,
				settleOfflinePayments: financeEnabled,
			});
		}

		const isFirstPurchase =
			!!client && client.isNew && becameValid && !!clientKey && firstValidSaleByClientKey.get(clientKey)?.sourceSaleId === sale.sourceSaleId;
		// `!skipped` é cinto-e-suspensório: assinatura igual implica becameValid=false (a natureza
		// e o valor persistidos vieram deste mesmo estado), mas métricas de cliente incrementam —
		// um disparo duplicado aqui corromperia totais silenciosamente.
		const totals =
			client && becameValid && !skipped
				? await updateClientMetrics({ tx, client, sale, saleId, isFirstPurchase })
				: { totalPurchaseCount: null, totalPurchaseValue: null, previousTotalPurchaseCount: null, previousTotalPurchaseValue: null };

		persistedSales.push({
			id: saleId,
			sourceSaleId: sale.sourceSaleId,
			clientId,
			partnerClientId: partner?.clientId ?? null,
			sale,
			isNewSale,
			isNewClient: client?.isNew ?? false,
			isFirstPurchase,
			previouslyValid,
			becameValid,
			nowCanceled,
			skipped,
			managedFiscalEmissionCandidate: saleIsDelivered && !!erp && erp.policy.fiscal,
			newTotalPurchaseCount: totals.totalPurchaseCount,
			newTotalPurchaseValue: totals.totalPurchaseValue,
			previousTotalPurchaseCount: totals.previousTotalPurchaseCount,
			previousTotalPurchaseValue: totals.previousTotalPurchaseValue,
		});
	}

	return { persistedSales, saleIdCollisions };
}
