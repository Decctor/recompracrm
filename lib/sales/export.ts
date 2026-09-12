"use client";

import type { TGetSalesExportInput, TGetSalesExportOutput, TSaleExportEntry } from "@/app/api/sales/export/route";
import { DELIVERY_MODE_META } from "@/app/dashboard/sales/_components/fulfillment/config";
import { usePaginatedExport, type UsePaginatedExportReturn } from "@/lib/exportations/use-paginated-export";
import { formatDateAsLocale, formatToCPForCNPJ, formatToMoney, formatToPhone } from "@/lib/formatting";
import { buildSalesSearchParams } from "@/lib/queries/sales";
import { SALE_FINANCIAL_STATUS_PRESENTATION, SALE_FISCAL_STATUS_PRESENTATION, SALE_STATUS_LABELS } from "@/lib/sales/status-presentation";
import { FISCAL_DOCUMENT_TYPE_LABELS } from "@/lib/sales/export-summaries";
import axios from "axios";
import { useCallback } from "react";

export type SalesExportParams = Omit<TGetSalesExportInput, "page">;

/**
 * Colunas da planilha. As de ERP são opcionais de propósito: uma organização sem o módulo não
 * ganha colunas vazias, e sem a permissão fiscal o membro não ganha as colunas fiscais — a
 * planilha espelha o que a tela mostra para aquele usuário.
 */
export type SaleExportRow = {
	ID: string;
	"DATA DA VENDA": string;
	STATUS: string;
	ORIGEM: string;
	CANAL: string;
	VENDEDOR: string;
	PARCEIRO: string;
	"MODALIDADE DE ENTREGA": string;
	COMANDA: string;
	CLIENTE: string;
	TELEFONE: string;
	"CPF/CNPJ": string;
	"VALOR TOTAL": string;
	DESCONTOS: string;
	ACRÉSCIMOS: string;
	"Nº DE ITENS": number;
	COMPOSIÇÃO: string;
	OBSERVAÇÕES: string;
	"STATUS FINANCEIRO"?: string;
	PAGAMENTOS?: string;
	"VALOR RECEBIDO"?: string;
	"STATUS FISCAL"?: string;
	"DOCUMENTO FISCAL"?: string;
	"CHAVE DE ACESSO"?: string;
};

export type UseSalesExportReturn = UsePaginatedExportReturn<SaleExportRow>;

async function fetchSalesExportPage(input: TGetSalesExportInput) {
	const searchParams = buildSalesSearchParams({ ...input, clientId: null });
	const { data } = await axios.get<TGetSalesExportOutput>(`/api/sales/export?${searchParams.toString()}`);
	return data.data;
}

function formatOptionalMoney(value: number | null | undefined) {
	return value === null || value === undefined ? "" : formatToMoney(value);
}

function formatSaleForExport(sale: TSaleExportEntry): SaleExportRow {
	const row: SaleExportRow = {
		ID: sale.id,
		"DATA DA VENDA": sale.dataVenda ? (formatDateAsLocale(sale.dataVenda, true) ?? "") : "",
		STATUS: sale.statusVenda ? SALE_STATUS_LABELS[sale.statusVenda] : "",
		ORIGEM: sale.integracao ? sale.integracao.apelido || sale.integracao.tipo : "Interna",
		CANAL: sale.canal ?? "",
		VENDEDOR: sale.vendedorNome,
		PARCEIRO: sale.parceiro,
		"MODALIDADE DE ENTREGA": sale.entregaModalidade ? (DELIVERY_MODE_META[sale.entregaModalidade]?.label ?? sale.entregaModalidade) : "",
		COMANDA: sale.comandaNumero ?? "",
		CLIENTE: sale.cliente?.nome ?? "",
		TELEFONE: sale.cliente?.telefone ? formatToPhone(sale.cliente.telefone) : "",
		"CPF/CNPJ": sale.cliente?.cpfCnpj ? formatToCPForCNPJ(sale.cliente.cpfCnpj) : "",
		"VALOR TOTAL": formatToMoney(sale.valorTotal),
		DESCONTOS: formatOptionalMoney(sale.descontosTotal),
		ACRÉSCIMOS: formatOptionalMoney(sale.acrescimosTotal),
		"Nº DE ITENS": sale.itensQuantidade,
		COMPOSIÇÃO: sale.composicaoResumo,
		OBSERVAÇÕES: sale.observacoes ?? "",
	};

	if (sale.erp) {
		row["STATUS FINANCEIRO"] = SALE_FINANCIAL_STATUS_PRESENTATION[sale.erp.financeiro.status].label;
		row.PAGAMENTOS = sale.erp.financeiro.pagamentosResumo;
		row["VALOR RECEBIDO"] = formatToMoney(sale.erp.financeiro.valorRecebido);
		if (sale.erp.fiscal) {
			const documento = sale.erp.fiscal.documentoPrincipal;
			row["STATUS FISCAL"] = SALE_FISCAL_STATUS_PRESENTATION[sale.erp.fiscal.status].label;
			row["DOCUMENTO FISCAL"] = sale.erp.fiscal.documentosResumo;
			row["CHAVE DE ACESSO"] = documento?.chaveAcesso ?? "";
			// Sem chave (nota ainda não autorizada), o tipo e o número já identificam o documento.
			if (!row["CHAVE DE ACESSO"] && documento?.numero) {
				row["CHAVE DE ACESSO"] =
					`${FISCAL_DOCUMENT_TYPE_LABELS[documento.tipo as keyof typeof FISCAL_DOCUMENT_TYPE_LABELS] ?? documento.tipo} Nº ${documento.numero}`;
			}
		}
	}

	return row;
}

export function useSalesExport({ params }: { params: SalesExportParams }): UseSalesExportReturn {
	const fetchPage = useCallback(
		async (page: number) => {
			const result = await fetchSalesExportPage({ ...params, page });
			return {
				rows: result.sales.map(formatSaleForExport),
				totalPages: result.totalPages,
				totalMatched: result.salesMatched,
			};
		},
		[params],
	);

	return usePaginatedExport({ fetchPage, sheetName: "Vendas", fileNamePrefix: "vendas", errorMessage: "Falha ao exportar vendas." });
}
