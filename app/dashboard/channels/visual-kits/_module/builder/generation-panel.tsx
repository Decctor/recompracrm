"use client";

import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import { VISUAL_KIT_FORMATS } from "@/lib/visual-kits/formats";
import { downloadBlob, downloadVisualKitZip, kitZipName, type TGeneratedPiece } from "@/lib/visual-kits/generation";
import { Check, CircleAlert, Download, FileArchive, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useKitBuilder } from "./kit-builder-context";
import type { TKitGenerationState } from "./use-kit-generation";

function formatBytes(bytes: number) {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
	return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function pieceCountLabel(count: number) {
	return count === 1 ? "1 peça" : `${count} peças`;
}

export function GenerationRunning({ generation }: { generation: Extract<TKitGenerationState, { fase: "GERANDO" }> }) {
	const { state, marca } = useKitBuilder();
	const total = state.pecas.length;
	const promoCount = generation.itens.filter((item) => item.promocao.emPromocao).length;
	const currentFormat =
		generation.etapa === 2 && generation.detalhe ? VISUAL_KIT_FORMATS[generation.detalhe as keyof typeof VISUAL_KIT_FORMATS]?.nome : null;
	const steps = [
		{
			label: "Conferindo preços atuais",
			sub: generation.itens.length ? `${generation.itens.length} produtos · ${promoCount} em promoção` : "Buscando os preços de agora",
		},
		{ label: `Aplicando a marca de ${marca.nome}`, sub: "Logo, cor primária e secundária" },
		{
			label: `Montando ${pieceCountLabel(total)}`,
			sub: currentFormat ?? state.pecas.map((piece) => VISUAL_KIT_FORMATS[piece.formato].nome).join(" · "),
		},
		{ label: "Enviando os arquivos", sub: generation.etapa === 3 ? (generation.detalhe ?? "") : "Para ficarem salvos em Meus kits" },
	];

	return (
		<div className="flex flex-col items-center gap-6 py-6">
			<div className="flex flex-col items-center gap-3 text-center">
				<LoaderCircle className="h-11 w-11 animate-spin text-brand" />
				<h3 className="text-lg font-semibold tracking-tight">Gerando {pieceCountLabel(total)}…</h3>
				<p className="max-w-md text-xs text-muted-foreground">Os arquivos são montados aqui no navegador. Mantenha esta aba aberta até terminar.</p>
			</div>
			<div className="flex w-full max-w-xl flex-col gap-2">
				<div className="flex items-center justify-between text-xs">
					<span className="font-medium">Progresso</span>
					<span className="tabular-nums text-muted-foreground">{Math.round(generation.progresso * 100)}%</span>
				</div>
				<div className="h-2 w-full overflow-hidden rounded-full bg-brand/15">
					<div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.round(generation.progresso * 100)}%` }} />
				</div>
				<div className="flex flex-wrap items-center gap-1.5 pt-1">
					{state.pecas.map((piece, index) => {
						const Icon = VISUAL_KIT_FORMATS[piece.formato].icone;
						const done = index < generation.pecasProntas;
						return (
							<span
								key={piece.formato}
								title={VISUAL_KIT_FORMATS[piece.formato].nome}
								className={cn(
									"flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
									done ? "border-brand bg-brand text-brand-foreground" : "border-dashed border-border bg-background text-muted-foreground",
								)}
							>
								{done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5 opacity-50" />}
							</span>
						);
					})}
					<span className="ml-1 text-[11px] text-muted-foreground">
						{generation.pecasProntas} de {total} peças montadas
					</span>
				</div>
			</div>
			<ol className="flex w-full max-w-xl flex-col gap-1">
				{steps.map((step, index) => {
					const isDone = index < generation.etapa;
					const isActive = index === generation.etapa;
					return (
						<li key={step.label} className={cn("flex items-center gap-3 rounded-lg px-3 py-2", isActive && "bg-brand/5")}>
							<span
								className={cn(
									"flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
									isDone ? "bg-brand text-brand-foreground" : isActive ? "" : "border border-border",
								)}
							>
								{isDone ? <Check className="h-3 w-3" /> : isActive ? <LoaderCircle className="h-4 w-4 animate-spin text-brand" /> : null}
							</span>
							<span className="flex min-w-0 flex-col">
								<span className={cn("text-sm", isActive ? "font-semibold" : "font-medium", !isDone && !isActive && "text-muted-foreground")}>
									{step.label}
								</span>
								{step.sub ? <span className="truncate text-[11px] text-muted-foreground">{step.sub}</span> : null}
							</span>
						</li>
					);
				})}
			</ol>
		</div>
	);
}

export function GenerationDone({ pecas, onEdit, onNewKit }: { pecas: TGeneratedPiece[]; onEdit: () => void; onNewKit: () => void }) {
	const { state, pieceItems } = useKitBuilder();
	const [zipping, setZipping] = useState(false);
	const kitName = state.kit.nome.trim() || "Sem nome";
	const zipName = kitZipName(kitName);
	const allFiles = pecas.flatMap((piece) => piece.arquivos);
	const totalBytes = allFiles.reduce((sum, file) => sum + file.blob.size, 0);

	async function downloadAll() {
		setZipping(true);
		try {
			await downloadVisualKitZip({ zipName, arquivos: allFiles.map((file) => ({ pasta: file.pasta, nome: file.nome, source: file.blob })) });
		} catch (error) {
			toast.error(getErrorMessage(error));
		} finally {
			setZipping(false);
		}
	}

	async function downloadPiece(piece: TGeneratedPiece) {
		if (piece.arquivos.length === 1) return downloadBlob(piece.arquivos[0].blob, piece.arquivos[0].nome);
		const folder = piece.arquivos[0]?.pasta ?? "pecas";
		await downloadVisualKitZip({
			zipName: `${folder}.zip`,
			arquivos: piece.arquivos.map((file) => ({ pasta: "", nome: file.nome, source: file.blob })),
		}).catch((error) => toast.error(getErrorMessage(error)));
	}

	return (
		<div className="flex flex-col items-center gap-6 py-6">
			<div className="flex flex-col items-center gap-2 text-center">
				<span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-green-600 animate-in zoom-in-50 duration-300 dark:text-green-400">
					<Check className="h-7 w-7" />
				</span>
				<h3 className="text-lg font-semibold tracking-tight">Kit pronto</h3>
				<p className="text-xs text-muted-foreground">
					{pieceCountLabel(pecas.length)} · salvo em Meus kits como “{kitName}”.
				</p>
			</div>

			<div className="flex w-full max-w-2xl flex-col gap-3">
				<div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-4">
					<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
						<FileArchive className="h-5 w-5" />
					</span>
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate text-sm font-semibold">{zipName}</span>
						<span className="text-[11px] text-muted-foreground">
							{pieceCountLabel(pecas.length)} · {formatBytes(totalBytes)}
						</span>
					</span>
					<Button type="button" variant="brand" onClick={() => void downloadAll()} disabled={zipping}>
						{zipping ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
						BAIXAR TUDO
					</Button>
				</div>

				<div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
					{pecas.map((piece) => {
						const format = VISUAL_KIT_FORMATS[piece.formato];
						const Icon = format.icone;
						const bytes = piece.arquivos.reduce((sum, file) => sum + file.blob.size, 0);
						const single = piece.arquivos.length === 1;
						return (
							<div key={piece.formato} className="flex items-center gap-3 px-4 py-3">
								<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
									<Icon className="h-4 w-4 opacity-85" />
								</span>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-xs font-semibold">{format.nome}</span>
									<span className="truncate text-[11px] text-muted-foreground">
										{single ? piece.arquivos[0].nome : `${piece.arquivos.length} arquivos`} · {formatBytes(bytes)}
									</span>
								</span>
								<Button type="button" variant="ghost" size="sm" onClick={() => void downloadPiece(piece)}>
									<Download className="h-3.5 w-3.5" />
									BAIXAR
								</Button>
							</div>
						);
					})}
				</div>

				<p className="text-center text-[11px] text-muted-foreground">
					Em Meus kits, avisamos quando o preço de algum destes {pieceItems.length} produtos mudar. Aí é só gerar o kit de novo.
				</p>
			</div>

			<div className="flex flex-wrap items-center justify-center gap-2">
				<Button type="button" variant="outline" onClick={onEdit}>
					EDITAR ESTE KIT
				</Button>
				<Button type="button" variant="outline" onClick={onNewKit}>
					CRIAR OUTRO KIT
				</Button>
				<Button type="button" asChild>
					<Link href={appRoutes.channels.visualKits()}>VER MEUS KITS</Link>
				</Button>
			</div>
		</div>
	);
}

export function GenerationFailed({ message, onRetry, onBack }: { message: string; onRetry: () => void; onBack: () => void }) {
	return (
		<div className="flex flex-col items-center gap-4 py-10 text-center">
			<span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
				<CircleAlert className="h-6 w-6" />
			</span>
			<div className="flex flex-col gap-1">
				<h3 className="text-base font-semibold">Não foi possível gerar o kit</h3>
				<p className="max-w-md text-xs text-muted-foreground">{message}</p>
			</div>
			<div className="flex gap-2">
				<Button type="button" variant="outline" onClick={onBack}>
					VOLTAR PARA A REVISÃO
				</Button>
				<Button type="button" onClick={onRetry}>
					<RefreshCw className="h-4 w-4" />
					TENTAR DE NOVO
				</Button>
			</div>
		</div>
	);
}
