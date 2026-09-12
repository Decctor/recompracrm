"use client";
import type { TGetClientsInput } from "@/app/api/clients/route";
import PaginatedExportMenu from "@/components/Modals/Exportation/PaginatedExportMenu";
import { useClientsExport } from "@/lib/clients/export";

type ExportClientsProps = {
	filters: TGetClientsInput;
	closeModal: () => void;
};

export default function ExportClients({ filters, closeModal }: ExportClientsProps) {
	const exporter = useClientsExport({
		params: {
			search: filters.search,
			acquisitionChannels: filters.acquisitionChannels,
			segmentationTitles: filters.segmentationTitles,
			statsPeriodAfter: filters.statsPeriodAfter,
			statsPeriodBefore: filters.statsPeriodBefore,
			statsIntegrationsIds: filters.statsIntegrationsIds,
			statsExcludedSalesIds: filters.statsExcludedSalesIds,
			birthdaysPeriodAfter: filters.birthdaysPeriodAfter,
			birthdaysPeriodBefore: filters.birthdaysPeriodBefore,
			orderByField: filters.orderByField,
			orderByDirection: filters.orderByDirection,
		},
	});

	return (
		<PaginatedExportMenu
			title="Exportar clientes"
			description="Exporte os clientes filtrados em um arquivo XLSX."
			exporter={exporter}
			closeModal={closeModal}
		/>
	);
}
