"use client";

import { StageShell } from "@/app/dashboard/growth/campaigns/_module/builder/components/stage-shell";
import { Button } from "@/components/ui/button";
import { formatDateAsLocale } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import { describeVisualKitPiece, VISUAL_KIT_FORMATS } from "@/lib/visual-kits/formats";
import { FileText, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { GenerationDone, GenerationFailed, GenerationRunning } from "../generation-panel";
import { useKitBuilder } from "../kit-builder-context";
import { useKitGeneration } from "../use-kit-generation";
import { KIT_STAGES } from "../stages";

const OUTPUT_SHORT_LABEL = { PDF: "PDF", PDF_ETIQUETADORA: "Etiquetadora", PNG: "PNG", JPG: "JPG" } as const;

export default function StageReview() {
	const router = useRouter();
	const { state, updatePiece, pieceItems, brand, setStage, back } = useKitBuilder();
	const { generation, start, reset } = useKitGeneration();
	const pieceCount = state.pecas.length;
	const inPromotion = pieceItems.filter((item) => item.promocao.emPromocao).length;

	if (generation.phase !== "IDLE") {
		return (
			<StageShell>
				<StageShell.Title icon={KIT_STAGES.review.icon} label={KIT_STAGES.review.title} description={KIT_STAGES.review.description} />
				{generation.phase === "RUNNING" ? <GenerationRunning generation={generation} /> : null}
				{generation.phase === "DONE" ? (
					<GenerationDone
						pieces={generation.pieces}
						onEdit={() => {
							reset();
							setStage("visual");
						}}
						onNewKit={() => router.push(appRoutes.channels.newVisualKit())}
					/>
				) : null}
				{generation.phase === "FAILED" ? <GenerationFailed message={generation.message} onRetry={() => void start()} onBack={reset} /> : null}
			</StageShell>
		);
	}

	return (
		<StageShell>
			<StageShell.Title icon={KIT_STAGES.review.icon} label={KIT_STAGES.review.title} description={KIT_STAGES.review.description} />
			<StageShell.Body className="gap-4">
				<ReviewCard title="Kit" onEdit={() => setStage("pieces")}>
					<div className="flex flex-col gap-0.5">
						<span className="text-base font-semibold tracking-tight">{state.kit.nome.trim() || "Sem nome"}</span>
						<span className="text-xs text-muted-foreground">
							{pieceCount === 1 ? "1 peça" : `${pieceCount} peças`} · mesmos produtos, preços e validade
						</span>
					</div>
					<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
						{state.pecas.map((piece) => {
							const format = VISUAL_KIT_FORMATS[piece.formato];
							const [width, height, radius] = format.thumbnail;
							return (
								<div key={piece.formato} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
									<span className="flex h-14 w-14 shrink-0 items-center justify-center">
										<span className="block bg-brand/80" style={{ width, height, borderRadius: radius }} />
									</span>
									<span className="flex min-w-0 flex-col">
										<span className="truncate text-xs font-semibold">{format.name}</span>
										<span className="truncate text-[11px] text-muted-foreground">{format.sizeLabel}</span>
										<span className="truncate text-[11px] text-muted-foreground">{describeVisualKitPiece(piece.formato, pieceItems.length)}</span>
									</span>
								</div>
							);
						})}
					</div>
				</ReviewCard>

				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<ReviewCard title="Produtos" onEdit={() => setStage("products")}>
						<span className="text-2xl font-bold tabular-nums">{pieceItems.length}</span>
						<ul className="flex flex-col gap-1">
							{pieceItems.slice(0, 3).map((item) => (
								<li key={item.chave} className="flex items-center gap-2 text-xs">
									<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
									<span className="truncate">{item.nome}</span>
								</li>
							))}
							{pieceItems.length > 3 ? (
								<li className="text-xs text-muted-foreground">{pieceItems.length - 3 === 1 ? "+1 outro" : `+${pieceItems.length - 3} outros`}</li>
							) : null}
						</ul>
					</ReviewCard>

					<ReviewCard title="Promoções" onEdit={() => setStage("price")}>
						<span className="flex items-baseline gap-1.5">
							<span className="text-2xl font-bold tabular-nums">{inPromotion}</span>
							<span className="text-xs text-muted-foreground">de {pieceItems.length} em promoção</span>
						</span>
						<div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
							{pieceItems.map((item) => (
								<span key={item.chave} className={cn("h-full flex-1", item.promocao.emPromocao ? "bg-green-600" : "bg-border")} />
							))}
						</div>
						<div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
							<span className="flex items-center gap-1">
								<span className="h-2 w-2 rounded-full bg-green-600" />
								Com De / Por <strong className="text-foreground">{inPromotion}</strong>
							</span>
							<span className="flex items-center gap-1">
								<span className="h-2 w-2 rounded-full bg-border" />
								Só preço atual <strong className="text-foreground">{pieceItems.length - inPromotion}</strong>
							</span>
						</div>
					</ReviewCard>

					<ReviewCard title="Validade" onEdit={() => setStage("price")}>
						<div className="flex items-center gap-3">
							<span className="flex flex-col items-center rounded-lg bg-brand px-3 py-1.5 text-brand-foreground">
								<span className="text-[9px] font-semibold tracking-wider">ATÉ</span>
								<span className="text-sm font-bold">{state.kit.validadeFim ? formatDateAsLocale(state.kit.validadeFim)?.slice(0, 5) : "—"}</span>
							</span>
							<span className="text-xs text-muted-foreground">
								{state.kit.validadeFim ? "Impressa em todas as peças, junto com “enquanto durarem os estoques”." : "Sem validade: as peças não mostram data."}
							</span>
						</div>
					</ReviewCard>

					<ReviewCard title="Marca">
						<div className="flex items-center gap-3">
							{brand.logoUrl ? (
								// biome-ignore lint/performance/noImgElement: logo da organização (URL externa do cadastro)
								<img src={brand.logoUrl} alt={brand.nome} className="h-10 w-10 rounded-xl object-cover" />
							) : (
								<span
									className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold"
									style={{ background: brand.corPrimaria, color: brand.corPrimariaForeground }}
								>
									{brand.nome.slice(0, 1).toUpperCase()}
								</span>
							)}
							<div className="flex min-w-0 flex-col gap-1">
								<span className="truncate text-sm font-semibold">{brand.nome}</span>
								<span className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
									<ColorDot color={brand.corPrimaria} label="Primária" />
									<ColorDot color={brand.corSecundaria} label="Secundária" />
								</span>
							</div>
						</div>
					</ReviewCard>
				</div>

				<section className="flex flex-col gap-2">
					<div className="flex items-center gap-1.5">
						<FileText className="h-4 w-4 opacity-70" />
						<h3 className="text-xs font-semibold tracking-tight">ARQUIVOS</h3>
					</div>
					<div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
						{state.pecas.map((piece) => {
							const format = VISUAL_KIT_FORMATS[piece.formato];
							const Icon = format.icon;
							const option = format.outputs.find((output) => output.id === piece.saida) ?? format.outputs[0];
							return (
								<div key={piece.formato} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
									<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
										<Icon className="h-4 w-4 opacity-85" />
									</span>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate text-xs font-semibold">{format.name}</span>
										<span className="truncate text-[11px] text-muted-foreground">{option.description}</span>
									</span>
									{format.outputs.length > 1 ? (
										<span className="flex items-center rounded-full bg-muted p-0.5">
											{format.outputs.map((output) => (
												<button
													key={output.id}
													type="button"
													onClick={() => updatePiece(piece.formato, { saida: output.id })}
													aria-pressed={piece.saida === output.id}
													className={cn(
														"rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
														piece.saida === output.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
													)}
												>
													{OUTPUT_SHORT_LABEL[output.id]}
												</button>
											))}
										</span>
									) : (
										<span className="rounded-full bg-muted px-3 py-1 text-[11px] font-semibold">{OUTPUT_SHORT_LABEL[option.id]}</span>
									)}
								</div>
							);
						})}
					</div>
					<p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
						<Info className="mt-0.5 h-3 w-3 shrink-0" />O kit fica salvo em Meus kits. Quando o preço de algum produto mudar, avisamos e você gera o kit
						atualizado sem montar de novo.
					</p>
				</section>
			</StageShell.Body>
			<StageShell.Footer
				onBack={back}
				isFinalStage
				finalLabel="GERAR KIT"
				onFinal={() => void start()}
				nextDisabled={pieceItems.length === 0}
				nextDisabledReason="Selecione ao menos um produto com preço."
			/>
		</StageShell>
	);
}

function ReviewCard({ title, onEdit, children }: { title: string; onEdit?: () => void; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
			<div className="flex items-center justify-between gap-2">
				<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
				{onEdit ? (
					<Button type="button" variant="ghost" size="sm" onClick={onEdit}>
						EDITAR
					</Button>
				) : null}
			</div>
			{children}
		</section>
	);
}

function ColorDot({ color, label }: { color: string; label: string }) {
	return (
		<span className="flex items-center gap-1">
			<span className="h-3 w-3 rounded-full border border-border" style={{ background: color }} />
			{label} <span className="font-mono uppercase">{color}</span>
		</span>
	);
}
