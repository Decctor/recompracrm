"use client";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UsePaginatedExportReturn } from "@/lib/exportations/use-paginated-export";
import { cn } from "@/lib/utils";
import { BookOpen, CpuIcon, Download, Ellipsis, Eye, FileSpreadsheet, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";

type PaginatedExportMenuProps = {
	title: string;
	description: string;
	exporter: UsePaginatedExportReturn<object>;
	closeModal: () => void;
};

/**
 * Menu de exportação paginada: progresso, contadores e os botões de iniciar, cancelar, reiniciar
 * e baixar. A entidade entra só pelo `exporter` (o retorno de `usePaginatedExport`) e pelos textos.
 */
export default function PaginatedExportMenu({ title, description, exporter, closeModal }: PaginatedExportMenuProps) {
	const { start, cancel, reset, downloadXlsx, isExporting, isCanceled, progress, currentPage, totalPages, totalMatched, exportData } = exporter;

	const canDownload = exportData.length > 0 && !isExporting;
	const canStart = !isExporting && progress !== 100;

	return (
		<ResponsiveMenu.Root
			open
			onOpenChange={(open) => {
				if (!open) closeModal();
			}}
		>
			<ResponsiveMenu.Content
				dialogVariant="sm"
				drawerVariant="sm"
				dialogClassName="h-[60%] min-h-[60%] w-[40%] min-w-[40%] max-w-[40%]"
				drawerClassName="max-h-[70dvh]"
			>
				<ResponsiveMenu.Header>
					<ResponsiveMenu.Title>{title}</ResponsiveMenu.Title>
					<ResponsiveMenu.Description>{description}</ResponsiveMenu.Description>
				</ResponsiveMenu.Header>
				<ResponsiveMenu.Body>
					<div className="flex flex-col gap-4">
						<p className="text-sm text-muted-foreground">A exportação será feita em páginas, usando os filtros e ordenação atuais do banco de dados.</p>

						<div className={cn("bg-card border-border flex w-full flex-col gap-3 rounded-lg border px-3 py-4 shadow-2xs")}>
							<div className="flex w-full flex-col gap-1">
								<div className="flex items-center justify-between gap-2">
									<h2 className="text-xs font-medium tracking-tight uppercase">PROGRESSO DA EXPORTAÇÃO</h2>
									<span className="text-xs font-bold tracking-tight">{progress}%</span>
								</div>
								<Progress value={progress} />
							</div>

							<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
								<ExportStat icon={<BookOpen className="h-4 w-4" />} label={`PÁGINA ${currentPage}/${totalPages}`} />
								<ExportStat icon={<Ellipsis className="h-4 w-4" />} label={`PROGRESSO ${progress}%`} />
								<ExportStat icon={<Eye className="h-4 w-4" />} label={`REGISTROS ENCONTRADOS ${totalMatched}`} />
								<ExportStat icon={<CpuIcon className="h-4 w-4" />} label={`REGISTROS PROCESSADOS ${exportData.length}`} />
							</div>
						</div>

						<div className="flex w-full flex-wrap justify-center gap-2">
							{canStart ? (
								<Button type="button" onClick={() => start()} disabled={isExporting} size="sm">
									<FileSpreadsheet className="h-4 w-4" />
									INICIAR EXPORTAÇÃO
								</Button>
							) : (
								<Button type="button" onClick={() => downloadXlsx()} disabled={!canDownload} size="sm">
									<Download className="h-4 w-4" />
									BAIXAR XLSX
								</Button>
							)}
							{isExporting ? (
								<Button type="button" onClick={() => cancel()} variant="outline" size="sm">
									<X className="h-4 w-4" />
									CANCELAR
								</Button>
							) : exportData.length > 0 || isCanceled ? (
								<Button type="button" onClick={() => reset()} variant="outline" size="sm">
									<RotateCcw className="h-4 w-4" />
									REINICIAR
								</Button>
							) : null}
						</div>

						{exportData.length > 0 && !isExporting ? (
							<p className="text-xs text-muted-foreground">{exportData.length} linhas prontas para download.</p>
						) : null}
					</div>
				</ResponsiveMenu.Body>
				<ResponsiveMenu.Footer>
					<ResponsiveMenu.Close variant="outline">FECHAR</ResponsiveMenu.Close>
				</ResponsiveMenu.Footer>
			</ResponsiveMenu.Content>
		</ResponsiveMenu.Root>
	);
}

function ExportStat({ icon, label }: { icon: ReactNode; label: string }) {
	return (
		<div className="flex min-h-8 items-center gap-1.5 rounded-md bg-muted/40 px-2 text-xs font-medium tracking-tight uppercase">
			{icon}
			<span>{label}</span>
		</div>
	);
}
