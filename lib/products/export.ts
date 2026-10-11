"use client";
import type { TGetProductsExportInput, TGetProductsExportOutput, TProductExportEntry } from "@/app/api/products/export/route";
import { usePaginatedExport } from "@/lib/exportations/use-paginated-export";
import { buildProductsSearchParams } from "@/lib/products/search-params";
import { buildProductExportSheets } from "@/lib/products/export-sheets";
import axios from "axios";
import { useCallback } from "react";

export function useProductsExport({ params }: { params: Omit<TGetProductsExportInput, "page"> }) {
	const fetchPage = useCallback(
		async (page: number) => {
			const query = buildProductsSearchParams({ ...params, page });
			const { data } = await axios.get<TGetProductsExportOutput>(`/api/products/export?${query.toString()}`);
			return data.data;
		},
		[params],
	);
	return usePaginatedExport<TProductExportEntry>({
		fetchPage,
		sheetName: "Produtos",
		toSheets: buildProductExportSheets,
		fileNamePrefix: "produtos",
		errorMessage: "Falha ao exportar produtos.",
	});
}
