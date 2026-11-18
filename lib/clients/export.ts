"use client";

import type { TExportClientsInput, TExportClientsOutput } from "@/app/api/clients/export/route";
import type { TClientExportRow } from "@/lib/clients/export-rows";
import { usePaginatedExport, type UsePaginatedExportReturn } from "@/lib/exportations/use-paginated-export";
import axios from "axios";
import { useCallback } from "react";

type ClientExportParams = Omit<TExportClientsInput, "page">;

export type ClientExportRow = TClientExportRow;

export type UseClientsExportReturn = UsePaginatedExportReturn<ClientExportRow>;

function buildClientsSearchParams(input: TExportClientsInput) {
	const searchParams = new URLSearchParams();
	if (input.search) searchParams.set("search", input.search);
	if (input.acquisitionChannels.length > 0) searchParams.set("acquisitionChannels", input.acquisitionChannels.join(","));
	if (input.segmentationTitles.length > 0) searchParams.set("segmentationTitles", input.segmentationTitles.join(","));
	if (input.statsPeriodAfter) searchParams.set("statsPeriodAfter", input.statsPeriodAfter.toISOString());
	if (input.statsPeriodBefore) searchParams.set("statsPeriodBefore", input.statsPeriodBefore.toISOString());
	if (input.statsIntegrationsIds.length > 0) searchParams.set("statsIntegrationsIds", input.statsIntegrationsIds.join(","));
	if (input.statsExcludedSalesIds.length > 0) searchParams.set("statsExcludedSalesIds", input.statsExcludedSalesIds.join(","));
	if (input.statsTotalMin != null) searchParams.set("statsTotalMin", input.statsTotalMin.toString());
	if (input.statsTotalMax != null) searchParams.set("statsTotalMax", input.statsTotalMax.toString());
	if (input.birthdaysPeriodAfter) searchParams.set("birthdaysPeriodAfter", input.birthdaysPeriodAfter.toISOString());
	if (input.birthdaysPeriodBefore) searchParams.set("birthdaysPeriodBefore", input.birthdaysPeriodBefore.toISOString());
	if (input.orderByField) searchParams.set("orderByField", input.orderByField);
	if (input.orderByDirection) searchParams.set("orderByDirection", input.orderByDirection);
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());
	searchParams.set("page", input.page.toString());
	return searchParams;
}

/**
 * As linhas vêm prontas de `GET /api/clients/export`, que exige `dadosSensiveis.exportarClientes`.
 * A planilha não é mais montada a partir da listagem, que só exige ver clientes.
 */
async function fetchClientsExportPage(input: TExportClientsInput) {
	const searchParams = buildClientsSearchParams(input);
	const { data } = await axios.get<TExportClientsOutput>(`/api/clients/export?${searchParams.toString()}`);
	return data.data;
}

export function useClientsExport({ params }: { params: ClientExportParams }): UseClientsExportReturn {
	const fetchPage = useCallback(
		async (page: number) => {
			const result = await fetchClientsExportPage({ ...params, page });
			return {
				rows: result.rows,
				totalPages: result.totalPages,
				totalMatched: result.totalMatched,
			};
		},
		[params],
	);

	return usePaginatedExport({ fetchPage, sheetName: "Clientes", fileNamePrefix: "clientes", errorMessage: "Falha ao exportar clientes." });
}
