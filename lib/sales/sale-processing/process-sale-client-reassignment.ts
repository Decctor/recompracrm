import { previewSaleCashbackTransfer, transferSaleCashbackAccumulation } from "@/lib/cashback/transfer-sale-accumulation";
import { recomputeClientDerivedDataSafely } from "@/lib/clients/recompute";
import { lockClientPurchaseHistory } from "@/lib/coupons/purchase-history";
import { buildSaleEntryTitle } from "@/lib/sales/entry-titles";
import { resolveSaleClientReassignmentPolicy, type TSaleClientReassignmentDocument } from "@/lib/sales/sale-client-reassignment-policy";
import { db, type DBTransaction } from "@/services/drizzle";
import { accountingEntries, campaignConversions, clients, couponRedemptions, saleItems, sales } from "@/services/drizzle/schema";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";
import { getSaleFinancialState } from "./get-sale-financial-state";
import { processSaleAutomaticFiscalEmissionIfEligible } from "./process-sale-automatic-fiscal-emission";

/**
 * Reatribuição de cliente de uma venda CONFIRMADA: definir (X nulo), trocar ou desvincular (Y nulo).
 *
 * Uma única primitiva para os três casos. Efeitos sincronizados na mesma transação: cashback do
 * comprador sai de X e entra em Y, atribuição de campanha é zerada (foi calculada contra as
 * interações de X), venda + itens + título contábil apontam para Y, e o log de edição registra a
 * troca. Derivados dos dois clientes são recomputados pós-commit, best-effort.
 *
 * Plano: docs/dev-planning/sale-client-reassignment-plan.md.
 */

export type TProcessSaleClientReassignmentInput = {
	organization: TOrganizationEntity;
	saleId: string;
	saleAuthorId: string;
	nextClientId: string | null;
	// Consentimento explícito quando a NFC-e viva carrega o CPF do cliente atual.
	fiscalConfirmed: boolean;
};

const SALE_CONTEXT_WITH = {
	cliente: { columns: { id: true, nome: true, telefone: true } },
	documentosFiscais: {
		columns: { id: true, tipo: true, numero: true, statusInterno: true, documentoOrigemId: true, snapshotOrigemVenda: true },
	},
	transacoesCashback: { columns: { id: true, tipo: true, status: true, clienteId: true } },
	lancamentosContabeis: { columns: { id: true, origemTipo: true, titulo: true } },
} as const;

function readDestinatarioCpfCnpj(snapshot: string | null): string | null {
	if (!snapshot) return null;
	try {
		const parsed = JSON.parse(snapshot) as { destinatario?: { cpfCnpj?: unknown } | null };
		const cpfCnpj = parsed?.destinatario?.cpfCnpj;
		return typeof cpfCnpj === "string" ? cpfCnpj : null;
	} catch {
		return null;
	}
}

function toPolicyDocuments(
	documents: {
		id: string;
		tipo: string;
		numero: string | null;
		statusInterno: string | null;
		documentoOrigemId: string | null;
		snapshotOrigemVenda: string | null;
	}[],
): TSaleClientReassignmentDocument[] {
	return documents.map((document) => ({
		id: document.id,
		tipo: document.tipo,
		numero: document.numero,
		statusInterno: document.statusInterno,
		documentoOrigemId: document.documentoOrigemId,
		destinatarioCpfCnpj: readDestinatarioCpfCnpj(document.snapshotOrigemVenda),
	}));
}

/**
 * Estado da venda + política + prévia de cashback, para a UI mostrar o que vai acontecer antes de
 * mutar. `nextClientId` só afeta o acúmulo previsto.
 */
export async function loadSaleClientReassignmentContext({
	organizationId,
	saleId,
	nextClientId,
}: {
	organizationId: string;
	saleId: string;
	nextClientId?: string | null;
}) {
	const sale = await db.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, saleId), eq(fields.organizacaoId, organizationId)),
		columns: {
			id: true,
			idExterno: true,
			valorTotal: true,
			dataVenda: true,
			statusVenda: true,
			processamentoOrigem: true,
			tabId: true,
			clienteId: true,
		},
		with: SALE_CONTEXT_WITH,
	});
	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");

	const cuponsResgatados = await db.query.couponRedemptions.findMany({
		where: and(eq(couponRedemptions.vendaId, sale.id), eq(couponRedemptions.organizacaoId, organizationId)),
		columns: { status: true },
	});
	const politica = resolveSaleClientReassignmentPolicy({
		statusVenda: sale.statusVenda,
		processamentoOrigem: sale.processamentoOrigem,
		tabId: sale.tabId,
		clienteId: sale.clienteId,
		documentosFiscais: toPolicyDocuments(sale.documentosFiscais),
		transacoesCashback: sale.transacoesCashback,
		cuponsResgatados,
	});

	const financialState = await getSaleFinancialState({ organizationId, saleId: sale.id });
	const cashback = await previewSaleCashbackTransfer({
		tx: db,
		organizationId,
		saleId: sale.id,
		saleValue: sale.valorTotal,
		currentClientId: sale.clienteId,
		nextClientId: nextClientId ?? null,
		nextClientAccumulationEligible: sale.statusVenda === "CONFIRMADA" && financialState.isFullyPaid,
	});

	return {
		venda: { id: sale.id, idExterno: sale.idExterno, valorTotal: sale.valorTotal, dataVenda: sale.dataVenda },
		cliente: sale.cliente,
		politica,
		cashback,
	};
}

export async function processSaleClientReassignmentInTransaction({ tx, input }: { tx: DBTransaction; input: TProcessSaleClientReassignmentInput }) {
	const organizationId = input.organization.id;

	// Lock da venda contra edição/cancelamento concorrente; a existência é validada pelo fetch abaixo.
	await tx.execute(sql`SELECT id FROM ampmais_sales WHERE id = ${input.saleId} AND organizacao_id = ${organizationId} FOR UPDATE`);

	const sale = await tx.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, input.saleId), eq(fields.organizacaoId, organizationId)),
		with: SALE_CONTEXT_WITH,
	});
	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");

	const previousClientId = sale.clienteId ?? null;
	if (previousClientId === input.nextClientId) {
		throw new createHttpError.BadRequest(input.nextClientId ? "A venda já pertence a este cliente." : "A venda já está sem cliente vinculado.");
	}

	const nextClient = input.nextClientId
		? await tx.query.clients.findFirst({
				where: and(eq(clients.id, input.nextClientId), eq(clients.organizacaoId, organizationId)),
				columns: { id: true, nome: true },
			})
		: null;
	if (input.nextClientId && !nextClient) throw new createHttpError.NotFound("Cliente não encontrado.");

	// A "primeira compra" de cada lado muda com a reatribuição: mesmo lock fail-fast da confirmação.
	if (previousClientId) await lockClientPurchaseHistory(tx, organizationId, previousClientId);
	if (nextClient) await lockClientPurchaseHistory(tx, organizationId, nextClient.id);

	const cuponsResgatados = await tx.query.couponRedemptions.findMany({
		where: and(eq(couponRedemptions.vendaId, sale.id), eq(couponRedemptions.organizacaoId, organizationId)),
		columns: { status: true },
	});
	const politica = resolveSaleClientReassignmentPolicy({
		statusVenda: sale.statusVenda,
		processamentoOrigem: sale.processamentoOrigem,
		tabId: sale.tabId,
		clienteId: sale.clienteId,
		documentosFiscais: toPolicyDocuments(sale.documentosFiscais),
		transacoesCashback: sale.transacoesCashback,
		cuponsResgatados,
	});
	if (!politica.elegivel) throw new createHttpError.BadRequest(politica.motivos[0] ?? "A venda não permite alteração de cliente.");
	if (politica.confirmacaoFiscalExigida && !input.fiscalConfirmed) {
		throw new createHttpError.BadRequest(
			"A NFC-e desta venda foi emitida com o CPF do cliente atual. Confirme que a nota permanecerá como está para continuar.",
		);
	}

	const financialState = await getSaleFinancialState({ organizationId, saleId: sale.id });
	const cashback = await transferSaleCashbackAccumulation({
		tx,
		organizationId,
		saleId: sale.id,
		saleValue: sale.valorTotal,
		saleDate: sale.dataVenda,
		currentClientId: previousClientId,
		nextClientId: nextClient?.id ?? null,
		nextClientAccumulationEligible: financialState.isFullyPaid,
		operatorId: input.saleAuthorId,
		operatorSellerId: sale.vendedorId,
	});

	// Atribuição de campanha foi calculada contra as interações do cliente anterior. Zera; não
	// reprocessa aqui (o novo cliente não deve ganhar campanhas por uma operação de dados).
	await tx.delete(campaignConversions).where(and(eq(campaignConversions.vendaId, sale.id), eq(campaignConversions.organizacaoId, organizationId)));

	const previousDraftMetadata =
		sale.rascunhoMetadados && typeof sale.rascunhoMetadados === "object" && !Array.isArray(sale.rascunhoMetadados)
			? (sale.rascunhoMetadados as Record<string, unknown>)
			: {};
	const previousEditions = Array.isArray(previousDraftMetadata.edicoes) ? previousDraftMetadata.edicoes : [];
	const editionLogEntry = {
		tipo: "CLIENTE",
		data: new Date().toISOString(),
		autorId: input.saleAuthorId,
		clienteAnteriorId: previousClientId,
		clienteNovoId: nextClient?.id ?? null,
		cashbackEstornado: cashback.estornado,
		cashbackNaoEstornado: cashback.naoEstornado,
		cashbackAcumulado: cashback.acumulado,
		fiscalDesatualizado: politica.confirmacaoFiscalExigida,
	};

	await tx
		.update(sales)
		.set({
			clienteId: nextClient?.id ?? null,
			atribuicaoProcessada: false,
			atribuicaoAplicavel: false,
			atribuicaoCampanhaPrincipalId: null,
			atribuicaoCampanhaConversaoId: null,
			atribuicaoInteracaoId: null,
			rascunhoMetadados: { ...previousDraftMetadata, edicoes: [...previousEditions, editionLogEntry] },
		})
		.where(and(eq(sales.id, sale.id), eq(sales.organizacaoId, organizationId)));

	// Denormalizado nos itens: alimenta produto × cliente e "produto mais comprado".
	await tx
		.update(saleItems)
		.set({ clienteId: nextClient?.id ?? null })
		.where(and(eq(saleItems.vendaId, sale.id), eq(saleItems.organizacaoId, organizationId)));

	const vendaEntry = sale.lancamentosContabeis.find((entry) => entry.origemTipo === "VENDA");
	if (vendaEntry) {
		await tx
			.update(accountingEntries)
			.set({ titulo: buildSaleEntryTitle({ clientName: nextClient?.nome, totalValue: sale.valorTotal, occurredAt: sale.dataVenda ?? new Date() }) })
			.where(and(eq(accountingEntries.id, vendaEntry.id), eq(accountingEntries.organizacaoId, organizationId)));
	}

	return {
		saleId: sale.id,
		clienteAnteriorId: previousClientId,
		clienteNovoId: nextClient?.id ?? null,
		cashback,
		fiscalDesatualizado: politica.confirmacaoFiscalExigida,
	};
}

/**
 * Pós-commit: derivados dos dois clientes (metadados de compra, RFM, vínculos) e a emissão
 * automática idempotente — definir o cliente é o que destrava uma NF-e de entrega parada em
 * CLIENTE_SEM_DOCUMENTO.
 */
export async function processSaleClientReassignmentPostCommit({
	organization,
	saleId,
	saleAuthorId,
	clientIds,
}: Pick<TProcessSaleClientReassignmentInput, "organization" | "saleId" | "saleAuthorId"> & { clientIds: (string | null)[] }) {
	for (const clienteId of clientIds) {
		if (clienteId) await recomputeClientDerivedDataSafely({ organizacaoId: organization.id, clienteId });
	}
	return processSaleAutomaticFiscalEmissionIfEligible({ organization, saleId, authorId: saleAuthorId });
}
