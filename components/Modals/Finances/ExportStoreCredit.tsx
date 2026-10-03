"use client";
import PaginatedExportMenu from "@/components/Modals/Exportation/PaginatedExportMenu";
import { Button } from "@/components/ui/button";
import { type TStoreCreditExportFilters, useStoreCreditExport } from "@/lib/finances/store-credit/export";
import type { TStoreCreditClientsFilters } from "@/lib/queries/store-credit";
import { useMemo, useState } from "react";

type ExportStoreCreditProps = {
	filters: TStoreCreditClientsFilters;
	closeModal: () => void;
};

export default function ExportStoreCredit({ filters, closeModal }: ExportStoreCreditProps) {
	// Quem filtrou por quitados quer o histórico; quem não filtrou está cobrando, e o histórico
	// enterraria os títulos em aberto no meio dos já pagos.
	const [includeSettled, setIncludeSettled] = useState(filters.statuses.includes("QUITADO"));
	const exportFilters: TStoreCreditExportFilters = useMemo(
		() => ({
			search: filters.search,
			statuses: filters.statuses,
			agingBuckets: filters.agingBuckets,
			originAfter: filters.originAfter,
			originBefore: filters.originBefore,
			includeSettled,
		}),
		[filters.search, filters.statuses, filters.agingBuckets, filters.originAfter, filters.originBefore, includeSettled],
	);
	const exporter = useStoreCreditExport({ filters: exportFilters });

	return (
		<PaginatedExportMenu
			title="Exportar fiados"
			description="Exporte os fiados filtrados em uma planilha com as abas Clientes e Fiados."
			note="A exportação usa os filtros atuais da tela (pesquisa, status, faixa de atraso e período de origem). A aba Clientes resume a aba Fiados."
			exporter={exporter}
			download={{ label: "BAIXAR XLSX", onClick: () => exporter.downloadXlsx() }}
			completedMessage={`${exporter.exportData.length} títulos prontos para download.`}
			closeModal={closeModal}
		>
			<div className="flex flex-col gap-1.5">
				<h3 className="text-xs font-medium tracking-tight uppercase">TÍTULOS</h3>
				<div className="flex flex-wrap gap-1.5">
					{[
						{ value: false, label: "SOMENTE EM ABERTO" },
						{ value: true, label: "INCLUIR QUITADOS" },
					].map((option) => (
						<Button
							key={option.label}
							type="button"
							variant={includeSettled === option.value ? "default" : "ghost"}
							size="fit"
							className="px-2 py-1 text-xs rounded-lg"
							onClick={() => setIncludeSettled(option.value)}
						>
							{option.label}
						</Button>
					))}
				</div>
			</div>
		</PaginatedExportMenu>
	);
}
