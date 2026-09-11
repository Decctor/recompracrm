import { reverseSaleCashback } from "@/lib/cashback/reverse-sale-cashback";
import { writeDefaultAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";
import { cancelCouponRedemption } from "@/lib/coupons/redemption";
import { registerRefundCashMovement, resolveActiveSalesSession } from "@/lib/sales-sessions";
import { saleFiscalDocumentsAllowCancellation } from "@/lib/sales/sale-editability";
import { reverseSaleItemStock } from "@/lib/sales/sale-processing/reverse-sale-item-stock";
import { applyStockMovement } from "@/lib/stock/apply-stock-movement";
import { db } from "@/services/drizzle";
import { accountingEntries, couponRedemptions, financialTransactions, productStockLots, saleItems, sales } from "@/services/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import createHttpError from "http-errors";

export async function processConfirmedSaleCancellation({
	organizationId,
	saleId,
	authorId,
	reason,
	sessaoVendaId,
}: {
	organizationId: string;
	saleId: string;
	authorId: string;
	reason: string;
	// Sessão de venda atualmente aberta (informada pelo cliente). O estorno de dinheiro cai nela.
	sessaoVendaId?: string | null;
}) {
	const sale = await db.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, saleId), eq(fields.organizacaoId, organizationId)),
		with: {
			documentosFiscais: { columns: { id: true, statusInterno: true, documentoOrigemId: true } },
			lancamentosContabeis: {
				columns: { id: true, idContaDebito: true, idContaCredito: true, valor: true, titulo: true },
				with: { transacoesFinanceiras: true },
			},
			movimentacoesEstoque: true,
		},
	});
	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");
	if (sale.statusVenda !== "CONFIRMADA") throw new createHttpError.BadRequest("Somente vendas confirmadas podem ser canceladas por este processo.");
	if (!saleFiscalDocumentsAllowCancellation(sale.documentosFiscais)) {
		throw new createHttpError.BadRequest(
			"Cancele o documento fiscal da venda antes de cancelar o pedido. Fora do prazo de cancelamento, gere a NF-e de devolução pelo módulo fiscal.",
		);
	}

	// Estorno de gaveta: dinheiro efetivamente recebido nesta venda, líquido do troco já entregue
	// (SAÍDA em DINHEIRO do próprio lançamento) — devolve-se ao cliente o que ele pagou de fato.
	const cashEfetivado = Math.max(
		0,
		sale.lancamentosContabeis
			.flatMap((entry) => entry.transacoesFinanceiras)
			.filter((transaction) => transaction.metodo === "DINHEIRO" && transaction.dataEfetivacao)
			.reduce((acc, transaction) => acc + (transaction.tipo === "SAIDA" ? -transaction.valor : transaction.valor), 0),
	);
	// A sessão é uma lente: o estorno cai sempre na sessão atualmente aberta, nunca na original (imutável).
	const activeSession = sessaoVendaId ? await resolveActiveSalesSession({ orgId: organizationId, sessaoVendaId }) : null;

	await db.transaction(async (tx) => {
		if (sale.clienteId) {
			await reverseSaleCashback({ tx, saleId, clientId: sale.clienteId, organizationId, reason });
		}

		// Devolve o uso de cupons da venda: marca o resgate como CANCELADO e reincrementa a atribuição.
		const saleCouponRedemptions = await tx.query.couponRedemptions.findMany({
			where: and(eq(couponRedemptions.vendaId, saleId), eq(couponRedemptions.organizacaoId, organizationId), eq(couponRedemptions.status, "UTILIZADO")),
			columns: { id: true },
		});
		for (const redemption of saleCouponRedemptions) {
			await cancelCouponRedemption({ trx: tx, organizacaoId: organizationId, redemptionId: redemption.id });
		}

		for (const transaction of sale.lancamentosContabeis.flatMap((entry) => entry.transacoesFinanceiras)) {
			await tx
				.update(financialTransactions)
				.set({ provedorStatus: transaction.dataEfetivacao ? "ESTORNADO" : "CANCELADO" })
				.where(eq(financialTransactions.id, transaction.id));
		}
		const originalEntry = sale.lancamentosContabeis[0];
		if (originalEntry) {
			const [reversalEntry] = await tx
				.insert(accountingEntries)
				.values({
					organizacaoId: organizationId,
					vendaId: saleId,
					origemTipo: "ESTORNO",
					titulo: `ESTORNO ${originalEntry.titulo}`,
					anotacoes: reason,
					idContaDebito: originalEntry.idContaCredito,
					idContaCredito: originalEntry.idContaDebito,
					valor: originalEntry.valor,
					dataCompetencia: new Date(),
					autorId: authorId,
				})
				.returning({ id: accountingEntries.id });

			if (reversalEntry?.id)
				await writeDefaultAccountingEntryLines({
					trx: tx,
					organizationId,
					accountingEntryId: reversalEntry.id,
					entryValue: originalEntry.valor,
					debitAccountId: originalEntry.idContaCredito,
					creditAccountId: originalEntry.idContaDebito,
				});

			// Saída de dinheiro do caixa na sessão atual, refletindo o estorno na gaveta.
			if (activeSession && reversalEntry?.id) {
				await registerRefundCashMovement({
					tx,
					orgId: organizationId,
					sessaoVendaId: activeSession.id,
					lancamentoContabilId: reversalEntry.id,
					valorDinheiro: cashEfetivado,
					contaFinanceiraId: activeSession.contaFinanceiraId ?? null,
					autorId: authorId,
					titulo: `ESTORNO DINHEIRO - ${originalEntry.titulo}`,
				});
			}
		}

		// Estorno por item (líquido de devoluções anteriores) — também zera `quantidadeEntregue`,
		// mantendo o dedup de baixa consistente.
		const saidaMovements = sale.movimentacoesEstoque.filter((item) => item.tipo === "SAIDA");
		const saleItemIdsWithMovements = [...new Set(saidaMovements.map((movement) => movement.vendaItemId).filter((id): id is string => id != null))];
		for (const saleItemId of saleItemIdsWithMovements) {
			await reverseSaleItemStock({
				tx,
				organizationId,
				saleId,
				saleItemId,
				authorId,
				reason: `Estorno de venda cancelada: ${reason}`,
			});
		}

		// Movimentos legados sem vínculo ao item: estorno direto, um-para-um.
		for (const movement of saidaMovements.filter((item) => item.vendaItemId == null)) {
			await applyStockMovement({
				trx: tx,
				organizationId,
				userId: authorId,
				produtoId: movement.produtoId,
				produtoVarianteId: movement.produtoVarianteId,
				signedQuantity: movement.quantidade,
				movementType: "ENTRADA_DEVOLUCAO",
				reason: `Estorno de venda cancelada: ${reason}`,
				unitCost: movement.custoUnitarioMovimentado,
				links: {
					loteId: movement.loteId,
					vendaId: saleId,
					vendaItemId: null,
				},
			});

			if (movement.loteId) {
				const stockLot = await tx.query.productStockLots.findFirst({
					where: and(eq(productStockLots.id, movement.loteId), eq(productStockLots.organizacaoId, organizationId)),
					columns: { id: true, dataValidade: true, status: true },
				});

				if (stockLot) {
					const nextStatus =
						stockLot.status === "DESCARTADO" ? "DESCARTADO" : stockLot.dataValidade && stockLot.dataValidade < new Date() ? "VENCIDO" : "ATIVO";
					await tx
						.update(productStockLots)
						.set({
							quantidadeAtual: sql`${productStockLots.quantidadeAtual} + ${movement.quantidade}`,
							status: nextStatus,
						})
						.where(and(eq(productStockLots.id, movement.loteId), eq(productStockLots.organizacaoId, organizationId)));
				}
			}
		}

		// Venda terminal: nenhuma quantidade permanece "entregue" para fins de dedup de baixa.
		await tx
			.update(saleItems)
			.set({ quantidadeEntregue: 0 })
			.where(and(eq(saleItems.vendaId, saleId), eq(saleItems.organizacaoId, organizationId)));

		await tx
			.update(sales)
			.set({
				statusVenda: "CANCELADA",
				statusAtendimento: "CANCELADO",
				observacoes: [sale.observacoes, `Cancelamento: ${reason}`].filter(Boolean).join("\n"),
			})
			.where(and(eq(sales.id, saleId), eq(sales.organizacaoId, organizationId)));
	});

	return { saleId, statusVenda: "CANCELADA" as const, statusAtendimento: "CANCELADO" as const };
}
