"use client";

import type { TGetClientsInput, TGetClientsOutput, TGetClientsOutputDefault } from "@/app/api/clients/route";
import { formatDateAsLocale, formatToMoney, formatToPhone } from "@/lib/formatting";
import { usePaginatedExport, type UsePaginatedExportReturn } from "@/lib/exportations/use-paginated-export";
import axios from "axios";
import { useCallback } from "react";

type ClientExportParams = Omit<TGetClientsInput, "id" | "page">;
type ClientExportClient = TGetClientsOutputDefault["clients"][number];

export type ClientExportRow = {
	ID: string;
	NOME: string;
	TELEFONE: string;
	EMAIL: string;
	"CPF/CNPJ": string;
	AQUISIÇÃO: string;
	"SEGMENTAÇÃO RFM": string;
	"VALOR TOTAL DE COMPRAS": string;
	"QUANTIDADE TOTAL DE COMPRAS": number;
	"PRIMEIRA COMPRA": string | null;
	"ÚLTIMA COMPRA": string | null;
	"CASHBACK DISPONÍVEL": string;
	CIDADE: string;
	ESTADO: string;
	BAIRRO: string;
	CEP: string;
	"PRODUTO/GRUPO MAIS COMPRADO": string;
	"DATA DE CADASTRO": string | null;
};

export type UseClientsExportReturn = UsePaginatedExportReturn<ClientExportRow>;

function buildClientsSearchParams(input: TGetClientsInput) {
	const searchParams = new URLSearchParams();
	if (input.search) searchParams.set("search", input.search);
	if (input.acquisitionChannels.length > 0) searchParams.set("acquisitionChannels", input.acquisitionChannels.join(","));
	if (input.segmentationTitles.length > 0) searchParams.set("segmentationTitles", input.segmentationTitles.join(","));
	if (input.statsPeriodAfter) searchParams.set("statsPeriodAfter", input.statsPeriodAfter.toISOString());
	if (input.statsPeriodBefore) searchParams.set("statsPeriodBefore", input.statsPeriodBefore.toISOString());
	if (input.statsIntegrationsIds.length > 0) searchParams.set("statsIntegrationsIds", input.statsIntegrationsIds.join(","));
	if (input.statsExcludedSalesIds.length > 0) searchParams.set("statsExcludedSalesIds", input.statsExcludedSalesIds.join(","));
	if (input.birthdaysPeriodAfter) searchParams.set("birthdaysPeriodAfter", input.birthdaysPeriodAfter.toISOString());
	if (input.birthdaysPeriodBefore) searchParams.set("birthdaysPeriodBefore", input.birthdaysPeriodBefore.toISOString());
	if (input.orderByField) searchParams.set("orderByField", input.orderByField);
	if (input.orderByDirection) searchParams.set("orderByDirection", input.orderByDirection);
	searchParams.set("page", input.page.toString());
	return searchParams;
}

async function fetchClientsExportPage(input: TGetClientsInput) {
	const searchParams = buildClientsSearchParams(input);
	const { data } = await axios.get<TGetClientsOutput>(`/api/clients?${searchParams.toString()}`);
	if (!data.data.default) throw new Error("Clientes não encontrados.");
	return data.data.default;
}

function formatOptionalDate(date?: string | Date | null) {
	return date ? formatDateAsLocale(date) : "";
}

function formatClientForExport(client: ClientExportClient): ClientExportRow {
	const cashbackBalance = client.saldos[0] ?? null;

	return {
		ID: client.id,
		NOME: client.nome,
		TELEFONE: client.telefone ? formatToPhone(client.telefone) : "",
		EMAIL: client.email ?? "",
		"CPF/CNPJ": client.cpfCnpj ?? "",
		AQUISIÇÃO: client.canalAquisicao ?? "",
		"SEGMENTAÇÃO RFM": client.analiseRFMTitulo ?? "",
		"VALOR TOTAL DE COMPRAS": formatToMoney(client.estatisticas.comprasValorTotal),
		"QUANTIDADE TOTAL DE COMPRAS": client.estatisticas.comprasQtdeTotal,
		"PRIMEIRA COMPRA": formatOptionalDate(client.estatisticas.primeiraCompraData),
		"ÚLTIMA COMPRA": formatOptionalDate(client.estatisticas.ultimaCompraData),
		"CASHBACK DISPONÍVEL": cashbackBalance ? formatToMoney(cashbackBalance.saldoValorDisponivel) : "",
		CIDADE: client.localizacaoCidade ?? "",
		ESTADO: client.localizacaoEstado ?? "",
		BAIRRO: client.localizacaoBairro ?? "",
		CEP: client.localizacaoCep ?? "",
		"PRODUTO/GRUPO MAIS COMPRADO": client.metadataGrupoProdutoMaisComprado ?? "",
		"DATA DE CADASTRO": formatOptionalDate(client.dataInsercao),
	};
}

export function useClientsExport({ params }: { params: ClientExportParams }): UseClientsExportReturn {
	const fetchPage = useCallback(
		async (page: number) => {
			const result = await fetchClientsExportPage({ ...params, page });
			return {
				rows: result.clients.map(formatClientForExport),
				totalPages: result.totalPages ?? 0,
				totalMatched: result.clientsMatched ?? 0,
			};
		},
		[params],
	);

	return usePaginatedExport({ fetchPage, sheetName: "Clientes", fileNamePrefix: "clientes", errorMessage: "Falha ao exportar clientes." });
}
