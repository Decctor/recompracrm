"use client";

import { StageShell } from "@/app/dashboard/growth/campaigns/_module/builder/components/stage-shell";
import TextInput from "@/components/Inputs/TextInput";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeVisualKitPiece, VISUAL_KIT_FORMATS } from "@/lib/visual-kits/formats";
import { useVisualKitPages, VisualKitPiecePreview } from "@/lib/visual-kits/pieces/piece-preview";
import type { TVisualKitPieceProps } from "@/lib/visual-kits/types";
import type { TVisualKitFormatEnum } from "@/schemas/enums";
import { ChevronLeft, ChevronRight, LoaderCircle, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useKitBuilder } from "../kit-builder-context";
import KitToggle from "../kit-toggle";
import { KIT_STAGES } from "../stages";
import { usePieceProps } from "../use-piece-props";

export default function StageVisual() {
	const { state, updateKit, updateConfig, pieceItems, selectedItemsLoading, next, back } = useKitBuilder();
	const [activeFormat, setActiveFormat] = useState<TVisualKitFormatEnum | null>(null);
	const formato = state.pecas.some((piece) => piece.formato === activeFormat) ? activeFormat : (state.pecas[0]?.formato ?? null);
	const activeIndex = state.pecas.findIndex((piece) => piece.formato === formato);
	const format = formato ? VISUAL_KIT_FORMATS[formato] : null;
	const showsLabelOptions = formato === "ETIQUETA_GONDOLA" || formato === "ADESIVO_PRECO";

	return (
		<StageShell>
			<StageShell.Title icon={KIT_STAGES.visual.icone} label={KIT_STAGES.visual.titulo} description={KIT_STAGES.visual.descricao} />
			<StageShell.Body>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1">
						{state.pecas.map((piece) => {
							const Icon = VISUAL_KIT_FORMATS[piece.formato].icone;
							const isActive = piece.formato === formato;
							return (
								<button
									key={piece.formato}
									type="button"
									onClick={() => setActiveFormat(piece.formato)}
									className={cn(
										"flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
										isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
									)}
								>
									<Icon className={cn("h-3.5 w-3.5", !isActive && "opacity-60")} />
									{VISUAL_KIT_FORMATS[piece.formato].nome}
								</button>
							);
						})}
					</div>
					{formato ? (
						<span className="text-xs font-medium text-muted-foreground">
							Peça {activeIndex + 1} de {state.pecas.length}
						</span>
					) : null}
				</div>

				{format && formato ? (
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
						<aside className="flex flex-col gap-3">
							<div className="flex items-center gap-1.5">
								<SlidersHorizontal className="h-4 w-4 opacity-70" />
								<h3 className="text-xs font-semibold tracking-tight">DETALHES DA PEÇA</h3>
							</div>
							<div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
								{format.fatos.map((fact) => (
									<div key={fact.rotulo} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
										<span className="text-muted-foreground">{fact.rotulo}</span>
										<span className="text-right font-medium">{fact.valor}</span>
									</div>
								))}
								<div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
									<span className="text-muted-foreground">Neste kit</span>
									<span className="text-right font-medium">{describeVisualKitPiece(formato, pieceItems.length)}</span>
								</div>
							</div>
							{format.usaChamada ? (
								<TextInput label="TÍTULO" value={state.kit.chamada} placeholder="Ex.: Ofertas da semana" handleChange={(chamada) => updateKit({ chamada })} />
							) : null}
							{showsLabelOptions ? (
								<div className="flex flex-col gap-2">
									<KitToggle
										label="Código de barras"
										hint="Só aparece nos produtos com código de barras cadastrado."
										value={state.kit.configuracao.mostrarCodigoBarras}
										onChange={(mostrarCodigoBarras) => updateConfig({ mostrarCodigoBarras })}
									/>
									<KitToggle
										label="Preço por unidade de medida"
										hint="Usa o conteúdo da embalagem do cadastro."
										value={state.kit.configuracao.mostrarPrecoUnidade}
										onChange={(mostrarPrecoUnidade) => updateConfig({ mostrarPrecoUnidade })}
									/>
								</div>
							) : null}
						</aside>
						<PiecePreviewPanel formato={formato} loading={selectedItemsLoading} />
					</div>
				) : (
					<p className="py-6 text-center text-xs text-muted-foreground">Escolha ao menos uma peça na primeira etapa.</p>
				)}
			</StageShell.Body>
			<StageShell.Footer onBack={back} onNext={next} />
		</StageShell>
	);
}

function PiecePreviewPanel({ formato, loading }: { formato: TVisualKitFormatEnum; loading: boolean }) {
	const props = usePieceProps(formato);
	if (!props) return null;
	return <PiecePreviewPages formato={formato} props={props} loading={loading} />;
}

function PiecePreviewPages({ formato, props, loading }: { formato: TVisualKitFormatEnum; props: TVisualKitPieceProps; loading: boolean }) {
	const [pageIndex, setPageIndex] = useState(0);
	const pages = useVisualKitPages(formato, props);
	const safeIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
	const page = pages[safeIndex];

	return (
		<div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3">
			<div className="flex items-center justify-between gap-2">
				<span className="truncate text-xs font-medium text-muted-foreground">{page?.rotulo ?? ""}</span>
				<div className="flex items-center gap-1">
					{loading ? <LoaderCircle className="h-4 w-4 animate-spin opacity-50" /> : null}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={safeIndex === 0}
						onClick={() => setPageIndex(safeIndex - 1)}
						aria-label="Página anterior"
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-xs tabular-nums text-muted-foreground">
						{pages.length ? safeIndex + 1 : 0} / {pages.length}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={safeIndex >= pages.length - 1}
						onClick={() => setPageIndex(safeIndex + 1)}
						aria-label="Próxima página"
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			</div>
			<div className="flex min-h-[420px] items-center justify-center">
				<VisualKitPiecePreview formato={formato} props={props} pageIndex={safeIndex} maxHeight={640} />
			</div>
		</div>
	);
}
