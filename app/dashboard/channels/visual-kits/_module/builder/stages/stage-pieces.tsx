"use client";

import { StageShell } from "@/app/dashboard/growth/campaigns/_module/builder/components/stage-shell";
import { cn } from "@/lib/utils";
import { VISUAL_KIT_CATEGORIES, VISUAL_KIT_FORMAT_ORDER, VISUAL_KIT_FORMATS, VISUAL_KIT_PRESETS } from "@/lib/visual-kits/formats";
import { Check, Package, X } from "lucide-react";
import { useKitBuilder } from "../kit-builder-context";
import { KIT_STAGES } from "../stages";

export default function StagePieces() {
	const { state, togglePiece, setPieces, next } = useKitBuilder();
	const selected = new Set(state.pecas.map((piece) => piece.formato));
	const count = state.pecas.length;
	const countLabel = count === 1 ? "1 peça" : `${count} peças`;

	return (
		<StageShell>
			<StageShell.Title icon={KIT_STAGES.pieces.icon} label={KIT_STAGES.pieces.title} description={KIT_STAGES.pieces.description} />
			<StageShell.Body className="gap-6">
				<section className="flex flex-col gap-3">
					<div className="flex flex-col">
						<h3 className="text-sm font-semibold tracking-tight">Começar com um kit pronto</h3>
						<p className="text-xs text-muted-foreground">Escolha uma sugestão ou monte o kit peça por peça logo abaixo.</p>
					</div>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
						{VISUAL_KIT_PRESETS.map((preset) => {
							const isActive = preset.formats.length === count && preset.formats.every((formato) => selected.has(formato));
							return (
								<button
									key={preset.id}
									type="button"
									onClick={() => setPieces(preset.formats)}
									aria-pressed={isActive}
									className={cn(
										"flex flex-col gap-3 rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-sm",
										isActive ? "border-brand bg-brand/5 ring-2 ring-brand/30" : "border-border bg-card",
									)}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="flex flex-col gap-0.5">
											<h4 className="text-sm font-semibold tracking-tight">{preset.name}</h4>
											<p className="text-xs text-muted-foreground">{preset.description}</p>
										</div>
										<span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground/80">
											{preset.formats.length} peças
										</span>
									</div>
									<div className="flex flex-wrap gap-1">
										{preset.formats.map((formato) => {
											const Icon = VISUAL_KIT_FORMATS[formato].icon;
											return (
												<span
													key={formato}
													className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground/80"
												>
													<Icon className="h-3 w-3 opacity-70" />
													{VISUAL_KIT_FORMATS[formato].name}
												</span>
											);
										})}
									</div>
								</button>
							);
						})}
					</div>
				</section>

				{VISUAL_KIT_CATEGORIES.map((category) => {
					const CategoryIcon = category.icon;
					const formats = VISUAL_KIT_FORMAT_ORDER.filter((formato) => VISUAL_KIT_FORMATS[formato].category === category.id);
					const picked = formats.filter((formato) => selected.has(formato)).length;
					return (
						<section key={category.id} className="flex flex-col gap-3">
							<div className="flex items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
										<CategoryIcon className="h-4 w-4 opacity-85" />
									</span>
									<div className="flex flex-col">
										<h3 className="text-sm font-semibold tracking-tight">{category.name}</h3>
										<p className="text-xs text-muted-foreground">{category.tagline}</p>
									</div>
								</div>
								<span className="text-[11px] font-medium text-muted-foreground">
									{picked ? `${picked} de ${formats.length} no kit` : `${formats.length} formatos`}
								</span>
							</div>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
								{formats.map((formato) => {
									const format = VISUAL_KIT_FORMATS[formato];
									const Icon = format.icon;
									const isOn = selected.has(formato);
									return (
										<button
											key={formato}
											type="button"
											onClick={() => togglePiece(formato)}
											aria-pressed={isOn}
											className={cn(
												"relative flex flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-sm",
												isOn ? "border-brand ring-2 ring-brand/30" : "border-border",
											)}
										>
											<span
												className={cn(
													"absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-md border",
													isOn ? "border-brand bg-brand text-brand-foreground" : "border-border bg-background",
												)}
											>
												{isOn ? <Check className="h-3 w-3" /> : null}
											</span>
											<div
												className={cn(
													"flex h-10 w-10 items-center justify-center rounded-lg",
													isOn ? "bg-brand text-brand-foreground" : "bg-brand/10 text-brand",
												)}
											>
												<Icon className="h-4 w-4" />
											</div>
											<div className="flex flex-col gap-0.5 pr-5">
												<h4 className="text-sm font-semibold tracking-tight">{format.name}</h4>
												<p className="text-xs text-muted-foreground line-clamp-2">{format.description}</p>
											</div>
											<span className="mt-auto text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{format.sizeLabel}</span>
										</button>
									);
								})}
							</div>
						</section>
					);
				})}

				<div
					className={cn("flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5", count ? "border-brand/30 bg-brand/5" : "border-border bg-card")}
				>
					<span className="flex items-center gap-1.5 text-xs font-semibold">
						<Package className="h-3.5 w-3.5 opacity-60" />
						{count ? `${countLabel} no kit` : "Nenhuma peça no kit ainda"}
					</span>
					{state.pecas.map((piece) => {
						const format = VISUAL_KIT_FORMATS[piece.formato];
						const Icon = format.icon;
						return (
							<span
								key={piece.formato}
								className="flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2 pr-0.5 text-[11px] font-medium"
							>
								<Icon className="h-3 w-3 opacity-75" />
								{format.name}
								<button
									type="button"
									onClick={() => togglePiece(piece.formato)}
									className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted"
									aria-label={`Remover ${format.name} do kit`}
								>
									<X className="h-3 w-3" />
								</button>
							</span>
						);
					})}
				</div>
			</StageShell.Body>
			<StageShell.Footer canGoBack={false} onNext={next} nextDisabled={count === 0} nextDisabledReason="Escolha ao menos uma peça para o kit." />
		</StageShell>
	);
}
