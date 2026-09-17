import type { DBTransaction } from "@/services/drizzle";
import {
	accountingEntries,
	accountsCharts,
	actionApprovalRequests,
	aiAgentKnowledge,
	aiAgentOperations,
	aiAgentRuns,
	aiAgentToolCalls,
	aiAgents,
	audienceDestinationMembers,
	audienceDestinations,
	audiences,
	campaignConversions,
	campaignDispatchRecipients,
	campaignDispatches,
	campaignSegmentations,
	campaigns,
	sendCounters,
	cashbackProgramBalances,
	cashbackProgramPrizes,
	cashbackProgramTransactions,
	cashbackPrograms,
	chatMessages,
	chatAssignments,
	chats,
	clientLocations,
	clientTagReferences,
	clientTags,
	clients,
	couponAudiences,
	couponGrants,
	couponRedemptions,
	couponTargets,
	coupons,
	externalEvents,
	financialAccounts,
	financialOpenFinanceConnections,
	financialReconciliationMatches,
	financialReconciliationRules,
	financialStatementImports,
	financialStatementTransactions,
	financialTransactions,
	fiscalDocumentEvents,
	fiscalInboundDocuments,
	fiscalInboundSyncStates,
	fiscalOperationProfiles,
	fiscalOutboundDocuments,
	fiscalSeries,
	fiscalTaxGroupRules,
	fiscalTaxGroups,
	goals,
	goalsSellers,
	integrations,
	interactions,
	messageTemplates,
	organizationMembers,
	organizationMembershipInvitations,
	organizations,
	partners,
	platformPartnerReferrals,
	poiTransactionRequests,
	productAddOnOptions,
	productAddOnReferences,
	productAddOns,
	productClientReferences,
	productFiscalProfiles,
	productOptionValues,
	productOptions,
	productStockLots,
	productStockTransactions,
	productVariantOptionValues,
	productVariants,
	productionInputs,
	productionOutputs,
	productionRecipeInputs,
	productionRecipeOutputs,
	productionRecipes,
	productions,
	products,
	purchaseItems,
	purchases,
	saleItemModifiers,
	saleItems,
	sales,
	salesSessionReconciliations,
	salesSessions,
	sellers,
	shopOrderRequests,
	shopSettings,
	supplierProductMappings,
	suppliers,
	utils,
	whatsappConnectionPhones,
	whatsappConnections,
} from "@/services/drizzle/schema";
import { eq, inArray } from "drizzle-orm";

// Statuses do Stripe que indicam assinatura "viva" — bloqueiam a exclusão da organização.
export const BLOCKING_STRIPE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "unpaid", "incomplete"];

export function organizationHasBlockingSubscription(stripeSubscriptionStatus: string | null | undefined) {
	return !!stripeSubscriptionStatus && BLOCKING_STRIPE_SUBSCRIPTION_STATUSES.includes(stripeSubscriptionStatus);
}

/**
 * Exclui todos os dados de uma organização com deletes explícitos e set-based,
 * sempre de filhos para pais, para não depender do encadeamento de cascades
 * (cascades disparam triggers por linha e já causaram sobrecarga no banco).
 * O onDelete: "cascade" das FKs permanece apenas como rede de segurança para
 * tabelas futuras que não estejam listadas aqui.
 */
export async function deleteAllOrganizationData({
	trx,
	organizationId,
	organizationName,
}: {
	trx: DBTransaction;
	organizationId: string;
	organizationName: string;
}) {
	// --- Vínculos sem organizacao_id próprio (via subquery no pai) ---
	await trx
		.delete(saleItemModifiers)
		.where(inArray(saleItemModifiers.itemVendaId, trx.select({ id: saleItems.id }).from(saleItems).where(eq(saleItems.organizacaoId, organizationId))));
	await trx
		.delete(fiscalDocumentEvents)
		.where(
			inArray(
				fiscalDocumentEvents.documentoFiscalId,
				trx.select({ id: fiscalOutboundDocuments.id }).from(fiscalOutboundDocuments).where(eq(fiscalOutboundDocuments.organizacaoId, organizationId)),
			),
		);
	await trx.delete(audienceDestinationMembers).where(
		inArray(
			audienceDestinationMembers.destinoId,
			trx
				.select({ id: audienceDestinations.id })
				.from(audienceDestinations)
				.where(
					inArray(audienceDestinations.audienciaId, trx.select({ id: audiences.id }).from(audiences).where(eq(audiences.organizacaoId, organizationId))),
				),
		),
	);
	await trx
		.delete(audienceDestinations)
		.where(
			inArray(audienceDestinations.audienciaId, trx.select({ id: audiences.id }).from(audiences).where(eq(audiences.organizacaoId, organizationId))),
		);
	await trx
		.delete(productAddOnReferences)
		.where(
			inArray(
				productAddOnReferences.produtoAddOnId,
				trx.select({ id: productAddOns.id }).from(productAddOns).where(eq(productAddOns.organizacaoId, organizationId)),
			),
		);

	// --- Agentes de IA ---
	// Antes das conversas: `ai_agent_runs` referencia `chats` e `chat_messages`.
	await trx.delete(aiAgentToolCalls).where(eq(aiAgentToolCalls.organizacaoId, organizationId));
	await trx.delete(aiAgentOperations).where(eq(aiAgentOperations.organizacaoId, organizationId));
	await trx.delete(aiAgentRuns).where(eq(aiAgentRuns.organizacaoId, organizationId));
	await trx.delete(aiAgentKnowledge).where(eq(aiAgentKnowledge.organizacaoId, organizationId));
	await trx.delete(aiAgents).where(eq(aiAgents.organizacaoId, organizationId));

	// --- Atendimento / conversas ---
	await trx.delete(chatMessages).where(eq(chatMessages.organizacaoId, organizationId));
	await trx.delete(chatAssignments).where(eq(chatAssignments.organizacaoId, organizationId));

	// --- Inbox de eventos externos (webhooks) ---
	// Payloads contêm dados pessoais (telefone, nome, conteúdo de mensagem). Só as linhas
	// carimbadas com a organização saem aqui; as com organizacao_id null (ownership ambíguo)
	// caem na retenção de 30 dias do cron retention-cleanup.
	await trx.delete(externalEvents).where(eq(externalEvents.organizacaoId, organizationId));

	// --- Marketing / campanhas (vínculos) ---
	await trx.delete(campaignConversions).where(eq(campaignConversions.organizacaoId, organizationId));
	await trx.delete(campaignSegmentations).where(eq(campaignSegmentations.organizacaoId, organizationId));
	// Pipeline de disparos: destinatários antes dos disparos (FK); contadores de quota por último.
	await trx.delete(campaignDispatchRecipients).where(eq(campaignDispatchRecipients.organizacaoId, organizationId));
	await trx.delete(campaignDispatches).where(eq(campaignDispatches.organizacaoId, organizationId));
	await trx.delete(sendCounters).where(eq(sendCounters.organizacaoId, organizationId));

	// --- Cashback (movimentações) ---
	await trx.delete(cashbackProgramTransactions).where(eq(cashbackProgramTransactions.organizacaoId, organizationId));
	await trx.delete(cashbackProgramBalances).where(eq(cashbackProgramBalances.organizacaoId, organizationId));

	// --- Cupons (vínculos e usos) ---
	await trx.delete(couponRedemptions).where(eq(couponRedemptions.organizacaoId, organizationId));
	await trx.delete(couponGrants).where(eq(couponGrants.organizacaoId, organizationId));
	await trx.delete(couponTargets).where(eq(couponTargets.organizacaoId, organizationId));
	await trx.delete(couponAudiences).where(eq(couponAudiences.organizacaoId, organizationId));

	// --- POI / loja ---
	await trx.delete(poiTransactionRequests).where(eq(poiTransactionRequests.organizacaoId, organizationId));
	await trx.delete(shopOrderRequests).where(eq(shopOrderRequests.organizacaoId, organizationId));

	// --- Estoque / produção (movimentos antes de lotes, lotes antes de produções) ---
	await trx.delete(productStockTransactions).where(eq(productStockTransactions.organizacaoId, organizationId));
	await trx.delete(productStockLots).where(eq(productStockLots.organizacaoId, organizationId));
	await trx.delete(productionInputs).where(eq(productionInputs.organizacaoId, organizationId));
	await trx.delete(productionOutputs).where(eq(productionOutputs.organizacaoId, organizationId));
	await trx.delete(productionRecipeInputs).where(eq(productionRecipeInputs.organizacaoId, organizationId));
	await trx.delete(productionRecipeOutputs).where(eq(productionRecipeOutputs.organizacaoId, organizationId));

	// --- Metas / vínculos diversos ---
	await trx.delete(goalsSellers).where(eq(goalsSellers.organizacaoId, organizationId));
	await trx.delete(supplierProductMappings).where(eq(supplierProductMappings.organizacaoId, organizationId));
	await trx.delete(productFiscalProfiles).where(eq(productFiscalProfiles.organizacaoId, organizationId));
	await trx.delete(fiscalTaxGroupRules).where(eq(fiscalTaxGroupRules.organizacaoId, organizationId));
	await trx.delete(clientTagReferences).where(eq(clientTagReferences.organizacaoId, organizationId));
	await trx.delete(productClientReferences).where(eq(productClientReferences.organizacaoId, organizationId));

	// --- Produções (referenciam vendas/itens; deletar antes das vendas) ---
	await trx.delete(productions).where(eq(productions.organizacaoId, organizationId));
	await trx.delete(productionRecipes).where(eq(productionRecipes.organizacaoId, organizationId));

	// --- Fiscal (documentos referenciam compras/vendas/lançamentos; deletar antes deles) ---
	await trx.delete(fiscalOutboundDocuments).where(eq(fiscalOutboundDocuments.organizacaoId, organizationId));
	await trx.delete(fiscalInboundDocuments).where(eq(fiscalInboundDocuments.organizacaoId, organizationId));
	await trx.delete(fiscalInboundSyncStates).where(eq(fiscalInboundSyncStates.organizacaoId, organizationId));

	// --- Compras (itens referenciam produtos; compras referenciam lançamentos/fornecedores) ---
	await trx.delete(purchaseItems).where(eq(purchaseItems.organizacaoId, organizationId));
	await trx.delete(purchases).where(eq(purchases.organizacaoId, organizationId));

	// --- Conciliação bancária (matches → linhas de extrato → importações → conexões/regras) ---
	await trx.delete(financialReconciliationMatches).where(eq(financialReconciliationMatches.organizacaoId, organizationId));
	await trx.delete(financialStatementTransactions).where(eq(financialStatementTransactions.organizacaoId, organizationId));
	await trx.delete(financialStatementImports).where(eq(financialStatementImports.organizacaoId, organizationId));
	await trx.delete(financialOpenFinanceConnections).where(eq(financialOpenFinanceConnections.organizacaoId, organizationId));
	await trx.delete(financialReconciliationRules).where(eq(financialReconciliationRules.organizacaoId, organizationId));

	// --- Financeiro (transações → lançamentos → contas → plano de contas) ---
	await trx.delete(financialTransactions).where(eq(financialTransactions.organizacaoId, organizationId));
	await trx.delete(accountingEntries).where(eq(accountingEntries.organizacaoId, organizationId));

	// --- Vendas (itens antes; vendas referenciam clientes/vendedores/campanhas/sessões) ---
	await trx.delete(saleItems).where(eq(saleItems.organizacaoId, organizationId));
	await trx.delete(sales).where(eq(sales.organizacaoId, organizationId));
	await trx.delete(interactions).where(eq(interactions.organizacaoId, organizationId));
	await trx.delete(salesSessionReconciliations).where(eq(salesSessionReconciliations.organizacaoId, organizationId));
	await trx.delete(salesSessions).where(eq(salesSessions.organizacaoId, organizationId));
	await trx.delete(financialAccounts).where(eq(financialAccounts.organizacaoId, organizationId));
	await trx.delete(accountsCharts).where(eq(accountsCharts.organizacaoId, organizationId));

	// --- Fiscal (configurações) ---
	await trx.delete(fiscalOperationProfiles).where(eq(fiscalOperationProfiles.organizacaoId, organizationId));
	await trx.delete(fiscalSeries).where(eq(fiscalSeries.organizacaoId, organizationId));
	await trx.delete(fiscalTaxGroups).where(eq(fiscalTaxGroups.organizacaoId, organizationId));

	// --- Conversas / campanhas / programas (pais) ---
	await trx.delete(chats).where(eq(chats.organizacaoId, organizationId));
	await trx.delete(campaigns).where(eq(campaigns.organizacaoId, organizationId));
	await trx.delete(cashbackProgramPrizes).where(eq(cashbackProgramPrizes.organizacaoId, organizationId));
	await trx.delete(cashbackPrograms).where(eq(cashbackPrograms.organizacaoId, organizationId));
	await trx.delete(coupons).where(eq(coupons.organizacaoId, organizationId));

	// --- Templates / WhatsApp / integrações ---
	await trx.delete(messageTemplates).where(eq(messageTemplates.organizacaoId, organizationId));
	await trx
		.delete(whatsappConnectionPhones)
		.where(
			inArray(
				whatsappConnectionPhones.conexaoId,
				trx.select({ id: whatsappConnections.id }).from(whatsappConnections).where(eq(whatsappConnections.organizacaoId, organizationId)),
			),
		);
	await trx.delete(whatsappConnections).where(eq(whatsappConnections.organizacaoId, organizationId));
	await trx.delete(audiences).where(eq(audiences.organizacaoId, organizationId));
	await trx.delete(integrations).where(eq(integrations.organizacaoId, organizationId));
	await trx.delete(actionApprovalRequests).where(eq(actionApprovalRequests.organizacaoId, organizationId));

	// --- Clientes / parceiros / metas ---
	await trx.delete(clientLocations).where(eq(clientLocations.organizacaoId, organizationId));
	await trx.delete(clientTags).where(eq(clientTags.organizacaoId, organizationId));
	await trx.delete(partners).where(eq(partners.organizacaoId, organizationId));
	await trx.delete(clients).where(eq(clients.organizacaoId, organizationId));
	await trx.delete(goals).where(eq(goals.organizacaoId, organizationId));

	// --- Produtos (variantes/opções/complementos antes dos produtos) ---
	await trx.delete(productVariantOptionValues).where(eq(productVariantOptionValues.organizacaoId, organizationId));
	await trx.delete(productOptionValues).where(eq(productOptionValues.organizacaoId, organizationId));
	await trx.delete(productOptions).where(eq(productOptions.organizacaoId, organizationId));
	await trx.delete(productAddOnOptions).where(eq(productAddOnOptions.organizacaoId, organizationId));
	await trx.delete(productAddOns).where(eq(productAddOns.organizacaoId, organizationId));
	await trx.delete(productVariants).where(eq(productVariants.organizacaoId, organizationId));
	await trx.delete(products).where(eq(products.organizacaoId, organizationId));

	// --- Pessoas / base da organização ---
	await trx.delete(organizationMembershipInvitations).where(eq(organizationMembershipInvitations.organizacaoId, organizationId));
	await trx.delete(organizationMembers).where(eq(organizationMembers.organizacaoId, organizationId));
	await trx.delete(sellers).where(eq(sellers.organizacaoId, organizationId));
	await trx.delete(suppliers).where(eq(suppliers.organizacaoId, organizationId));
	await trx.delete(shopSettings).where(eq(shopSettings.organizacaoId, organizationId));
	await trx.delete(utils).where(eq(utils.organizacaoId, organizationId));

	// --- Parcerias: preserva o histórico de indicação (organizacao_id vira null via FK) ---
	await trx
		.update(platformPartnerReferrals)
		.set({ organizacaoNomeSnapshot: organizationName })
		.where(eq(platformPartnerReferrals.organizacaoId, organizationId));

	// --- Organização (cascade cobre qualquer tabela futura não listada acima) ---
	await trx.delete(organizations).where(eq(organizations.id, organizationId));
}
