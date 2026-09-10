import { isManagedFulfillmentSaleModel } from "@/lib/sales/fulfillment-channels/policy";
import { resolveSaleEditability } from "@/lib/sales/sale-editability";
import { classifySalePaymentTransactions, extractPaymentObservacoesFromTitle, type SalePaymentTransactionInput } from "@/lib/sales/utils";
import { computeSaleFinancialStatus, computeSaleFiscalStatus, mapInternalFiscalStatus } from "@/lib/sales/utils";
import type { TIntegrationTipoEnum, TSaleAttendanceStatusEnum } from "@/schemas/enums";

type SaleFulfillmentRow = {
	id: string;
	idExterno: string;
	valorTotal: number;
	statusVenda: string | null;
	statusAtendimento: TSaleAttendanceStatusEnum;
	entregaModalidade: string | null;
	comandaNumero: string | null;
	clienteId: string | null;
	observacoes: string | null;
	dataVenda: Date | null;
	/** Momento em que o `statusAtendimento` atual passou a valer. Ver schema de `sales`. */
	statusAtendimentoData?: Date | null;
	modelo?: string | null;
	processamentoOrigem?: string | null;
	tabId?: string | null;
	integracao?: { tipo: TIntegrationTipoEnum; apelido: string | null } | null;
	cliente: { id: string; nome: string; telefone: string | null } | null;
	documentosFiscais: { id?: string; statusInterno: string | null; documentoOrigemId?: string | null; dataInsercao: Date }[];
	lancamentosContabeis: {
		id: string;
		transacoesFinanceiras: {
			id: string;
			lancamentoContabilId?: string;
			titulo: string;
			valor: number;
			tipo: string;
			metodo: SalePaymentTransactionInput["metodo"];
			contaFinanceiraId: string | null;
			parcela: number | null;
			totalParcelas: number | null;
			dataEfetivacao: Date | null;
			dataPrevisao: Date;
			provedorStatus: string | null;
		}[];
	}[];
};

/**
 * Documento que responde pelo status fiscal derivado da venda: o mais recente entre os que mapeiam
 * para esse status. É o alvo do popover do chip fiscal no card (abrir, baixar, resolver problema).
 */
function resolveFiscalStatusDocumentId(
	documents: SaleFulfillmentRow["documentosFiscais"],
	derivedStatus: ReturnType<typeof computeSaleFiscalStatus>,
) {
	const match = [...documents]
		.sort((a, b) => b.dataInsercao.getTime() - a.dataInsercao.getTime())
		.find((document) => mapInternalFiscalStatus(document.statusInterno) === derivedStatus);
	return match?.id ?? null;
}

export function mapSaleRowToFulfillmentCard(sale: SaleFulfillmentRow) {
	const now = new Date();
	const fiscal = computeSaleFiscalStatus({ documents: sale.documentosFiscais });
	const rawTransactions: SalePaymentTransactionInput[] = sale.lancamentosContabeis.flatMap((entry) =>
		entry.transacoesFinanceiras.map((transaction) => ({
			...transaction,
			lancamentoContabilId: transaction.lancamentoContabilId ?? entry.id,
		})),
	);
	const classification = classifySalePaymentTransactions(rawTransactions);
	const paymentNotes =
		rawTransactions.map((transaction) => extractPaymentObservacoesFromTitle(transaction.titulo)).find((note) => note != null) ?? null;

	return {
		id: sale.id,
		idExterno: sale.idExterno,
		valorTotal: sale.valorTotal,
		statusVenda: sale.statusVenda,
		statusAtendimento: sale.statusAtendimento,
		// Canal de fulfillment gerenciado (ex.: iFood). Null = venda interna/fluxo local puro.
		integracaoCanal: sale.processamentoOrigem === "EXTERNO" && isManagedFulfillmentSaleModel(sale.modelo) ? ("IFOOD" as const) : null,
		integracao: sale.integracao ?? null,
		entregaModalidade: sale.entregaModalidade,
		comandaNumero: sale.comandaNumero,
		clienteId: sale.clienteId,
		observacoes: sale.observacoes,
		dataVenda: sale.dataVenda,
		// Momento da etapa atual. Numa venda entregue e a hora da entrega (ENTREGUE e terminal), e e
		// o que o quadro mostra nos concluidos recentes: `dataVenda` ali seria a hora errada.
		statusAtendimentoData: sale.statusAtendimentoData ?? null,
		cliente: sale.cliente,
		financeiro: computeSaleFinancialStatus({
			transactions: rawTransactions.map((transaction) => ({
				valor: transaction.valor,
				tipo: transaction.tipo,
				dataEfetivacao: transaction.dataEfetivacao ?? null,
				dataPrevisao: transaction.dataPrevisao ?? null,
				provedorStatus: transaction.provedorStatus,
			})),
			saleTotal: sale.valorTotal,
			now,
		}),
		pagamentos: classification.todas,
		resumoPagamentos: classification.resumo,
		pagamentoObservacoes: paymentNotes === sale.observacoes ? null : paymentNotes,
		fiscal,
		documentoFiscalId: resolveFiscalStatusDocumentId(sale.documentosFiscais, fiscal),
		editabilidade: resolveSaleEditability({
			statusVenda: sale.statusVenda,
			statusAtendimento: sale.statusAtendimento,
			processamentoOrigem: sale.processamentoOrigem ?? null,
			tabId: sale.tabId ?? null,
			valorTotal: sale.valorTotal,
			documentosFiscais: sale.documentosFiscais,
			transacoes: rawTransactions.map((transaction) => ({
				valor: transaction.valor,
				tipo: transaction.tipo,
				dataEfetivacao: transaction.dataEfetivacao ?? null,
				provedorStatus: transaction.provedorStatus,
			})),
		}),
	};
}

export type TSaleFulfillmentCardMapped = ReturnType<typeof mapSaleRowToFulfillmentCard>;
