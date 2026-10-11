"use client";
import type { TGetProductsDefaultInput } from "@/app/api/products/route";
import PaginatedExportMenu from "@/components/Modals/Exportation/PaginatedExportMenu";
import { useProductsExport } from "@/lib/products/export";
import { useState } from "react";

export default function ExportProducts({ filters, closeModal }: { filters: TGetProductsDefaultInput; closeModal: () => void }) {
	const [params] = useState(() => {
		const { page: _page, mode: _mode, ...params } = filters;
		return params;
	});
	const exporter = useProductsExport({ params });
	return (
		<PaginatedExportMenu
			title="Exportar produtos"
			description="Exporte os produtos filtrados em um arquivo XLSX."
			note="A planilha contém produtos e variantes em abas separadas. Quando você tem acesso fiscal, inclui também os perfis fiscais ativos, com uma linha por perfil e seu NCM. As estatísticas seguem o período selecionado."
			exporter={exporter}
			download={{ label: "BAIXAR XLSX", onClick: () => exporter.downloadXlsx() }}
			completedMessage={`${exporter.exportData.length} produtos prontos para download.`}
			closeModal={closeModal}
		/>
	);
}
