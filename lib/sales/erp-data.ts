import type { TFiscalDocumentLifecycleStatusEnum, TFiscalDocumentTypeEnum, TPaymentMethodEnum } from "@/schemas/enums";
import { db } from "@/services/drizzle";

export type TSaleErpTransaction = {
	id: string;
	/** Lançamento que originou a transação: chave de agrupamento das parcelas. */
	lancamentoContabilId: string;
	valor: number;
	tipo: string;
	metodo: TPaymentMethodEnum;
	parcela: number | null;
	totalParcelas: number | null;
	dataEfetivacao: Date | null;
	dataPrevisao: Date | null;
	provedorStatus: string | null;
};

export type TSaleErpFiscalDocument = {
	vendaId: string | null;
	tipo: TFiscalDocumentTypeEnum;
	statusInterno: TFiscalDocumentLifecycleStatusEnum;
	numero: string | null;
	serie: string | null;
	chaveAcesso: string | null;
	dataAutorizacao: Date | null;
	dataCancelamento: Date | null;
	dataInsercao: Date;
};

/**
 * Dados de ERP (recebimentos e documentos fiscais) de um lote de vendas, agrupados por venda.
 *
 * Duas consultas agregadas sobre os IDs do lote (ambas atendidas pelos índices de `venda_id`),
 * em vez de engordar a consulta relacional principal com LATERAL joins por venda. Alimenta os
 * chips do histórico (`getSalesErpSummaries`) e as colunas de ERP da exportação, que derivam
 * apresentações diferentes das mesmas transações e dos mesmos documentos.
 */
export async function loadSalesErpData({ orgId, saleIds }: { orgId: string; saleIds: string[] }) {
	const transactionsBySaleId = new Map<string, TSaleErpTransaction[]>();
	const fiscalDocsBySaleId = new Map<string, TSaleErpFiscalDocument[]>();
	if (saleIds.length === 0) return { transactionsBySaleId, fiscalDocsBySaleId };

	const [entries, fiscalDocs] = await Promise.all([
		db.query.accountingEntries.findMany({
			where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, orgId), inArray(fields.vendaId, saleIds)),
			columns: { id: true, vendaId: true },
			with: {
				transacoesFinanceiras: {
					columns: {
						id: true,
						valor: true,
						tipo: true,
						metodo: true,
						parcela: true,
						totalParcelas: true,
						dataEfetivacao: true,
						dataPrevisao: true,
						provedorStatus: true,
					},
				},
			},
		}),
		db.query.fiscalOutboundDocuments.findMany({
			where: (fields, { and, eq, inArray }) => and(eq(fields.organizacaoId, orgId), inArray(fields.vendaId, saleIds)),
			columns: {
				vendaId: true,
				tipo: true,
				statusInterno: true,
				numero: true,
				serie: true,
				chaveAcesso: true,
				dataAutorizacao: true,
				dataCancelamento: true,
				dataInsercao: true,
			},
			orderBy: (fields, { asc }) => asc(fields.dataInsercao),
		}),
	]);

	for (const entry of entries) {
		if (!entry.vendaId) continue;
		const existing = transactionsBySaleId.get(entry.vendaId) ?? [];
		transactionsBySaleId.set(
			entry.vendaId,
			// `lancamentoContabilId` é o que `classifySalePaymentTransactions` usa para agrupar parcelas.
			existing.concat(entry.transacoesFinanceiras.map((transaction) => ({ ...transaction, lancamentoContabilId: entry.id }))),
		);
	}
	for (const doc of fiscalDocs) {
		if (!doc.vendaId) continue;
		const existing = fiscalDocsBySaleId.get(doc.vendaId) ?? [];
		existing.push(doc);
		fiscalDocsBySaleId.set(doc.vendaId, existing);
	}

	return { transactionsBySaleId, fiscalDocsBySaleId };
}
