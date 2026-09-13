import { resolvePaymentFinancialAccounts } from "@/lib/payments";
import { getCouponCheckoutConditionIssue, readCouponCheckoutConditions } from "@/lib/coupons/conditions";
import { saleHasLiveFiscalDocument } from "@/lib/sales/sale-editability";
import {
	buildPaymentTransactionTitle,
	classifySalePaymentTransactions,
	extractPaymentObservacoesFromTitle,
	type SalePaymentTransactionInput,
} from "@/lib/sales/utils";
import type { TDeliveryModeEnum, TPaymentMethodEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";
import { financialTransactions, sales } from "@/services/drizzle/schema";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { mapSaleRowToFulfillmentCard } from "./map-sale-to-fulfillment-card";

export type PatchSaleFulfillmentEntregaInput = {
	modalidade: TDeliveryModeEnum;
	comandaNumero?: string | null;
};

export type PatchSaleFulfillmentPagamentoInput = {
	transacaoId: string;
	metodo: TPaymentMethodEnum;
	contaFinanceiraId?: string | null;
};

export type ProcessSaleFulfillmentCorrectionInput =
	| {
			organization: TOrganizationEntity;
			saleId: string;
			entrega: PatchSaleFulfillmentEntregaInput;
	  }
	| {
			organization: TOrganizationEntity;
			saleId: string;
			pagamento: PatchSaleFulfillmentPagamentoInput;
	  };

async function loadCorrectableSale(organizationId: string, saleId: string) {
	const sale = await db.query.sales.findFirst({
		where: (fields, { and, eq }) => and(eq(fields.id, saleId), eq(fields.organizacaoId, organizationId)),
		columns: {
			id: true,
			idExterno: true,
			valorTotal: true,
			statusVenda: true,
			statusAtendimento: true,
			entregaModalidade: true,
			comandaNumero: true,
			clienteId: true,
			observacoes: true,
			dataVenda: true,
			processamentoOrigem: true,
			entregaLocalizacaoId: true,
			tabId: true,
		},
		with: {
			integracao: { columns: { tipo: true, apelido: true } },
			cliente: { columns: { id: true, nome: true, telefone: true } },
			documentosFiscais: { columns: { id: true, statusInterno: true, documentoOrigemId: true, dataInsercao: true } },
			lancamentosContabeis: {
				columns: { id: true },
				with: {
					transacoesFinanceiras: {
						columns: {
							id: true,
							lancamentoContabilId: true,
							titulo: true,
							valor: true,
							tipo: true,
							metodo: true,
							contaFinanceiraId: true,
							parcela: true,
							totalParcelas: true,
							dataEfetivacao: true,
							dataPrevisao: true,
							provedorStatus: true,
						},
					},
				},
			},
		},
	});

	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");
	if (sale.statusVenda !== "CONFIRMADA") {
		throw new createHttpError.BadRequest("Use o checkout para editar rascunhos.");
	}
	if (sale.processamentoOrigem !== "INTERNO") {
		throw new createHttpError.BadRequest("Somente vendas internas podem ser corrigidas neste quadro.");
	}

	return sale;
}

async function patchDelivery({
	organization,
	saleId,
	entrega,
}: {
	organization: TOrganizationEntity;
	saleId: string;
	entrega: PatchSaleFulfillmentEntregaInput;
}) {
	const sale = await loadCorrectableSale(organization.id, saleId);

	if (entrega.modalidade === "ENTREGA" && !sale.clienteId) {
		throw new createHttpError.BadRequest("Entrega exige cliente vinculado.");
	}

	const comandaNumero = entrega.modalidade === "COMANDA" ? entrega.comandaNumero?.trim() || null : null;
	if (entrega.modalidade === "COMANDA" && !comandaNumero) {
		throw new createHttpError.BadRequest("Informe o número da comanda.");
	}

	const modalidadeChanged = sale.entregaModalidade !== entrega.modalidade;

	await db.transaction(async (tx) => {
		await tx
			.select({ id: sales.id })
			.from(sales)
			.where(and(eq(sales.id, saleId), eq(sales.organizacaoId, organization.id)))
			.for("update");
		const redemptions = await tx.query.couponRedemptions.findMany({
			where: (fields, { and, eq }) => and(eq(fields.vendaId, saleId), eq(fields.organizacaoId, organization.id), eq(fields.status, "UTILIZADO")),
		});
		for (const redemption of redemptions) {
			const issue = getCouponCheckoutConditionIssue(readCouponCheckoutConditions(redemption.beneficioSnapshot), {
				entregaModalidade: entrega.modalidade,
				comprasAnterioresConfirmadas: 0,
			});
			if (issue) throw new createHttpError.BadRequest(`${issue} Remova o cupom na edição da venda antes de alterar a modalidade.`);
		}
		await tx
			.update(sales)
			.set({
				entregaModalidade: entrega.modalidade,
				comandaNumero,
				entregaLocalizacaoId: entrega.modalidade === "ENTREGA" ? sale.entregaLocalizacaoId : null,
			})
			.where(eq(sales.id, saleId));
	});

	const updated = await loadCorrectableSale(organization.id, saleId);
	return {
		card: mapSaleRowToFulfillmentCard(updated),
		message: modalidadeChanged ? "Modalidade de entrega atualizada." : "Comanda atualizada.",
	};
}

/**
 * Conta financeira de um pagamento corrigido na expedição.
 *
 * Quando o método não muda, a conta atual é a verdade: ela pode ter sido escolhida pelo operador no
 * PDV, e sobrescrevê-la com a padrão do método seria perder o dado sem que ninguém pedisse. Quando o
 * método muda, a conta antiga pertencia a outro método e a padrão do novo prevalece — mantendo a
 * conta atual como último recurso para métodos sem padrão configurado.
 */
export function resolvePatchedFinancialAccountId({
	escolhaExplicita,
	contaResolvida,
	contaAtual,
	metodoInalterado,
}: {
	escolhaExplicita: string | null;
	contaResolvida: string | null;
	contaAtual: string | null;
	metodoInalterado: boolean;
}): string | null {
	if (escolhaExplicita) return contaResolvida;
	if (metodoInalterado) return contaAtual;
	return contaResolvida ?? contaAtual;
}

async function patchPayment({
	organization,
	saleId,
	payment,
}: {
	organization: TOrganizationEntity;
	saleId: string;
	payment: PatchSaleFulfillmentPagamentoInput;
}) {
	const sale = await loadCorrectableSale(organization.id, saleId);

	// Documento fiscal vivo é um snapshot dos valores E do pagamento da venda: trocar o método
	// depois da emissão dessincronizaria o bloco `pagamento` da nota autorizada.
	if (saleHasLiveFiscalDocument(sale.documentosFiscais)) {
		throw new createHttpError.BadRequest("A venda possui documento fiscal emitido. Cancele o documento antes de alterar o pagamento.");
	}

	const rawTransactions: SalePaymentTransactionInput[] = sale.lancamentosContabeis.flatMap((entry) =>
		entry.transacoesFinanceiras.map((transaction) => ({
			...transaction,
			lancamentoContabilId: entry.id,
		})),
	);

	const classification = classifySalePaymentTransactions(rawTransactions);
	const target = classification.todas.find((p) => p.id === payment.transacaoId);
	if (!target) {
		throw new createHttpError.NotFound("Transação não encontrada nesta venda.");
	}
	if (!target.editavel) {
		throw new createHttpError.BadRequest(target.motivoNaoEditavel ?? "Esta transação não pode ser alterada.");
	}

	const sourceTransaction = sale.lancamentosContabeis
		.flatMap((entry) => entry.transacoesFinanceiras)
		.find((transaction) => transaction.id === payment.transacaoId);
	if (!sourceTransaction) {
		throw new createHttpError.NotFound("Transação não encontrada nesta venda.");
	}

	// Valida método habilitado e, quando informada, a conta escolhida (posse + conta ativa).
	const [resolvedPayment] = await resolvePaymentFinancialAccounts({
		organization,
		payments: [
			{
				metodo: payment.metodo,
				valor: sourceTransaction.valor,
				efetivacaoTipo: "IMEDIATA",
				contaFinanceiraId: payment.contaFinanceiraId ?? null,
			},
		],
	});

	const contaFinanceiraId = resolvePatchedFinancialAccountId({
		escolhaExplicita: payment.contaFinanceiraId ?? null,
		contaResolvida: resolvedPayment.contaFinanceiraId ?? null,
		contaAtual: sourceTransaction.contaFinanceiraId,
		metodoInalterado: sourceTransaction.metodo === payment.metodo,
	});

	const observacoes = extractPaymentObservacoesFromTitle(sourceTransaction.titulo);

	await db
		.update(financialTransactions)
		.set({
			metodo: payment.metodo,
			contaFinanceiraId,
			titulo: buildPaymentTransactionTitle(payment.metodo, observacoes),
		})
		.where(and(eq(financialTransactions.id, payment.transacaoId), eq(financialTransactions.organizacaoId, organization.id)));

	const updated = await loadCorrectableSale(organization.id, saleId);
	return {
		card: mapSaleRowToFulfillmentCard(updated),
		message: "Pagamento atualizado.",
	};
}

export async function processSaleFulfillmentCorrection(input: ProcessSaleFulfillmentCorrectionInput) {
	if ("entrega" in input) {
		return patchDelivery({
			organization: input.organization,
			saleId: input.saleId,
			entrega: input.entrega,
		});
	}

	return patchPayment({
		organization: input.organization,
		saleId: input.saleId,
		payment: input.pagamento,
	});
}

export type TProcessSaleFulfillmentCorrectionOutput = Awaited<ReturnType<typeof processSaleFulfillmentCorrection>>;
