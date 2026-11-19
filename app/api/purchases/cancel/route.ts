import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { buildReversalAccountingEntryLines, syncAccountingEntryLines } from "@/lib/finances/accounting-entry-lines";
import { isPurchaseDestinationAccountNature } from "@/lib/purchase/destination";
import { planPurchaseCancellation } from "@/lib/purchase-processing/purchase-cancellation";
import { handlePurchaseItemStockProcessing } from "@/lib/purchase-processing/process-purchase-item-stock";
import { assertPurchaseLotsArePristine, isPurchaseConsideredReceived } from "@/lib/purchase-processing/purchase-state";
import { PurchaseCancellationTransactionResolutionEnum } from "@/schemas/enums";
import { db, type DBTransaction } from "@/services/drizzle";
import { accountingEntries, financialTransactions, purchases } from "@/services/drizzle/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import createHttpError from "http-errors";
import { NextResponse, type NextRequest } from "next/server";
import z from "zod";

const CancelPurchaseInputSchema = z.object({
	purchaseId: z.string({ required_error: "ID da compra não informado.", invalid_type_error: "Tipo não válido para o ID da compra." }),
	reason: z
		.string({ invalid_type_error: "Tipo não válido para o motivo do cancelamento." })
		.trim()
		.max(500, "O motivo do cancelamento pode ter no máximo 500 caracteres.")
		.optional()
		.nullable(),
	transactionResolutions: z.array(
		z.object({
			transactionId: z.string({ required_error: "ID da parcela não informado.", invalid_type_error: "Tipo não válido para o ID da parcela." }),
			resolution: PurchaseCancellationTransactionResolutionEnum,
			// Só para DEVOLUCAO: quando o fornecedor deve devolver o valor.
			refundForecastDate: z
				.string({ invalid_type_error: "Tipo não válido para a data prevista da devolução." })
				.datetime({ message: "Data prevista da devolução inválida." })
				.optional()
				.nullable()
				.transform((value) => (value ? new Date(value) : null)),
		}),
		{ required_error: "Resoluções das parcelas não informadas.", invalid_type_error: "Tipo não válido para as resoluções das parcelas." },
	),
	// Conta que recebe o custo do cancelamento (parcelas mantidas e pagas sem devolução). Sem ela, vale
	// a conta de despesas do período configurada para compras.
	lossAccountId: z.string({ invalid_type_error: "Tipo não válido para a conta da perda." }).optional().nullable(),
});
export type TCancelPurchaseInput = z.input<typeof CancelPurchaseInputSchema>;
type TCancelPurchaseParsedInput = z.output<typeof CancelPurchaseInputSchema>;

async function cancelPurchase({ input, session }: { input: TCancelPurchaseParsedInput; session: TAuthUserSession }) {
	const orgId = session.membership?.organizacao.id;
	if (!orgId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	if (!session.membership?.permissoes.compras.editar) throw new createHttpError.Unauthorized("Você não possui permissão para cancelar essa compra.");

	const reason = input.reason?.trim() || null;
	const resolutionById = new Map(input.transactionResolutions.map((entry) => [entry.transactionId, entry]));
	if (resolutionById.size !== input.transactionResolutions.length) throw new createHttpError.BadRequest("Há parcelas repetidas no cancelamento.");

	return await db.transaction(async (tx) => {
		const locked = await tx
			.select({ id: purchases.id })
			.from(purchases)
			.where(and(eq(purchases.id, input.purchaseId), eq(purchases.organizacaoId, orgId)))
			.for("update");
		if (locked.length === 0) throw new createHttpError.NotFound("Compra não encontrada.");

		const purchase = await tx.query.purchases.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, input.purchaseId), eq(fields.organizacaoId, orgId)),
			with: { itens: true },
		});
		if (!purchase) throw new createHttpError.NotFound("Compra não encontrada.");
		if (purchase.status === "CANCELADA") throw new createHttpError.Conflict("Esta compra já está cancelada.");

		const entry = purchase.lancamentoContabilId
			? await tx.query.accountingEntries.findFirst({
					where: (fields, { and, eq }) => and(eq(fields.id, purchase.lancamentoContabilId as string), eq(fields.organizacaoId, orgId)),
					with: { linhas: { orderBy: (fields) => [asc(fields.ordem)] } },
				})
			: null;

		// Trava as parcelas: uma conciliação que efetivasse uma delas entre a leitura e o cancelamento
		// mudaria a resolução válida (pendente ↔ paga).
		const transactions = entry
			? await tx.select().from(financialTransactions).where(and(eq(financialTransactions.lancamentoContabilId, entry.id), eq(financialTransactions.organizacaoId, orgId))).for("update")
			: [];

		let plan: ReturnType<typeof planPurchaseCancellation>;
		try {
			plan = planPurchaseCancellation({
				transactions,
				resolutions: new Map(input.transactionResolutions.map((entry) => [entry.transactionId, entry.resolution])),
			});
		} catch (error) {
			throw new createHttpError.BadRequest(error instanceof Error ? error.message : "Resoluções das parcelas inválidas.");
		}

		// 1. Estoque: desfaz a entrada dos itens que entraram no estoque (o destino gravado decide).
		if (isPurchaseConsideredReceived(purchase)) {
			await assertPurchaseLotsArePristine({ tx, organizationId: orgId, purchaseId: purchase.id });
			for (const item of purchase.itens) {
				await handlePurchaseItemStockProcessing({
					trx: tx,
					organizationId: orgId,
					userId: session.user.id,
					purchaseId: purchase.id,
					operation: "UNRECEIVING",
					// O item volta como estava gravado (validade e destino inclusos): o cancelamento não o edita.
					item: { ...item, deletar: false },
					reasonOverride: { exit: "Rollback - compra cancelada" },
				});
			}
		}

		// 2. Estorno contábil linha a linha, retendo o custo do cancelamento na conta de perda.
		let reversalEntryId: string | null = null;
		if (entry) {
			let lossAccountId: string | null = null;
			if (plan.valorRetido > 0) {
				lossAccountId = input.lossAccountId ?? (await resolveDefaultLossAccountId({ tx, orgId }));
				if (!lossAccountId)
					throw new createHttpError.BadRequest(
						"Informe a conta do custo do cancelamento (há parcelas mantidas ou pagas sem devolução).",
					);
				const lossAccount = await tx.query.accountsCharts.findFirst({
					where: (fields, { and, eq }) => and(eq(fields.id, lossAccountId as string), eq(fields.organizacaoId, orgId)),
					columns: { id: true, natureza: true },
				});
				if (!lossAccount || !isPurchaseDestinationAccountNature(lossAccount.natureza) || lossAccount.natureza === "ATIVO")
					throw new createHttpError.BadRequest("A conta do custo do cancelamento precisa ser uma conta de custo ou despesa desta organização.");
			}

			const originalLines =
				entry.linhas.length > 0
					? entry.linhas
					: [
							{ contaContabilId: entry.idContaDebito, natureza: "DEBITO" as const, valor: entry.valor, descricao: null, metadados: null },
							{ contaContabilId: entry.idContaCredito, natureza: "CREDITO" as const, valor: entry.valor, descricao: null, metadados: null },
						];
			let reversal: ReturnType<typeof buildReversalAccountingEntryLines>;
			try {
				reversal = buildReversalAccountingEntryLines({
					lines: originalLines,
					retained: lossAccountId ? { contaContabilId: lossAccountId, valor: plan.valorRetido, descricao: "Custo do cancelamento da compra" } : null,
				});
			} catch (error) {
				throw new createHttpError.BadRequest(error instanceof Error ? error.message : "Não foi possível estornar o lançamento da compra.");
			}

			const [insertedReversal] = await tx
				.insert(accountingEntries)
				.values({
					organizacaoId: orgId,
					compraId: purchase.id,
					origemTipo: "ESTORNO",
					titulo: `ESTORNO ${entry.titulo}`,
					anotacoes: reason,
					// Par legado (sombra): o inverso do original. As linhas são a fonte de verdade. Ver ADR-0001.
					idContaDebito: entry.idContaCredito,
					idContaCredito: entry.idContaDebito,
					valor: reversal.entryValue,
					dataCompetencia: new Date(),
					autorId: session.user.id,
				})
				.returning({ id: accountingEntries.id });
			reversalEntryId = insertedReversal?.id ?? null;
			if (!reversalEntryId) throw new createHttpError.InternalServerError("Erro ao criar o estorno da compra.");
			await syncAccountingEntryLines({ trx: tx, organizationId: orgId, accountingEntryId: reversalEntryId, entryValue: reversal.entryValue, lines: reversal.lines });

			// 3. Devoluções: cada parcela paga que o fornecedor devolve vira uma entrada prevista no estorno.
			const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
			const refunds = plan.refundTransactionIds.map((id) => {
				const original = transactionById.get(id);
				if (!original) throw new createHttpError.BadRequest("Parcela da devolução não encontrada.");
				const forecastDate = resolutionById.get(id)?.refundForecastDate;
				if (!forecastDate) throw new createHttpError.BadRequest("Informe a data prevista de cada devolução.");
				return {
					organizacaoId: orgId,
					lancamentoContabilId: reversalEntryId as string,
					contaFinanceiraId: original.contaFinanceiraId,
					titulo: `DEVOLUÇÃO ${original.titulo}`,
					tipo: original.tipo === "SAIDA" ? ("ENTRADA" as const) : ("SAIDA" as const),
					valor: original.valor,
					valorBase: original.valor,
					metodo: original.metodo,
					dataPrevisao: forecastDate,
					modificadoresMetadata: { origem: "DEVOLUCAO_COMPRA_CANCELADA", observacoes: reason },
					autorId: session.user.id,
				};
			});
			if (refunds.length > 0) await tx.insert(financialTransactions).values(refunds);
		}

		// 4. Parcelas pendentes canceladas. `data_efetivacao IS NULL` no próprio UPDATE: a trava acima já
		// impede a corrida, e a condição garante que nenhuma parcela paga seja cancelada.
		if (plan.cancelTransactionIds.length > 0) {
			const cancelled = await tx
				.update(financialTransactions)
				.set({ dataCancelamento: new Date(), cancelamentoMotivo: reason ?? "Compra cancelada", cancelamentoAutorId: session.user.id })
				.where(
					and(
						inArray(financialTransactions.id, plan.cancelTransactionIds),
						eq(financialTransactions.organizacaoId, orgId),
						isNull(financialTransactions.dataEfetivacao),
						isNull(financialTransactions.dataCancelamento),
					),
				)
				.returning({ id: financialTransactions.id });
			if (cancelled.length !== plan.cancelTransactionIds.length)
				throw new createHttpError.Conflict("Uma das parcelas mudou de situação durante o cancelamento. Recarregue e tente de novo.");
		}

		await tx
			.update(purchases)
			.set({
				status: "CANCELADA",
				entregaDataRecebimentoEfetivacao: null,
				dataCancelamento: new Date(),
				cancelamentoMotivo: reason,
				cancelamentoAutorId: session.user.id,
				dataUltimaAtualizacao: new Date(),
			})
			.where(and(eq(purchases.id, purchase.id), eq(purchases.organizacaoId, orgId)));

		return {
			data: {
				cancelledPurchaseId: purchase.id,
				reversalAccountingEntryId: reversalEntryId,
				valorCancelado: plan.valorCancelado,
				valorMantido: plan.valorMantido,
				valorDevolucao: plan.valorDevolucao,
				valorPerda: plan.valorPerda,
			},
			message: "Compra cancelada com sucesso.",
		};
	});
}
export type TCancelPurchaseOutput = Awaited<ReturnType<typeof cancelPurchase>>;

async function resolveDefaultLossAccountId({ tx, orgId }: { tx: DBTransaction; orgId: string }) {
	const organization = await tx.query.organizations.findFirst({
		where: (fields, { eq }) => eq(fields.id, orgId),
		columns: { configuracao: true },
	});
	return organization?.configuracao.defaults.contabilidade.lancamentosPadrao.compras?.debitoDespesaPeriodoContaId ?? null;
}

async function cancelPurchaseRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = CancelPurchaseInputSchema.parse(await request.json());
	const result = await cancelPurchase({ input, session });
	return NextResponse.json(result);
}

export const POST = appApiHandler({
	POST: cancelPurchaseRoute,
});
