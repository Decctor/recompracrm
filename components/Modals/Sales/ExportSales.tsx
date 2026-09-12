"use client";
import type { TGetSalesInput } from "@/app/api/sales/route";
import PaginatedExportMenu from "@/components/Modals/Exportation/PaginatedExportMenu";
import { useSalesExport } from "@/lib/sales/export";
import { useMemo } from "react";

type ExportSalesProps = {
	filters: TGetSalesInput;
	closeModal: () => void;
};

export default function ExportSales({ filters, closeModal }: ExportSalesProps) {
	// O histórico nunca filtra por cliente, e a página é do laço de exportação, não do filtro.
	const params = useMemo(() => {
		const { id: _id, page: _page, clientId: _clientId, ...rest } = filters;
		return rest;
	}, [filters]);
	const exporter = useSalesExport({ params });

	return (
		<PaginatedExportMenu
			title="Exportar vendas"
			description="Exporte as vendas filtradas em um arquivo XLSX."
			exporter={exporter}
			closeModal={closeModal}
		/>
	);
}
