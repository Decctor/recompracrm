"use client";

import type { TFiscalDocumentExportEntry, TGetFiscalDocumentsExportOutput } from "@/app/api/fiscal/documents/export/route";
import { DELIVERY_MODE_META } from "@/app/dashboard/sales/_components/fulfillment/config";
import { FISCAL_ENVIRONMENT_LABELS, FISCAL_LIFECYCLE_STATUS_LABELS } from "@/app/dashboard/fiscal/_module/shared/fiscal-labels";
import { usePaginatedExport, type UsePaginatedExportReturn } from "@/lib/exportations/use-paginated-export";
import { buildFiscalDocumentsSearchParams, type TFiscalDocumentsFiltersState } from "@/lib/fiscal/document-filters";
import { formatDateAsLocale, formatToCPForCNPJ } from "@/lib/formatting";
import { FISCAL_DOCUMENT_TYPE_LABELS } from "@/lib/sales/export-summaries";
import axios from "axios";
import { useCallback } from "react";

/**
 * Colunas da planilha de documentos fiscais. Valores saem como número, não como texto "R$": quem
 * abre essa planilha é o contador, e ele soma colunas. Documento sem payload (rascunho, erro de
 * prontidão) deixa as células de tributo vazias — vazio diz "não há dado", 0 diria "não há imposto".
 */
export type FiscalDocumentExportRow = {
	ID: string;
	TIPO: string;
	AMBIENTE: string;
	STATUS: string;
	SÉRIE: string;
	NÚMERO: string;
	"CHAVE DE ACESSO": string;
	PROTOCOLO: string;
	"DATA DE EMISSÃO": string;
	"DATA DE AUTORIZAÇÃO": string;
	"DATA DE CANCELAMENTO": string;
	"DATA DE CRIAÇÃO": string;
	DESTINATÁRIO: string;
	"CPF/CNPJ DESTINATÁRIO": string;
	"CFOP(S)": string;
	"VALOR DA NOTA": number | null;
	"VALOR DOS PRODUTOS": number | null;
	DESCONTO: number | null;
	"BC ICMS": number | null;
	ICMS: number | null;
	"ICMS-ST": number | null;
	FCP: number | null;
	PIS: number | null;
	COFINS: number | null;
	"TRIBUTOS APROXIMADOS": number | null;
	"CHAVE REFERENCIADA": string;
	"CÓDIGO DE REJEIÇÃO": string;
	"ÚLTIMA MENSAGEM": string;
	VENDA: string;
	"DATA DA VENDA": string;
	"VALOR DA VENDA": number | null;
	"MODALIDADE DE ENTREGA": string;
	CLIENTE: string;
};

export type UseFiscalDocumentsExportReturn = UsePaginatedExportReturn<FiscalDocumentExportRow>;

async function fetchFiscalDocumentsExportPage({ filters, page }: { filters: TFiscalDocumentsFiltersState; page: number }) {
	const searchParams = buildFiscalDocumentsSearchParams(filters);
	searchParams.set("page", page.toString());
	const { data } = await axios.get<TGetFiscalDocumentsExportOutput>(`/api/fiscal/documents/export?${searchParams.toString()}`);
	return data.data;
}

function formatOptionalDate(date: string | Date | null | undefined) {
	return date ? (formatDateAsLocale(date, true) ?? "") : "";
}

function formatFiscalDocumentForExport(document: TFiscalDocumentExportEntry): FiscalDocumentExportRow {
	const totais = document.totais;
	const destinatario = document.destinatario;
	const venda = document.venda;
	return {
		ID: document.id,
		TIPO: FISCAL_DOCUMENT_TYPE_LABELS[document.tipo] ?? document.tipo,
		AMBIENTE: FISCAL_ENVIRONMENT_LABELS[document.ambiente] ?? document.ambiente,
		STATUS: FISCAL_LIFECYCLE_STATUS_LABELS[document.statusInterno] ?? document.statusInterno,
		SÉRIE: document.serie ?? "",
		NÚMERO: document.numero ?? "",
		"CHAVE DE ACESSO": document.chaveAcesso ?? "",
		PROTOCOLO: document.protocolo ?? "",
		"DATA DE EMISSÃO": formatOptionalDate(document.dataEmissao),
		"DATA DE AUTORIZAÇÃO": formatOptionalDate(document.dataAutorizacao),
		"DATA DE CANCELAMENTO": formatOptionalDate(document.dataCancelamento),
		"DATA DE CRIAÇÃO": formatOptionalDate(document.dataInsercao),
		DESTINATÁRIO: destinatario?.nome ?? "",
		"CPF/CNPJ DESTINATÁRIO": destinatario?.cpfCnpj ? formatToCPForCNPJ(destinatario.cpfCnpj) : "",
		"CFOP(S)": document.cfops.join(", "),
		"VALOR DA NOTA": totais?.vNF ?? null,
		"VALOR DOS PRODUTOS": totais?.vProd ?? null,
		DESCONTO: totais?.vDesc ?? null,
		"BC ICMS": totais?.vBC ?? null,
		ICMS: totais?.vICMS ?? null,
		"ICMS-ST": totais?.vST ?? null,
		FCP: totais?.vFCP ?? null,
		PIS: totais?.vPIS ?? null,
		COFINS: totais?.vCOFINS ?? null,
		"TRIBUTOS APROXIMADOS": totais?.vTotTrib ?? null,
		"CHAVE REFERENCIADA": document.chaveAcessoReferencia ?? "",
		"CÓDIGO DE REJEIÇÃO": document.codigoRejeicao ?? "",
		"ÚLTIMA MENSAGEM": document.ultimaMensagem ?? "",
		VENDA: venda?.id ?? "",
		"DATA DA VENDA": formatOptionalDate(venda?.dataVenda),
		"VALOR DA VENDA": venda?.valorTotal ?? null,
		"MODALIDADE DE ENTREGA": venda?.entregaModalidade ? (DELIVERY_MODE_META[venda.entregaModalidade]?.label ?? venda.entregaModalidade) : "",
		CLIENTE: venda?.cliente?.nome ?? "",
	};
}

export function useFiscalDocumentsExport({ filters }: { filters: TFiscalDocumentsFiltersState }): UseFiscalDocumentsExportReturn {
	const fetchPage = useCallback(
		async (page: number) => {
			const result = await fetchFiscalDocumentsExportPage({ filters, page });
			return {
				rows: result.documents.map(formatFiscalDocumentForExport),
				totalPages: result.totalPages,
				totalMatched: result.documentsMatched,
			};
		},
		[filters],
	);

	return usePaginatedExport({
		fetchPage,
		sheetName: "Documentos fiscais",
		fileNamePrefix: "documentos-fiscais",
		errorMessage: "Falha ao exportar documentos fiscais.",
	});
}
