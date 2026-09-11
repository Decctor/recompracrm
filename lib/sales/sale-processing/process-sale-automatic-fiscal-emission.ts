import { getErrorMessage } from "@/lib/errors";
import { resolveAutoEmissionException } from "@/lib/fiscal/auto-emission-policy";
import { enqueueFiscalDocument } from "@/lib/fiscal/documents";
import { resolveEmissionDocumentType } from "@/lib/fiscal/document-type";
import { notifyFiscalEmissionFailure } from "@/lib/fiscal/notifications";
import { isManagedFulfillmentSaleModel } from "@/lib/sales/fulfillment-channels/policy";
import { db } from "@/services/drizzle";
import type { TOrganizationEntity } from "@/services/drizzle/schema";
import createHttpError from "http-errors";
import { getSaleFinancialState } from "./get-sale-financial-state";

/**
 * Trava de rollout da fase 5 (C5): enquanto o tratamento fiscal de pedidos com benefits
 * patrocinados (pagamento VALE reconstruído) e frete próprio (vFrete) não for validado com
 * pedidos reais na homologação, a emissão AUTOMÁTICA desses casos é pulada — a emissão manual
 * continua disponível (e já usa o tratamento novo). Vire para false após a validação.
 */
const MANAGED_CHANNEL_STRICT_AUTO_EMISSION = true;

/**
 * Canal gerenciado (ex.: iFood): no modelo clearing os pagamentos online já entram efetivados na
 * conta do canal, então `dataEfetivacao` basta. O caso AGUARDANDO_REPASSE é LEGADO — vendas
 * importadas antes do modelo clearing (até o backfill `backfill-settle-managed-channel-receivables`
 * rodar) — e conta como pago: a pendência era loja↔canal, não do consumidor.
 */
function isManagedSaleCustomerPaid({
	financialState,
	saleTotal,
}: {
	financialState: Awaited<ReturnType<typeof getSaleFinancialState>>;
	saleTotal: number;
}) {
	const customerPaidTotal = financialState.transactions
		.filter(
			(transaction) =>
				transaction.tipo === "ENTRADA" &&
				!["CANCELADO", "ESTORNADO"].includes(transaction.provedorStatus ?? "") &&
				(transaction.dataEfetivacao != null || transaction.provedorStatus === "AGUARDANDO_REPASSE"),
		)
		.reduce((sum, transaction) => sum + transaction.valor, 0);
	return customerPaidTotal + 0.01 >= saleTotal;
}

export async function processSaleAutomaticFiscalEmissionIfEligible({
	organization,
	saleId,
	authorId,
}: {
	organization: TOrganizationEntity;
	saleId: string;
	authorId?: string | null;
}) {
	const [sale, financialState] = await Promise.all([
		db.query.sales.findFirst({
			where: (fields, { and, eq }) => and(eq(fields.id, saleId), eq(fields.organizacaoId, organization.id)),
			with: {
				cliente: { columns: { cpfCnpj: true } },
				documentosFiscais: { columns: { id: true, statusInterno: true } },
				lancamentosContabeis: { columns: { id: true } },
			},
		}),
		getSaleFinancialState({ organizationId: organization.id, saleId }),
	]);

	if (!sale) throw new createHttpError.NotFound("Venda não encontrada.");

	// Override por venda (tri-state): null herda a preferência da organização; true/false é decisão explícita.
	const emissaoAutomaticaEfetiva = sale.emissaoFiscalAutomatica ?? organization.fiscalEmissaoAutomatica;
	if (!emissaoAutomaticaEfetiva) return { status: "NAO_SOLICITADO" as const, reason: "EMISSAO_AUTOMATICA_DESATIVADA" as const };

	// Exceções valem só quando a venda herda a preferência — override explícito (true) força a emissão.
	if (sale.emissaoFiscalAutomatica == null) {
		const metodos = financialState.transactions
			.filter(
				(transaction) =>
					transaction.tipo === "ENTRADA" && !["CANCELADO", "ESTORNADO"].includes(transaction.provedorStatus ?? "") && transaction.valor > 0,
			)
			.map((transaction) => transaction.metodo);
		const exception = resolveAutoEmissionException({ metodos, excecoes: organization.fiscalConfiguracao?.emissaoAutomatica?.excecoes });
		if (exception) return { status: "NAO_SOLICITADO" as const, reason: exception };
	}

	const isManagedSale = sale.processamentoOrigem === "EXTERNO" && isManagedFulfillmentSaleModel(sale.modelo);
	const isPaidForFiscal = financialState.isFullyPaid || (isManagedSale && isManagedSaleCustomerPaid({ financialState, saleTotal: sale.valorTotal }));
	if (sale.statusVenda !== "CONFIRMADA" || sale.statusAtendimento !== "ENTREGUE" || !isPaidForFiscal) {
		return { status: "NAO_SOLICITADO" as const, reason: "VENDA_NAO_ELEGIVEL" as const };
	}
	if (sale.documentosFiscais.some((document) => !["CANCELADO", "INUTILIZADO"].includes(document.statusInterno ?? ""))) {
		return { status: "NAO_SOLICITADO" as const, reason: "DOCUMENTO_EXISTENTE" as const };
	}

	if (isManagedSale && MANAGED_CHANNEL_STRICT_AUTO_EMISSION) {
		const integracaoMetadados = sale.integracaoMetadados;
		const sponsoredTotal = integracaoMetadados?.descontos.patrocinados.reduce((sum, sponsored) => sum + sponsored.valor, 0) ?? 0;
		const ownFreight = integracaoMetadados?.entrega.realizadaPor === "LOJA" ? integracaoMetadados.entrega.valorFrete : 0;
		if (sponsoredTotal > 0 || ownFreight > 0) {
			console.log(
				`[PROCESS_SALE_AUTOMATIC_FISCAL_EMISSION] Emissão automática pulada para venda gerenciada ${saleId} (patrocinado=${sponsoredTotal.toFixed(2)}, frete próprio=${ownFreight.toFixed(2)}) — emitir manualmente até a validação do tratamento.`,
			);
			return { status: "NAO_SOLICITADO" as const, reason: "CANAL_PENDENTE_VALIDACAO_FISCAL" as const };
		}
	}

	const accountingEntryId = sale.lancamentosContabeis[0]?.id;
	if (!accountingEntryId) throw new createHttpError.BadRequest("Lançamento contábil da venda não encontrado.");

	try {
		const tipoDocumento = await resolveEmissionDocumentType({
			organizacaoId: organization.id,
			operacaoPadraoNfeId: organization.fiscalConfiguracao?.operacaoPadraoPorTipo?.NFE ?? null,
			signals: {
				canal: sale.canal,
				entregaModalidade: sale.entregaModalidade,
				destinatarioCpfCnpj: sale.cliente?.cpfCnpj,
			},
		});
		const enqueued = await enqueueFiscalDocument({
			vendaId: saleId,
			tipo: tipoDocumento,
			organizacaoId: organization.id,
			lancamentoContabilId: accountingEntryId,
			autorId: authorId ?? null,
			origem: "AUTOMATICA",
		});
		return { status: "SOLICITADO" as const, documentoId: enqueued.documentoId, statusInterno: enqueued.statusInterno };
	} catch (error) {
		console.error("[PROCESS_SALE_AUTOMATIC_FISCAL_EMISSION] Error emitting fiscal document", error);
		const errorMessage = getErrorMessage(error);
		await notifyFiscalEmissionFailure({ organization, sale, errorMessage });
		return { status: "ERRO" as const, error: errorMessage };
	}
}
