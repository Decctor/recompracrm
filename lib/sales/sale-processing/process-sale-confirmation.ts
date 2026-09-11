import { accumulateCashbackForClient } from "@/lib/cashback/accumulation";
import { applyCashbackRedemptionFIFO } from "@/lib/cashback/redemption";
import { getCashbackRedemptionBlockReason } from "@/lib/cashback/redemption-policy";
import { type TCouponCartItem, type TCouponRedemptionSurface, evaluateCouponAgainstCart } from "@/lib/coupons/engine";
import type { TBenefitRedemptionSurface } from "@/schemas/enums";
import { processCouponRedemption } from "@/lib/coupons/redemption";
import { processSaleCupomAutoPrintIfEligible } from "@/lib/desktop-agent/auto-print";
import { type TPaymentSplit, getPaymentProvider } from "@/lib/payments";
import { buildSaleEntryTitle } from "@/lib/sales/entry-titles";
import { validateSalesSessionSeller } from "@/lib/sales-sessions";
import { db, type DBTransaction } from "@/services/drizzle";
import {
	cashbackProgramBalances,
	cashbackProgramTransactions,
	cashbackPrograms,
	couponRedemptions,
	sales,
	salesSessions,
} from "@/services/drizzle/schema";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { resolveInitialAttendanceStatus } from "./attendance";
import { createAccountingEntry } from "./create-accounting-entry";
import { processSaleAutomaticFiscalEmissionIfEligible } from "./process-sale-automatic-fiscal-emission";
import { processStockDeduction } from "./process-stock-deduction";
import { registerSaleChangeTransaction } from "./register-sale-change";

export type TProcessSaleConfirmationInput = {
	organization: TOrganizationEntity;

	saleId: string;
	salePayments: TPaymentSplit[];
	saleAuthorId: string | null;
	saleClientId?: string | null;

	saleCashbackProgramId?: string | null;
	saleCashbackRedemptionValue?: number;
	// Superfície onde o cliente PEDIU o desconto em cashback ou a recompensa (não o canal da
	// venda): um orçamento da loja confirmado no PDV continua LOJA_DIGITAL. Gate do programa
	// (`resgatePermitirVia*`) via lib/cashback/redemption-policy. Default POS = operador no balcão.
	saleCashbackRedemptionSurface?: TBenefitRedemptionSurface;

	// Resgate de recompensa (prêmio) do programa de cashback. Mutuamente exclusivo com
	// saleCashbackRedemptionValue e com cupom: a idempotência do ledger é "existe RESGATE
	// para a venda", e duas linhas RESGATE quebrariam reconfirmação e reversão.
	// valorResgate está em moeda cashback (R$ ou pontos); o desconto comercial do prêmio
	// já deve estar refletido no item da venda (item com 100% de desconto).
	saleRewardRedemption?: {
		recompensaId: string;
		programaId: string;
		valorResgate: number;
	} | null;

	// Cupom aplicado à venda (fase 1: no máximo 1 cupom por venda).
	// O desconto já deve estar refletido nos totais da venda (como o cashbackResgate);
	// aqui acontece o registro no ledger, com revalidação de disponibilidade e, para
	// cupons AUTOMATICA, reavaliação do carrinho pelo motor.
	saleCouponId?: string | null;
	saleCouponDeclaredDiscountValue?: number | null;
	saleCouponRedemptionSurface?: TCouponRedemptionSurface;

	accountingEntryDebitAccountId: string;
	accountingEntryCreditAccountId: string;
	initialAttendanceStatus?: ReturnType<typeof resolveInitialAttendanceStatus>;
	accumulateCashback?: boolean;
	// Sessão de venda que recortou esta venda (nullable). Carimba a venda e seus movimentos financeiros.
	sessaoVendaId?: string | null;
};

type TProcessSaleConfirmationPostCommitInput = Pick<TProcessSaleConfirmationInput, "organization" | "saleId" | "saleAuthorId">;

/**
 * Confirms a sale using the caller-owned transaction.
 * All database effects must use `tx`; external effects run after commit.
 */
export async function processSaleConfirmationInTransaction({ tx, input }: { tx: DBTransaction; input: TProcessSaleConfirmationInput }) {
	const sale = await tx.query.sales.findFirst({
		where: (fields, { eq }) => eq(fields.id, input.saleId),
		with: {
			itens: {
				with: {
					adicionais: true,
				},
			},
			cliente: { columns: { nome: true } },
		},
	});

	if (!sale) {
		throw new createHttpError.NotFound("Venda nao encontrada.");
	}

	if (sale.statusVenda !== "ORCAMENTO") {
		throw new createHttpError.BadRequest(`Venda nao pode ser confirmada no status atual: ${sale.statusVenda}`);
	}

	if (input.sessaoVendaId) {
		const [lockedSession] = await tx
			.select({ id: salesSessions.id, status: salesSessions.status, politica: salesSessions.politica, vendedorPadraoId: salesSessions.vendedorPadraoId })
			.from(salesSessions)
			.where(and(eq(salesSessions.id, input.sessaoVendaId), eq(salesSessions.organizacaoId, input.organization.id)))
			.for("update");
		if (!lockedSession || lockedSession.status !== "ABERTA")
			throw new createHttpError.Conflict("A sessao de venda foi fechada. Selecione outro caixa e tente novamente.");
		validateSalesSessionSeller({ session: lockedSession, vendedorId: sale.vendedorId });
	}

	// Status operacional inicial conforme a modalidade de entrega.
	const initialAttendanceStatus = input.initialAttendanceStatus ?? resolveInitialAttendanceStatus(sale.entregaModalidade);

	// Compare-and-set: o update condicionado ao status e a guarda autoritativa contra confirmacao
	// concorrente (a checagem acima e apenas mensagem amigavel). Zero linhas = outra transacao
	// confirmou/cancelou primeiro; abortar antes de criar contabilidade e pagamentos.
	const confirmedAt = new Date();
	const confirmedRows = await tx
		.update(sales)
		.set({
			statusVenda: "CONFIRMADA",
			statusAtendimento: initialAttendanceStatus,
			natureza: "SN01",
			dataVenda: confirmedAt,
			sessaoVendaId: input.sessaoVendaId ?? null,
		})
		.where(and(eq(sales.id, input.saleId), eq(sales.statusVenda, "ORCAMENTO")))
		.returning({ id: sales.id });

	if (confirmedRows.length === 0) {
		throw new createHttpError.Conflict("A venda ja foi confirmada ou alterada por outra operacao. Atualize e tente novamente.");
	}

	const saleLabel = buildSaleEntryTitle({ clientName: sale.cliente?.nome, totalValue: sale.valorTotal, occurredAt: confirmedAt });
	const entry = await createAccountingEntry(tx, {
		organizacaoId: input.organization.id,
		vendaId: input.saleId,
		valor: sale.valorTotal,
		titulo: saleLabel,
		idContaDebito: input.accountingEntryDebitAccountId,
		idContaCredito: input.accountingEntryCreditAccountId,
		autorId: input.saleAuthorId,
	});

	// A confirmacao NAO baixa estoque obrigatoriamente. A baixa fisica acontece na entrega.
	// Quando a venda ja nasce ENTREGUE (ex.: balcao/PRESENCIAL), a entrega e imediata: baixa aqui.
	if (initialAttendanceStatus === "ENTREGUE" && input.organization.configuracao.preferencias.rastreamentoEstoque) {
		await processStockDeduction(tx, {
			organizationId: input.organization.id,
			saleId: input.saleId,
			saleItems: sale.itens,
			saleAuthorId: input.saleAuthorId,
		});
	}

	const paymentProvider = getPaymentProvider(input.organization);
	const paymentResults = await paymentProvider.processPayments(
		{
			vendaId: input.saleId,
			lancamentoContabilId: entry.id,
			organizacaoId: input.organization.id,
			pagamentos: input.salePayments,
			autorId: input.saleAuthorId,
			sessaoVendaId: input.sessaoVendaId ?? null,
			saleLabel,
		},
		tx,
	);

	// Pagamentos entram pelo valor entregue pelo cliente; o excesso sobre o total vira uma SAÍDA
	// de troco em dinheiro no mesmo lançamento (valida as regras e lança, ou aborta a confirmação).
	const change = await registerSaleChangeTransaction({
		tx,
		organization: input.organization,
		lancamentoContabilId: entry.id,
		salePayments: input.salePayments,
		saleTotal: sale.valorTotal,
		sessaoVendaId: input.sessaoVendaId ?? null,
		autorId: input.saleAuthorId,
	});

	let cashbackRedemptionResult: {
		transactionId: string;
		newBalance: number;
	} | null = null;

	const clientId = input.saleClientId ?? sale.clienteId;
	const redemptionValue = input.saleCashbackRedemptionValue ?? 0;
	const rewardRedemption = input.saleRewardRedemption ?? null;

	if (rewardRedemption && redemptionValue > 0) {
		throw new createHttpError.BadRequest("Resgate de recompensa nao pode ser combinado com desconto em cashback.");
	}
	if (rewardRedemption && input.saleCouponId) {
		throw new createHttpError.BadRequest("Cupons nao podem ser combinados com resgate de recompensa.");
	}

	if (rewardRedemption) {
		if (!clientId) throw new createHttpError.BadRequest("Cliente nao informado para resgate de recompensa.");

		cashbackRedemptionResult = await (async () => {
			// Idempotencia identica ao resgate-desconto: uma venda tem no maximo 1 RESGATE;
			// reconfirmacoes reaproveitam a transacao existente.
			const existingRedemption = await tx.query.cashbackProgramTransactions.findFirst({
				where: and(
					eq(cashbackProgramTransactions.organizacaoId, input.organization.id),
					eq(cashbackProgramTransactions.vendaId, input.saleId),
					eq(cashbackProgramTransactions.tipo, "RESGATE"),
				),
				columns: { id: true, saldoValorPosterior: true },
			});
			if (existingRedemption) {
				return {
					transactionId: existingRedemption.id,
					newBalance: existingRedemption.saldoValorPosterior,
				};
			}

			const program = await tx.query.cashbackPrograms.findFirst({
				where: and(
					eq(cashbackPrograms.id, rewardRedemption.programaId),
					eq(cashbackPrograms.organizacaoId, input.organization.id),
					eq(cashbackPrograms.ativo, true),
				),
			});
			if (!program) throw new createHttpError.NotFound("Programa de cashback nao encontrado.");
			if (!program.modalidadeRecompensasPermitida) throw new createHttpError.BadRequest("Resgate de recompensas nao permitido para esta venda.");
			const surfaceBlockReason = getCashbackRedemptionBlockReason({ program, surface: input.saleCashbackRedemptionSurface ?? "POS" });
			if (surfaceBlockReason) throw new createHttpError.Forbidden(surfaceBlockReason);
			// Sem checagem de resgateLimite*: o teto e da modalidade desconto. O "preco" da
			// recompensa e o proprio valor do premio, validado contra o catalogo pelo caller.

			const redemptionResult = await applyCashbackRedemptionFIFO({
				tx,
				orgId: input.organization.id,
				clientId,
				programId: program.id,
				redemptionValue: rewardRedemption.valorResgate,
			});

			const insertedTransaction = await tx
				.insert(cashbackProgramTransactions)
				.values({
					organizacaoId: input.organization.id,
					clienteId: clientId,
					vendaId: input.saleId,
					vendaValor: sale.valorTotal,
					programaId: program.id,
					status: "ATIVO",
					tipo: "RESGATE",
					valor: -rewardRedemption.valorResgate,
					valorRestante: 0,
					saldoValorAnterior: redemptionResult.previousBalance,
					saldoValorPosterior: redemptionResult.newBalance,
					expiracaoData: null,
					operadorId: input.saleAuthorId,
					operadorVendedorId: sale.vendedorId,
					resgateRecompensaId: rewardRedemption.recompensaId,
					resgateRecompensaValor: rewardRedemption.valorResgate,
					metadados: {
						consumoFifo: redemptionResult.consumedFromAccumulations,
					},
				})
				.returning({ id: cashbackProgramTransactions.id });

			const transactionId = insertedTransaction[0]?.id;
			if (!transactionId) throw new createHttpError.InternalServerError("Erro ao registrar transacao de resgate de recompensa.");

			return {
				transactionId,
				newBalance: redemptionResult.newBalance,
			};
		})();
	} else if (redemptionValue > 0) {
		if (!clientId) throw new createHttpError.BadRequest("Cliente nao informado para resgate de cashback.");

		cashbackRedemptionResult = await (async () => {
			const existingRedemption = await tx.query.cashbackProgramTransactions.findFirst({
				where: and(
					eq(cashbackProgramTransactions.organizacaoId, input.organization.id),
					eq(cashbackProgramTransactions.vendaId, input.saleId),
					eq(cashbackProgramTransactions.tipo, "RESGATE"),
				),
				columns: { id: true, saldoValorPosterior: true },
			});
			if (existingRedemption) {
				return {
					transactionId: existingRedemption.id,
					newBalance: existingRedemption.saldoValorPosterior,
				};
			}

			const balance = await tx.query.cashbackProgramBalances.findFirst({
				where: and(eq(cashbackProgramBalances.organizacaoId, input.organization.id), eq(cashbackProgramBalances.clienteId, clientId)),
				columns: {
					programaId: true,
				},
			});
			if (!balance) throw new createHttpError.NotFound("Saldo de cashback nao encontrado para este cliente.");

			const programId = input.saleCashbackProgramId ?? balance.programaId;
			if (!programId) throw new createHttpError.BadRequest("Programa de cashback nao informado.");

			const program = await tx.query.cashbackPrograms.findFirst({
				where: and(eq(cashbackPrograms.id, programId), eq(cashbackPrograms.organizacaoId, input.organization.id), eq(cashbackPrograms.ativo, true)),
			});
			if (!program) throw new createHttpError.NotFound("Programa de cashback nao encontrado.");
			if (!program.modalidadeDescontosPermitida) throw new createHttpError.BadRequest("Resgate de cashback nao permitido para esta venda.");
			const surfaceBlockReason = getCashbackRedemptionBlockReason({ program, surface: input.saleCashbackRedemptionSurface ?? "POS" });
			if (surfaceBlockReason) throw new createHttpError.Forbidden(surfaceBlockReason);
			if (program.resgateLimiteTipo && program.resgateLimiteValor !== null && program.resgateLimiteValor !== undefined) {
				const saleValueBeforeCashback = sale.valorTotal + redemptionValue;
				const maxAllowed =
					program.resgateLimiteTipo === "FIXO" ? program.resgateLimiteValor : (saleValueBeforeCashback * program.resgateLimiteValor) / 100;
				if (redemptionValue > maxAllowed) throw new createHttpError.BadRequest("Valor de resgate excede o limite permitido.");
			}

			const redemptionResult = await applyCashbackRedemptionFIFO({
				tx,
				orgId: input.organization.id,
				clientId,
				programId,
				redemptionValue,
			});

			const insertedTransaction = await tx
				.insert(cashbackProgramTransactions)
				.values({
					organizacaoId: input.organization.id,
					clienteId: clientId,
					vendaId: input.saleId,
					vendaValor: sale.valorTotal,
					programaId: programId,
					status: "ATIVO",
					tipo: "RESGATE",
					valor: -redemptionValue,
					valorRestante: 0,
					saldoValorAnterior: redemptionResult.previousBalance,
					saldoValorPosterior: redemptionResult.newBalance,
					expiracaoData: null,
					operadorId: input.saleAuthorId,
					operadorVendedorId: sale.vendedorId,
					metadados: {
						consumoFifo: redemptionResult.consumedFromAccumulations,
					},
				})
				.returning({ id: cashbackProgramTransactions.id });

			const transactionId = insertedTransaction[0]?.id;
			if (!transactionId) throw new createHttpError.InternalServerError("Erro ao registrar transacao de resgate de cashback.");

			return {
				transactionId,
				newBalance: redemptionResult.newBalance,
			};
		})();
	}

	let couponRedemptionResult: { redemptionId: string; valorDesconto: number } | null = null;

	if (input.saleCouponId) {
		if (!clientId) throw new createHttpError.BadRequest("Cliente nao informado para resgate de cupom.");

		couponRedemptionResult = await (async () => {
			// Idempotencia: uma venda tem no maximo 1 cupom (fase 1); reconfirmacoes reaproveitam o resgate.
			const existingRedemption = await tx.query.couponRedemptions.findFirst({
				where: and(
					eq(couponRedemptions.organizacaoId, input.organization.id),
					eq(couponRedemptions.vendaId, input.saleId),
					eq(couponRedemptions.status, "UTILIZADO"),
				),
				columns: { id: true, valorDesconto: true },
			});
			if (existingRedemption) return { redemptionId: existingRedemption.id, valorDesconto: existingRedemption.valorDesconto };

			const coupon = await tx.query.coupons.findFirst({
				where: (fields, { eq, and }) => and(eq(fields.id, input.saleCouponId as string), eq(fields.organizacaoId, input.organization.id)),
				with: { alvos: true },
			});
			if (!coupon) throw new createHttpError.NotFound("Cupom nao encontrado.");

			const declaredDiscountValue = input.saleCouponDeclaredDiscountValue ?? 0;
			let discountValue = declaredDiscountValue;

			if (coupon.validacaoModo === "AUTOMATICA") {
				// Reavalia o carrinho no servidor: o valor do motor e o autoritativo.
				const productIds = [...new Set(sale.itens.map((item) => item.produtoId))];
				const productsResult =
					productIds.length > 0
						? await tx.query.products.findMany({
								where: (fields, { inArray }) => inArray(fields.id, productIds),
								columns: { id: true, grupo: true },
							})
						: [];
				const productGroupById = new Map(productsResult.map((product) => [product.id, product.grupo]));
				const cartItems: TCouponCartItem[] = sale.itens.map((item) => ({
					chave: item.id,
					produtoId: item.produtoId,
					produtoVarianteId: item.produtoVarianteId,
					grupo: productGroupById.get(item.produtoId) ?? null,
					quantidade: item.quantidade,
					valorVendaUnitario: item.valorVendaUnitario,
				}));

				const evaluation = evaluateCouponAgainstCart({ coupon, targets: coupon.alvos, cartItems });
				if (!evaluation.elegivel) throw new createHttpError.BadRequest(`Cupom nao elegivel para essa venda: ${evaluation.motivo}`);
				if (declaredDiscountValue > 0 && Math.abs(evaluation.valorDesconto - declaredDiscountValue) > 0.01) {
					throw new createHttpError.BadRequest("O desconto do cupom esta desatualizado para o carrinho atual. Reaplique o cupom e tente novamente.");
				}
				discountValue = evaluation.valorDesconto;
			} else {
				// MANUAL: o operador valida as condicoes e informa/confirma o valor do desconto.
				if (discountValue <= 0) throw new createHttpError.BadRequest("Informe o valor do desconto do cupom de validacao manual.");
				const saleGrossItemsTotal = sale.itens.reduce((sum, item) => sum + item.valorVendaTotalBruto, 0);
				if (discountValue > saleGrossItemsTotal) {
					throw new createHttpError.BadRequest("O desconto do cupom nao pode superar o valor bruto da venda.");
				}
			}

			const redemption = await processCouponRedemption({
				trx: tx,
				organizacaoId: input.organization.id,
				cupomId: coupon.id,
				clienteId: clientId,
				surface: input.saleCouponRedemptionSurface ?? "POS",
				valorDesconto: discountValue,
				vendaId: input.saleId,
				vendaValor: sale.valorTotal,
				operadorId: input.saleAuthorId,
				operadorVendedorId: sale.vendedorId,
			});

			return { redemptionId: redemption.redemptionId, valorDesconto: discountValue };
		})();
	}

	let cashbackAccumulationResult: Awaited<ReturnType<typeof accumulateCashbackForClient>> | null = null;

	if (clientId && input.accumulateCashback !== false) {
		cashbackAccumulationResult = await (async () => {
			const program = input.saleCashbackProgramId
				? await tx.query.cashbackPrograms.findFirst({
						where: and(
							eq(cashbackPrograms.id, input.saleCashbackProgramId),
							eq(cashbackPrograms.organizacaoId, input.organization.id),
							eq(cashbackPrograms.ativo, true),
						),
					})
				: await tx.query.cashbackPrograms.findFirst({
						where: and(eq(cashbackPrograms.organizacaoId, input.organization.id), eq(cashbackPrograms.ativo, true)),
					});

			if (!program) return null;

			return accumulateCashbackForClient({
				tx,
				orgId: input.organization.id,
				clientId,
				saleId: input.saleId,
				saleValue: sale.valorTotal,
				operatorId: input.saleAuthorId,
				operatorSellerId: sale.vendedorId,
				program,
				metadata: {
					origem: "POS",
					processamentoOrigem: sale.processamentoOrigem,
				},
			});
		})();
	}

	return {
		vendaId: input.saleId,
		lancamentoContabilId: entry.id,
		pagamentos: paymentResults,
		troco: change?.valor ?? 0,
		cashbackResgate: cashbackRedemptionResult,
		cashbackAcumulo: cashbackAccumulationResult,
		cupomResgate: couponRedemptionResult,
	};
}
export async function processSaleConfirmationPostCommit(input: TProcessSaleConfirmationPostCommitInput) {
	// Cupom automático ANTES da emissão fiscal: cupom é latência-sensível (TTL 30min) e a emissão
	// pode envolver o provedor. Um ponto cobre POS (create-and-confirm e confirm), comanda e shop.
	// Nunca lança; a chave de idempotência (CUPOM_VENDA:<vendaId>) absorve reconfirmações.
	await processSaleCupomAutoPrintIfEligible({
		organizacaoId: input.organization.id,
		saleId: input.saleId,
		configuracao: input.organization.configuracao,
		solicitadoPorId: input.saleAuthorId,
	});
	// A decisão de emitir (org default vs. override por venda) vive na coluna sales.emissaoFiscalAutomatica,
	// resolvida dentro de processSaleAutomaticFiscalEmissionIfEligible — fonte única para confirm e entrega.
	return processSaleAutomaticFiscalEmissionIfEligible({
		organization: input.organization,
		saleId: input.saleId,
		authorId: input.saleAuthorId,
	});
}

export async function processSaleConfirmation(input: TProcessSaleConfirmationInput) {
	const confirmation = await db.transaction((tx) => processSaleConfirmationInTransaction({ tx, input }));
	const fiscal = await processSaleConfirmationPostCommit(input);

	return {
		...confirmation,
		fiscal,
	};
}
