"use client";
import PaginatedExportMenu, { ExportStat } from "@/components/Modals/Exportation/PaginatedExportMenu";
import { Button } from "@/components/ui/button";
import { browserSupportsZipStreaming } from "@/lib/exportations/zip-volume-writer";
import { useFiscalDocumentAssetsZipExport } from "@/lib/fiscal/asset-zip-export";
import type { TFiscalDocumentsFiltersState } from "@/lib/fiscal/document-filters";
import { useFiscalDocumentsExport } from "@/lib/fiscal/export";
import type { TFiscalDocumentEnvironmentEnum } from "@/schemas/enums";
import { AlertTriangle, Archive } from "lucide-react";
import { useMemo, useState } from "react";

type TExportFormat = "XLSX" | "XML" | "PDF";

const FORMAT_OPTIONS: { value: TExportFormat; label: string; description: string }[] = [
	{ value: "XLSX", label: "PLANILHA", description: "Uma linha por documento, com chave, datas, destinatário e tributos." },
	{ value: "XML", label: "ZIP DE XML", description: "O XML autorizado de cada nota, para o contador ou outro sistema." },
	{ value: "PDF", label: "ZIP DE DANFE", description: "O PDF (DANFE) de cada nota autorizada." },
];

const ENVIRONMENT_OPTIONS: { value: TFiscalDocumentEnvironmentEnum; label: string }[] = [
	{ value: "PRODUCAO", label: "PRODUÇÃO" },
	{ value: "HOMOLOGACAO", label: "HOMOLOGAÇÃO" },
];

type ExportFiscalDocumentsProps = {
	filters: TFiscalDocumentsFiltersState;
	closeModal: () => void;
};

export default function ExportFiscalDocuments({ filters, closeModal }: ExportFiscalDocumentsProps) {
	const [format, setFormat] = useState<TExportFormat>("XLSX");
	// Nota de homologação no ZIP do contador é erro de verdade: sem ambiente escolhido na lista,
	// a exportação parte de produção.
	const [ambiente, setAmbiente] = useState<TFiscalDocumentEnvironmentEnum>(filters.ambiente ?? "PRODUCAO");
	const exportFilters = useMemo(() => ({ ...filters, ambiente }), [filters, ambiente]);

	const spreadsheetExporter = useFiscalDocumentsExport({ filters: exportFilters });
	const zipExporter = useFiscalDocumentAssetsZipExport({ filters: exportFilters, asset: format === "PDF" ? "pdf" : "xml" });
	const isZip = format !== "XLSX";
	const exporter = isZip ? zipExporter : spreadsheetExporter;
	const streams = browserSupportsZipStreaming();

	const note = isZip
		? `Só entram documentos autorizados ou cancelados — os que têm arquivo. ${
				streams
					? "O ZIP é gravado direto no arquivo que você escolher."
					: "Seu navegador baixa o ZIP em partes de até 2.000 arquivos; mantenha esta janela aberta até o fim."
			} Um relatório (_RELATORIO.csv) lista cada documento e se o arquivo entrou.`
		: "A exportação usa os filtros atuais da lista de documentos, inclusive rascunhos, erros e rejeições.";

	return (
		<PaginatedExportMenu
			title="Exportar documentos fiscais"
			description="Exporte os documentos fiscais filtrados em planilha ou os arquivos em ZIP."
			exporter={exporter}
			note={note}
			download={isZip ? undefined : { label: "BAIXAR XLSX", onClick: () => spreadsheetExporter.downloadXlsx() }}
			extraStats={
				isZip ? (
					<>
						<ExportStat icon={<AlertTriangle className="h-4 w-4" />} label={`FALHAS ${zipExporter.failures}`} />
						{!streams ? <ExportStat icon={<Archive className="h-4 w-4" />} label={`PARTES BAIXADAS ${zipExporter.volumes}`} /> : null}
					</>
				) : null
			}
			completedMessage={
				isZip
					? zipExporter.failures > 0
						? `${zipExporter.failures} arquivo(s) não entraram no ZIP. O motivo de cada um está no _RELATORIO.csv.`
						: "Todos os arquivos entraram no ZIP."
					: `${spreadsheetExporter.exportData.length} linhas prontas para download.`
			}
			closeModal={closeModal}
		>
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-1.5">
					<h3 className="text-xs font-medium tracking-tight uppercase">FORMATO</h3>
					<div className="flex flex-wrap gap-1.5">
						{FORMAT_OPTIONS.map((option) => (
							<Button
								key={option.value}
								type="button"
								variant={format === option.value ? "default" : "ghost"}
								size="fit"
								className="px-2 py-1 text-xs rounded-lg"
								onClick={() => setFormat(option.value)}
							>
								{option.label}
							</Button>
						))}
					</div>
					<p className="text-xs text-muted-foreground">{FORMAT_OPTIONS.find((option) => option.value === format)?.description}</p>
				</div>
				<div className="flex flex-col gap-1.5">
					<h3 className="text-xs font-medium tracking-tight uppercase">AMBIENTE</h3>
					<div className="flex flex-wrap gap-1.5">
						{ENVIRONMENT_OPTIONS.map((option) => (
							<Button
								key={option.value}
								type="button"
								variant={ambiente === option.value ? "default" : "ghost"}
								size="fit"
								className="px-2 py-1 text-xs rounded-lg"
								onClick={() => setAmbiente(option.value)}
							>
								{option.label}
							</Button>
						))}
					</div>
				</div>
			</div>
		</PaginatedExportMenu>
	);
}
