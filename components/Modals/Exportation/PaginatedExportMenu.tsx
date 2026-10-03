"use client";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UsePaginatedLoopReturn } from "@/lib/exportations/use-paginated-loop";
import { cn } from "@/lib/utils";
import { BookOpen, CpuIcon, Download, Ellipsis, Eye, FileSpreadsheet, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";

type PaginatedExportMenuProps = {
	title: string;
	description: string;
	exporter: UsePaginatedLoopReturn;
	/**
	 * Botão de download depois do laço (planilha montada em memória). Sem ele, o destino grava
	 * durante o laço (ZIP) e o menu só mostra o fim.
	 */
	download?: { label: string; onClick: () => void };
	/** Explica de onde vêm os dados e para onde vão; o padrão fala da planilha. */
	note?: string;
	/** Opções antes de iniciar (formato, ambiente) — travadas enquanto a exportação roda. */
	children?: ReactNode;
	/** Contadores além dos padrão (ex.: falhas do ZIP). */
	extraStats?: ReactNode;
	/** Mensagem ao concluir, abaixo dos botões. */
	completedMessage?: ReactNode;
	closeModal: () => void;
};

/**
 * Menu de exportação paginada: progresso, contadores e os botões de iniciar, cancelar, reiniciar
 * e baixar. A entidade entra só pelo `exporter` (o retorno de `usePaginatedLoop` ou de quem o
 * envolve) e pelos textos.
 */
export default function PaginatedExportMenu({
	title,
	description,
	exporter,
	download,
	note = "A exportação será feita em páginas, usando os filtros e ordenação atuais do banco de dados.",
	children,
	extraStats,
	completedMessage,
	closeModal,
}: PaginatedExportMenuProps) {
	const { start, cancel, reset, isExporting, isCanceled, isCompleted, progress, currentPage, totalPages, totalMatched, processed } = exporter;

	const canDownload = !!download && isCompleted && processed > 0 && !isExporting;
	const canStart = !isExporting && !isCompleted;

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
						<p className="text-sm text-muted-foreground">{note}</p>

						{children ? <fieldset disabled={isExporting || isCompleted}>{children}</fieldset> : null}

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
								<ExportStat icon={<CpuIcon className="h-4 w-4" />} label={`REGISTROS PROCESSADOS ${processed}`} />
								{extraStats}
							</div>
						</div>

						<div className="flex w-full flex-wrap justify-center gap-2">
							{canStart ? (
								<Button type="button" onClick={() => start()} disabled={isExporting} size="sm">
									<FileSpreadsheet className="h-4 w-4" />
									INICIAR EXPORTAÇÃO
								</Button>
							) : download ? (
								<Button type="button" onClick={() => download.onClick()} disabled={!canDownload} size="sm">
									<Download className="h-4 w-4" />
									{download.label}
								</Button>
							) : null}
							{isExporting ? (
								<Button type="button" onClick={() => cancel()} variant="outline" size="sm">
									<X className="h-4 w-4" />
									CANCELAR
								</Button>
							) : processed > 0 || isCanceled || isCompleted ? (
								<Button type="button" onClick={() => reset()} variant="outline" size="sm">
									<RotateCcw className="h-4 w-4" />
									REINICIAR
								</Button>
							) : null}
						</div>

						{isCompleted && completedMessage ? <div className="text-xs text-muted-foreground">{completedMessage}</div> : null}
					</div>
				</ResponsiveMenu.Body>
				<ResponsiveMenu.Footer>
					<ResponsiveMenu.Close variant="outline">FECHAR</ResponsiveMenu.Close>
				</ResponsiveMenu.Footer>
			</ResponsiveMenu.Content>
		</ResponsiveMenu.Root>
	);
}

export function ExportStat({ icon, label }: { icon: ReactNode; label: string }) {
	return (
		<div className="flex min-h-8 items-center gap-1.5 rounded-md bg-muted/40 px-2 text-xs font-medium tracking-tight uppercase">
			{icon}
			<span>{label}</span>
		</div>
	);
}
