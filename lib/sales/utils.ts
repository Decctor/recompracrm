import type { TSaleFinancialDerivedStatusEnum, TSaleFiscalDerivedStatusEnum, TPaymentMethodEnum } from "@/schemas/enums";

/**
 * Status financeiro e fiscal DERIVADOS de uma venda.
 *
 * Estes status NAO sao persistidos em `sales`. O financeiro e calculado a partir das
 * `financialTransactions` ligadas aos `accountingEntries` da venda; o fiscal e calculado a
 * partir dos `fiscalOutboundDocuments` da venda. Sao apenas apresentacionais/derivados.
 */

type FinancialTransactionLike = {
	valor: number;
	tipo?: "ENTRADA" | "SAIDA" | string | null;
	dataEfetivacao: Date | string | null;
	dataPrevisao: Date | string | null;
	provedorStatus?: string | null;
};

/**
 * Calcula o status financeiro derivado de uma venda a partir de suas transacoes financeiras.
 *
 * Regras:
 * - sem transacoes: NAO_GERADO (a venda nao gerou movimentacao financeira na plataforma);
 * - soma efetivada >= total da venda: RECEBIDA;
 * - alguma efetivacao porem abaixo do total: PARCIALMENTE_RECEBIDA;
 * - nada efetivado e existe transacao vencida (dataPrevisao < agora): EM_ATRASO;
 * - caso contrario: PENDENTE.
 */
export function computeSaleFinancialStatus({
	transactions,
	saleTotal,
	now = new Date(),
}: {
	transactions: FinancialTransactionLike[];
	saleTotal: number;
	now?: Date;
}): TSaleFinancialDerivedStatusEnum {
	if (saleTotal <= 0) return "RECEBIDA";

	// Considera apenas entradas (recebimentos) quando o tipo estiver disponivel.
	const relevant = transactions.filter((t) => (t.tipo ? t.tipo === "ENTRADA" : true) && !["CANCELADO", "ESTORNADO"].includes(t.provedorStatus ?? ""));
	if (relevant.length === 0) return "NAO_GERADO";

	const settledTotal = relevant.filter((t) => t.dataEfetivacao != null).reduce((acc, t) => acc + (t.valor ?? 0), 0);

	if (settledTotal >= saleTotal && saleTotal > 0) return "RECEBIDA";
	if (settledTotal > 0) return "PARCIALMENTE_RECEBIDA";

	const hasOverdue = relevant.some((t) => {
		if (t.dataEfetivacao != null) return false;
		if (!t.dataPrevisao) return false;
		const previsao = t.dataPrevisao instanceof Date ? t.dataPrevisao : new Date(t.dataPrevisao);
		return previsao.getTime() < now.getTime();
	});
	if (hasOverdue) return "EM_ATRASO";

	return "PENDENTE";
}

type FiscalDocumentLike = {
	statusInterno: string | null;
	dataInsercao?: Date | string | null;
};

// Prioridade de exibicao: um documento autorizado domina, depois processamento, depois erros, etc.
const FISCAL_STATUS_PRIORITY: TSaleFiscalDerivedStatusEnum[] = [
	"AUTORIZADO",
	"EM_PROCESSAMENTO",
	"PENDENTE",
	"REJEITADO",
	"ERRO",
	"CANCELADO",
	"INUTILIZADO",
];

/**
 * Traduz o status de ciclo de vida de UM documento (`fiscal_outbound_documents.status_interno`)
 * para o status derivado da venda. Exportado para que a apresentacao de um documento isolado use
 * exatamente a mesma tabela que `computeSaleFiscalStatus` — os dois nunca podem discordar.
 */
export function mapInternalFiscalStatus(statusInterno: string | null): TSaleFiscalDerivedStatusEnum | null {
	switch (statusInterno) {
		case "AUTORIZADO":
			return "AUTORIZADO";
		case "EM_PROCESSAMENTO":
		case "CANCELAMENTO_PENDENTE":
			return "EM_PROCESSAMENTO";
		case "RASCUNHO":
		case "PRONTO_PARA_ENVIO":
			return "PENDENTE";
		case "REJEITADO":
			return "REJEITADO";
		case "ERRO":
			return "ERRO";
		case "CANCELADO":
			return "CANCELADO";
		case "INUTILIZADO":
			return "INUTILIZADO";
		default:
			return null;
	}
}

/**
 * Calcula o badge fiscal derivado de uma venda a partir dos seus documentos fiscais.
 *
 * - sem documentos: NAO_EMITIDO;
 * - caso contrario, escolhe o status de maior prioridade entre os documentos.
 */
export function computeSaleFiscalStatus({ documents }: { documents: FiscalDocumentLike[] }): TSaleFiscalDerivedStatusEnum {
	if (documents.length === 0) return "NAO_EMITIDO";

	const mapped = documents.map((d) => mapInternalFiscalStatus(d.statusInterno)).filter((s): s is TSaleFiscalDerivedStatusEnum => s !== null);
	if (mapped.length === 0) return "PENDENTE";

	for (const status of FISCAL_STATUS_PRIORITY) {
		if (mapped.includes(status)) return status;
	}
	return "PENDENTE";
}

const NON_EDITABLE_PAYMENT_STATUSES = new Set(["CANCELADO", "ESTORNADO"]);

export type SalePaymentTransactionInput = {
	id: string;
	lancamentoContabilId: string;
	titulo?: string | null;
	valor: number;
	tipo?: string | null;
	metodo: TPaymentMethodEnum;
	parcela?: number | null;
	totalParcelas?: number | null;
	dataEfetivacao?: Date | string | null;
	dataPrevisao?: Date | string | null;
	provedorStatus?: string | null;
	contaFinanceiraId?: string | null;
	modificadoresMetadata?: { origem?: string | null } | null;
};

export type ClassifiedPayment = {
	id: string;
	lancamentoContabilId: string;
	metodo: TPaymentMethodEnum;
	valor: number;
	parcela: number | null;
	totalParcelas: number | null;
	dataEfetivacao: Date | string | null;
	dataPrevisao: Date | string | null;
	provedorStatus: string | null;
	editavel: boolean;
	motivoNaoEditavel: string | null;
	grupoParcelasId: string | null;
	contaFinanceiraId: string | null;
};

export type PaymentClassification = {
	todas: ClassifiedPayment[];
	editaveis: ClassifiedPayment[];
	efetivadas: ClassifiedPayment[];
	gruposParcelas: Record<string, ClassifiedPayment[]>;
	resumo: {
		totalEditaveis: number;
		totalPendentes: number;
		totalEfetivadas: number;
	};
};

export function toDateOrNull(value: Date | string | null | undefined): Date | null {
	if (value == null) return null;
	const parsed = value instanceof Date ? value : new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getPaymentNonEditableReason(transaction: SalePaymentTransactionInput): string | null {
	if (transaction.tipo && transaction.tipo !== "ENTRADA") {
		return "Somente recebimentos podem ser alterados aqui.";
	}
	if (toDateOrNull(transaction.dataEfetivacao) != null) {
		return "Pagamento já recebido.";
	}
	if (NON_EDITABLE_PAYMENT_STATUSES.has(transaction.provedorStatus ?? "")) {
		return "Transação cancelada ou estornada.";
	}
	if (transaction.metodo === "CASHBACK") {
		return "Resgate de cashback não pode ser alterado aqui.";
	}
	return null;
}

export function isPaymentTransactionEditable(transaction: SalePaymentTransactionInput): boolean {
	return getPaymentNonEditableReason(transaction) == null;
}

export function isPaymentOverdue(payment: Pick<ClassifiedPayment, "dataEfetivacao" | "dataPrevisao" | "provedorStatus">, now = new Date()): boolean {
	if (toDateOrNull(payment.dataEfetivacao) != null) return false;
	if (NON_EDITABLE_PAYMENT_STATUSES.has(payment.provedorStatus ?? "")) return false;
	const previsao = toDateOrNull(payment.dataPrevisao);
	if (!previsao) return false;
	return previsao.getTime() < now.getTime();
}

function resolveInstallmentGroupId(transaction: SalePaymentTransactionInput): string | null {
	if (!transaction.totalParcelas || transaction.totalParcelas <= 1) return null;
	return `${transaction.lancamentoContabilId}:${transaction.metodo}:${transaction.totalParcelas}`;
}

export function classifySalePaymentTransactions(transactions: SalePaymentTransactionInput[]): PaymentClassification {
	// So recebimentos entram na classificacao. Uma venda pode ter transacoes de SAIDA vinculadas
	// (ex.: taxas de canal gerenciado lancadas contra a mesma venda) e elas nao sao pagamentos do
	// cliente — listar uma delas no cupom ou no resumo contaria despesa como recebimento.
	const recebimentos = transactions.filter((transaction) => (transaction.tipo ? transaction.tipo === "ENTRADA" : true));
	const todas: ClassifiedPayment[] = recebimentos.map((transaction) => {
		const motivoNaoEditavel = getPaymentNonEditableReason(transaction);
		return {
			id: transaction.id,
			lancamentoContabilId: transaction.lancamentoContabilId,
			metodo: transaction.metodo,
			valor: transaction.valor,
			parcela: transaction.parcela ?? null,
			totalParcelas: transaction.totalParcelas ?? null,
			dataEfetivacao: toDateOrNull(transaction.dataEfetivacao),
			dataPrevisao: toDateOrNull(transaction.dataPrevisao),
			provedorStatus: transaction.provedorStatus ?? null,
			editavel: motivoNaoEditavel == null,
			motivoNaoEditavel,
			grupoParcelasId: resolveInstallmentGroupId(transaction),
			contaFinanceiraId: transaction.contaFinanceiraId ?? null,
		};
	});

	const editaveis = todas.filter((payment) => payment.editavel);
	const efetivadas = todas.filter((payment) => payment.dataEfetivacao != null);
	const pendentes = todas.filter((payment) => payment.dataEfetivacao == null && !NON_EDITABLE_PAYMENT_STATUSES.has(payment.provedorStatus ?? ""));

	const gruposParcelas: Record<string, ClassifiedPayment[]> = {};
	for (const payment of todas) {
		if (!payment.grupoParcelasId) continue;
		if (!gruposParcelas[payment.grupoParcelasId]) gruposParcelas[payment.grupoParcelasId] = [];
		gruposParcelas[payment.grupoParcelasId].push(payment);
	}

	return {
		todas,
		editaveis,
		efetivadas,
		gruposParcelas,
		resumo: {
			totalEditaveis: editaveis.length,
			totalPendentes: pendentes.length,
			totalEfetivadas: efetivadas.length,
		},
	};
}

export type TSalePaymentGroup = {
	id: string;
	/** Transação mais útil para abrir: a próxima pendente ou, se quitada, a primeira do grupo. */
	transacaoFinanceiraId: string;
	/**
	 * Lançamento contábil que originou as parcelas. Um grupo nunca cruza lançamentos: parcelado
	 * agrupa por `grupoParcelasId`, que já carrega o lançamento na chave, e à vista agrupa por
	 * transação. É por ele que a venda linka para o registro em Financeiro > Lançamentos.
	 */
	lancamentoContabilId: string;
	metodo: TPaymentMethodEnum;
	/** Soma das parcelas do grupo. */
	valor: number;
	/** 1 para pagamento a vista; N para uma compra parcelada. */
	parcelasTotal: number;
	parcelasRecebidas: number;
	valorRecebido: number;
	/** Vencimento da parcela em aberto mais proxima. Null quando tudo ja foi recebido. */
	proximoVencimento: Date | null;
	/** Data da ultima parcela efetivada. Null quando nada foi recebido. */
	ultimoRecebimento: Date | null;
	cancelado: boolean;
	emAtraso: boolean;
};

/**
 * Colapsa as parcelas de um mesmo pagamento numa linha so. Uma venda em 12x tem 12 linhas em
 * `financial_transactions`; a leitura util e "Crédito 12x · 2 de 12 recebidas", nao doze linhas.
 *
 * Agrupa por `grupoParcelasId` quando ele existe e por `id` quando nao — `resolveInstallmentGroupId`
 * devolve null para pagamento a vista, que assim vira um grupo de uma parcela so.
 */
export function groupSalePaymentsByMethod(payments: ClassifiedPayment[], now = new Date()): TSalePaymentGroup[] {
	const groups = new Map<string, ClassifiedPayment[]>();
	for (const payment of payments) {
		const key = payment.grupoParcelasId ?? payment.id;
		const existing = groups.get(key);
		if (existing) existing.push(payment);
		else groups.set(key, [payment]);
	}

	return [...groups.entries()].map(([id, parcelas]) => {
		const efetivadas = parcelas.filter((parcela) => toDateOrNull(parcela.dataEfetivacao) != null);
		const vencimentosEmAberto = parcelas
			.filter((parcela) => toDateOrNull(parcela.dataEfetivacao) == null)
			.map((parcela) => toDateOrNull(parcela.dataPrevisao))
			.filter((data): data is Date => data != null)
			.sort((a, b) => a.getTime() - b.getTime());
		const recebimentos = efetivadas
			.map((parcela) => toDateOrNull(parcela.dataEfetivacao))
			.filter((data): data is Date => data != null)
			.sort((a, b) => b.getTime() - a.getTime());
		const actionableTransaction =
			parcelas
				.filter((parcela) => parcela.dataEfetivacao == null && !NON_EDITABLE_PAYMENT_STATUSES.has(parcela.provedorStatus ?? ""))
				.sort(
					(a, b) =>
						(toDateOrNull(a.dataPrevisao)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (toDateOrNull(b.dataPrevisao)?.getTime() ?? Number.MAX_SAFE_INTEGER),
				)[0] ?? parcelas[0];

		return {
			id,
			transacaoFinanceiraId: actionableTransaction.id,
			lancamentoContabilId: parcelas[0].lancamentoContabilId,
			metodo: parcelas[0].metodo,
			valor: parcelas.reduce((acc, parcela) => acc + parcela.valor, 0),
			// `totalParcelas` e a fonte de verdade: uma venda em 6x cujas parcelas futuras ainda nao
			// foram lancadas deve continuar lendo "6x", e nao o numero de linhas ja existentes.
			parcelasTotal: parcelas[0].totalParcelas ?? parcelas.length,
			parcelasRecebidas: efetivadas.length,
			valorRecebido: efetivadas.reduce((acc, parcela) => acc + parcela.valor, 0),
			proximoVencimento: vencimentosEmAberto[0] ?? null,
			ultimoRecebimento: recebimentos[0] ?? null,
			cancelado: parcelas.every((parcela) => NON_EDITABLE_PAYMENT_STATUSES.has(parcela.provedorStatus ?? "")),
			emAtraso: parcelas.some((parcela) => isPaymentOverdue(parcela, now)),
		};
	});
}

export function buildPaymentTransactionTitle(method: TPaymentMethodEnum, observacoes?: string | null) {
	const base = `Pagamento via ${method}`;
	if (!observacoes?.trim()) return `${base} - Venda`;
	return `${base} - ${observacoes.trim()}`;
}

export function extractPaymentObservacoesFromTitle(titulo: string | null | undefined): string | null {
	if (!titulo?.includes(" - ")) return null;
	const parts = titulo.split(" - ").slice(1);
	const joined = parts.join(" - ").trim();
	if (!joined || joined === "Venda") return null;
	return joined;
}
