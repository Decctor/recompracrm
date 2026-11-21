import "@/utils/scripts/load-next-env";

import { recomputeClientDerivedDataSafely } from "@/lib/clients/recompute";
import { connection, db } from "@/services/drizzle";
import {
	accountingEntries,
	campaignConversions,
	campaignDispatches,
	campaignDispatchRecipients,
	campaignEvents,
	cashbackProgramTransactions,
	catalogLinks,
	couponRedemptions,
	fiscalOutboundDocuments,
	integrationImportJobs,
	integrations,
	paymentAttempts,
	poiTransactionRequests,
	productions,
	productStockTransactions,
	saleItems,
	sales,
	shopOrderRequests,
	tabPayments,
} from "@/services/drizzle/schema";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

/**
 * Remove uma conexão de dados duplicada: a mesma conta da fonte conectada duas vezes na mesma
 * organização, que grava cada venda duas vezes (uma por conexão). Mantém `--keep`, apaga `--remove`.
 *
 * Por padrão só SIMULA e imprime o que seria apagado. `--apply` executa.
 *
 * Recusa quando:
 *   - as conexões não são da mesma organização e do mesmo tipo;
 *   - alguma venda de `--remove` não tem gêmea (mesmo idExterno) em `--keep` — seria perda de dado;
 *   - alguma venda de `--remove` tem efeito que não cai em cascata (cashback, lançamento contábil,
 *     nota fiscal, estoque, cupom, disparo de campanha, pedido de loja/POI, produção).
 *
 * Apaga, numa transação: eventos de campanha gerados pelas vendas duplicadas (e os disparos deles,
 * em cascata), as vendas (itens, conversões e pagamentos em cascata), os jobs de importação e
 * vínculos de catálogo da conexão, e a conexão. Depois recalcula os derivados dos clientes
 * afetados (compras, RFM, referências de vendedor e produto) sem disparar campanhas.
 *
 * Uso:
 *   npx tsx --conditions=react-server ./scripts/cleanup-duplicate-integration.ts --keep=<id> --remove=<id> [--apply]
 */

function getArgValue(name: string) {
	const prefix = `--${name}=`;
	return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function countBySaleIds(table: PgTable, saleIdColumn: PgColumn, saleIds: string[]) {
	if (saleIds.length === 0) return 0;
	const [row] = await db.select({ total: count() }).from(table).where(inArray(saleIdColumn, saleIds));
	return row?.total ?? 0;
}

async function main() {
	const keepId = getArgValue("keep");
	const removeId = getArgValue("remove");
	const apply = process.argv.includes("--apply");
	if (!keepId || !removeId || keepId === removeId) throw new Error("Informe --keep=<id> e --remove=<id>, diferentes.");

	const [keep, remove] = await Promise.all([
		db.query.integrations.findFirst({
			where: eq(integrations.id, keepId),
			columns: { id: true, organizacaoId: true, tipo: true, status: true, dataInsercao: true },
		}),
		db.query.integrations.findFirst({
			where: eq(integrations.id, removeId),
			columns: { id: true, organizacaoId: true, tipo: true, status: true, dataInsercao: true },
		}),
	]);
	if (!keep || !remove) throw new Error("Conexão não encontrada.");
	if (keep.organizacaoId !== remove.organizacaoId || keep.tipo !== remove.tipo) {
		throw new Error(`As conexões não são da mesma organização e tipo: ${JSON.stringify({ keep, remove })}`);
	}
	const organizationId = keep.organizacaoId;
	console.log("[CLEANUP] Mantém:", keep);
	console.log("[CLEANUP] Remove:", remove);

	const removeSales = await db.query.sales.findMany({
		where: and(eq(sales.organizacaoId, organizationId), eq(sales.integracaoId, removeId)),
		columns: { id: true, idExterno: true, clienteId: true, statusVenda: true, valorTotal: true },
	});
	const keepSales = await db.query.sales.findMany({
		where: and(eq(sales.organizacaoId, organizationId), eq(sales.integracaoId, keepId)),
		columns: { idExterno: true },
	});
	const keepSourceIds = new Set(keepSales.map((sale) => sale.idExterno));
	const orphans = removeSales.filter((sale) => !keepSourceIds.has(sale.idExterno));
	const removeSaleIds = removeSales.map((sale) => sale.id);
	const affectedClientIds = Array.from(new Set(removeSales.map((sale) => sale.clienteId).filter((id): id is string => !!id)));

	const blocking = {
		cashbackTransacoes: await countBySaleIds(cashbackProgramTransactions, cashbackProgramTransactions.vendaId, removeSaleIds),
		lancamentosContabeis: await countBySaleIds(accountingEntries, accountingEntries.vendaId, removeSaleIds),
		notasFiscais: await countBySaleIds(fiscalOutboundDocuments, fiscalOutboundDocuments.vendaId, removeSaleIds),
		movimentosEstoque: await countBySaleIds(productStockTransactions, productStockTransactions.vendaId, removeSaleIds),
		resgatesCupom: await countBySaleIds(couponRedemptions, couponRedemptions.vendaId, removeSaleIds),
		destinatariosDisparo: await countBySaleIds(campaignDispatchRecipients, campaignDispatchRecipients.vendaId, removeSaleIds),
		pedidosPOI: await countBySaleIds(poiTransactionRequests, poiTransactionRequests.vendaId, removeSaleIds),
		pedidosLoja: await countBySaleIds(shopOrderRequests, shopOrderRequests.vendaId, removeSaleIds),
		producoes: await countBySaleIds(productions, productions.vendaId, removeSaleIds),
	};
	const duplicateEvents =
		removeSaleIds.length > 0
			? await db.query.campaignEvents.findMany({
					where: and(eq(campaignEvents.organizacaoId, organizationId), inArray(campaignEvents.fonteId, removeSaleIds)),
					columns: { id: true, tipo: true, status: true },
				})
			: [];
	const duplicateEventIds = duplicateEvents.map((event) => event.id);
	const [eventDispatches] =
		duplicateEventIds.length > 0
			? await db.select({ total: count() }).from(campaignDispatches).where(inArray(campaignDispatches.campanhaEventoId, duplicateEventIds))
			: [{ total: 0 }];
	const [catalogLinkCount] = await db.select({ total: count() }).from(catalogLinks).where(eq(catalogLinks.integracaoId, removeId));
	const [importJobCount] = await db.select({ total: count() }).from(integrationImportJobs).where(eq(integrationImportJobs.integracaoId, removeId));

	const plan = {
		vendas: removeSales.length,
		vendasConfirmadas: removeSales.filter((sale) => sale.statusVenda === "CONFIRMADA").length,
		valorConfirmado: removeSales.filter((sale) => sale.statusVenda === "CONFIRMADA").reduce((total, sale) => total + sale.valorTotal, 0),
		vendasSemGemea: orphans.length,
		cascata: {
			itens: await countBySaleIds(saleItems, saleItems.vendaId, removeSaleIds),
			conversoesCampanha: await countBySaleIds(campaignConversions, campaignConversions.vendaId, removeSaleIds),
			pagamentosConta: await countBySaleIds(tabPayments, tabPayments.vendaId, removeSaleIds),
			tentativasPagamento: await countBySaleIds(paymentAttempts, paymentAttempts.vendaId, removeSaleIds),
		},
		eventosCampanha: duplicateEvents.length,
		disparosDosEventos: eventDispatches?.total ?? 0,
		vinculosCatalogo: catalogLinkCount?.total ?? 0,
		jobsImportacao: importJobCount?.total ?? 0,
		clientesARecalcular: affectedClientIds.length,
		bloqueios: blocking,
	};
	console.log("[CLEANUP] Plano:", JSON.stringify(plan, null, 2));

	if (orphans.length > 0) {
		throw new Error(`Recusado: ${orphans.length} venda(s) de --remove sem gêmea em --keep: ${orphans.map((sale) => sale.idExterno).join(", ")}`);
	}
	const blockingTotal = Object.values(blocking).reduce((total, value) => total + value, 0);
	if (blockingTotal > 0) throw new Error("Recusado: há efeitos que não caem em cascata ligados às vendas duplicadas (ver `bloqueios`).");

	if (!apply) {
		console.log("[CLEANUP] Simulação: nada foi apagado. Rode de novo com --apply para executar.");
		return;
	}

	await db.transaction(async (tx) => {
		// Mesma trava do data-collecting para esta conexão: um sync em andamento termina antes, e
		// nenhum novo grava vendas dela enquanto a transação corre.
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`data-collecting:${removeId}`}))`);
		if (duplicateEventIds.length > 0) await tx.delete(campaignEvents).where(inArray(campaignEvents.id, duplicateEventIds));
		const deletedSales = await tx
			.delete(sales)
			.where(and(eq(sales.organizacaoId, organizationId), eq(sales.integracaoId, removeId)))
			.returning({ id: sales.id });
		await tx.delete(integrationImportJobs).where(eq(integrationImportJobs.integracaoId, removeId));
		await tx.delete(catalogLinks).where(eq(catalogLinks.integracaoId, removeId));
		await tx.delete(integrations).where(and(eq(integrations.id, removeId), eq(integrations.organizacaoId, organizationId)));
		// Uma venda que chegou entre a simulação e a trava não foi validada acima: desfaz tudo.
		if (deletedSales.length !== removeSales.length) {
			throw new Error(`Recusado: ${deletedSales.length} venda(s) apagada(s), ${removeSales.length} esperada(s). Rode de novo.`);
		}
		console.log(`[CLEANUP] Apagadas ${deletedSales.length} venda(s), ${duplicateEventIds.length} evento(s) e a conexão ${removeId}.`);
	});

	for (const [index, clientId] of affectedClientIds.entries()) {
		await recomputeClientDerivedDataSafely({ organizacaoId: organizationId, clienteId: clientId });
		if ((index + 1) % 20 === 0 || index === affectedClientIds.length - 1)
			console.log(`[CLEANUP] Clientes recalculados: ${index + 1}/${affectedClientIds.length}`);
	}
	console.log("[CLEANUP] Concluído.");
}

main()
	.catch((error) => {
		console.error("[CLEANUP] Falha:", error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await connection.end();
	});
