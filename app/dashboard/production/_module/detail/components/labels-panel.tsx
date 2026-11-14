"use client";

import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { appRoutes } from "@/lib/navigation/routes";
import { Boxes, CalendarClock, Eye, Layers, PackageX, Printer } from "lucide-react";
import Link from "next/link";
import { formatFullDate, formatQuantity, getItemName, getItemUnit, type TProductionById } from "../helpers/production-detail";
import { PanelEmptyState } from "./panel-empty-state";

type LabelsPanelProps = {
	production: TProductionById;
	canPrint: boolean;
	isPrinting: boolean;
	onPrint: () => void;
	/** Link da pré-visualização das etiquetas dos lotes gerados; nulo quando não há lote. */
	previewHref: string | null;
};

/** Lotes gerados na conclusão — uma etiqueta por lote, com código e validade. */
export default function LabelsPanel({ production, canPrint, isPrinting, onPrint, previewHref }: LabelsPanelProps) {
	const lots = production.lotes.map((lot) => {
		const output =
			production.saidas.find((item) => item.produtoId === lot.produtoId && (item.produtoVarianteId ?? null) === (lot.produtoVarianteId ?? null)) ??
			production.saidas.find((item) => item.produtoId === lot.produtoId) ??
			null;
		return {
			id: lot.id,
			name: output ? getItemName(output) : "Produto",
			quantity: formatQuantity(lot.quantidadeInicial, output ? getItemUnit(output) : ""),
			code: lot.codigoLote ?? "Sem código",
			validity: lot.dataValidade ? `Vence ${formatFullDate(lot.dataValidade)}` : "Sem validade",
		};
	});

	return (
		<>
			<div className="flex flex-col gap-1 px-1 py-0.5">
				<span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Lotes gerados</span>
				<span className="text-[13px] text-muted-foreground">Uma etiqueta por saída, com lote e validade.</span>
			</div>
			{lots.length > 0 ? (
				lots.map((lot) => (
					<div key={lot.id} className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3.5">
						<div className="flex items-center justify-between gap-2">
							<span className="text-[15px] font-bold">{lot.name}</span>
							<span className="shrink-0 text-[15px] font-extrabold tabular-nums">{lot.quantity}</span>
						</div>
						<div className="flex flex-wrap gap-1.5">
							<span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold">
								<Layers className="h-3 w-3" />
								{lot.code}
							</span>
							<span className="inline-flex items-center gap-1 rounded-md bg-warning-surface px-2 py-0.5 text-xs font-semibold text-warning-surface-foreground">
								<CalendarClock className="h-3 w-3" />
								{lot.validity}
							</span>
						</div>
					</div>
				))
			) : (
				<PanelEmptyState icon={PackageX} text="Nenhum lote gerado: os produtos desta produção não controlam estoque por lote." />
			)}
			<LoadingButton
				type="button"
				variant="brand"
				loading={isPrinting}
				disabled={!canPrint}
				onClick={onPrint}
				className="h-14 gap-2 rounded-full text-[15px] font-bold"
			>
				<Printer className="h-4.5 w-4.5" />
				IMPRIMIR ETIQUETAS
			</LoadingButton>
			<div className="flex flex-wrap items-center justify-center gap-1">
				{previewHref ? (
					<Button variant="ghost" asChild className="h-11 gap-1.5 rounded-full text-[13px] font-medium">
						<a href={previewHref} target="_blank" rel="noopener noreferrer">
							<Eye className="h-4 w-4" />
							PRÉ-VISUALIZAR
						</a>
					</Button>
				) : null}
				<Button variant="ghost" asChild className="h-11 gap-1.5 rounded-full text-[13px] font-medium">
					<Link href={appRoutes.inventory.lots()}>
						<Boxes className="h-4 w-4" />
						VER LOTES NO ESTOQUE
					</Link>
				</Button>
			</div>
		</>
	);
}
