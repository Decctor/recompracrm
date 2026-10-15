"use client";

import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { downloadServiceCardsFile, type TServiceCardFileFormat } from "@/lib/tabs/service-card-download";
import type { TServiceCardPrintItem } from "@/lib/tabs/service-card-print";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type ServiceCardFileActionsProps = {
	cards: TServiceCardPrintItem[];
	logoUrl?: string | null;
	disabled?: boolean;
};

/**
 * Botoes do arquivo para grafica: PDF (uma pagina por cartao, com sangria e QR vetorial)
 * ou CSV `codigo;url` para graficas que montam a arte no proprio software.
 */
export function ServiceCardFileActions({ cards, logoUrl, disabled }: ServiceCardFileActionsProps) {
	const [generating, setGenerating] = useState<TServiceCardFileFormat | null>(null);

	async function handleDownload(format: TServiceCardFileFormat) {
		setGenerating(format);
		try {
			const { logoIncluded } = await downloadServiceCardsFile({ cards, format, logoUrl });
			if (format === "PDF" && logoUrl && !logoIncluded) {
				toast.warning("Arquivo gerado sem o logo: só logos PNG ou JPEG podem ser incluídos.");
			}
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			setGenerating(null);
		}
	}

	const isDisabled = disabled || cards.length === 0 || generating !== null;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<Button size="sm" className="flex items-center gap-1.5" disabled={isDisabled} onClick={() => handleDownload("PDF")}>
					{generating === "PDF" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
					BAIXAR PDF PARA GRÁFICA
				</Button>
				<Button size="sm" variant="outline" className="flex items-center gap-1.5" disabled={isDisabled} onClick={() => handleDownload("CSV")}>
					{generating === "CSV" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
					BAIXAR PLANILHA (CSV)
				</Button>
			</div>
			<p className="text-[0.7rem] text-muted-foreground">
				PDF: uma página por comanda no tamanho de cartão (85,6 × 54 mm) com 3 mm de sangria e QR vetorial. Planilha: número e link de cada comanda, para
				gráficas que montam a arte com dados variáveis.
			</p>
		</div>
	);
}
