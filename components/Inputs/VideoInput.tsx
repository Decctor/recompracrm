"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { UploadCloud, Video, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { toast } from "sonner";

type VideoHolder = {
	file?: File | null;
	fileName?: string | null;
	previewUrl?: string | null;
};

type VideoInputProps = {
	label: string;
	videoHolder: VideoHolder;
	updateVideoHolder: (videoHolder: Partial<VideoHolder>) => void;
	labelClassName?: string;
	holderClassName?: string;
	hintText?: string;
};

function isBlobUrl(url: string | null | undefined) {
	return !!url && url.startsWith("blob:");
}

export default function VideoInput({
	label,
	videoHolder,
	updateVideoHolder,
	labelClassName,
	holderClassName,
	hintText = "O upload do vídeo será iniciado ao clicar em criar aula.",
}: VideoInputProps) {
	const inputId = useId();
	const inputRef = useRef<HTMLInputElement | null>(null);

	function openFilePicker() {
		inputRef.current?.click();
	}

	function clearVideo() {
		if (isBlobUrl(videoHolder.previewUrl)) URL.revokeObjectURL(videoHolder.previewUrl as string);
		updateVideoHolder({ file: null, fileName: null, previewUrl: null });
	}

	useEffect(() => {
		return () => {
			if (isBlobUrl(videoHolder.previewUrl)) URL.revokeObjectURL(videoHolder.previewUrl as string);
		};
	}, [videoHolder.previewUrl]);

	return (
		<div className={cn("flex w-full flex-col gap-1.5", holderClassName)}>
			<Label htmlFor={inputId} className={cn("text-sm font-medium tracking-tight text-primary/80", labelClassName)}>
				{label}
			</Label>

			<input
				ref={inputRef}
				id={inputId}
				type="file"
				accept="video/*"
				className="hidden"
				onChange={(event) => {
					const file = event.target.files?.[0] ?? null;
					if (!file) return clearVideo();
					if (!file.type.startsWith("video/")) {
						toast.error("Selecione um arquivo de vídeo válido.");
						return;
					}
					if (isBlobUrl(videoHolder.previewUrl)) URL.revokeObjectURL(videoHolder.previewUrl as string);
					updateVideoHolder({
						file,
						fileName: file.name,
						previewUrl: URL.createObjectURL(file),
					});
				}}
			/>

			{videoHolder.previewUrl ? (
				<div className="relative w-full overflow-hidden rounded-lg border border-primary/20 bg-card">
					<video className="h-[220px] w-full object-cover" controls src={videoHolder.previewUrl}>
						<track kind="captions" srcLang="pt-BR" label="Sem legendas disponíveis" />
					</video>
				</div>
			) : (
				<button
					type="button"
					onClick={openFilePicker}
					className="relative w-full cursor-pointer overflow-hidden rounded-lg border border-dashed border-primary/20 bg-card"
				>
					<div className="flex h-[220px] w-full flex-col items-center justify-center gap-2 bg-primary/5 text-muted-foreground">
						<UploadCloud className="h-7 w-7" />
						<p className="text-xs font-medium">SELECIONAR VÍDEO</p>
					</div>
				</button>
			)}

			<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
				<div className="flex min-w-0 items-center gap-1.5">
					<Video className="h-3.5 w-3.5 min-h-3.5 min-w-3.5" />
					<span className="truncate">{videoHolder.fileName ?? "Nenhum vídeo selecionado"}</span>
				</div>
				<div className="flex items-center gap-1">
					{videoHolder.file ? (
						<>
							<Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={openFilePicker}>
								Alterar
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 gap-1 px-2 text-destructive hover:text-destructive"
								onClick={clearVideo}
							>
								<X className="h-3.5 w-3.5" />
								Remover
							</Button>
						</>
					) : null}
				</div>
			</div>

			<p className="text-xs text-muted-foreground">{hintText}</p>
		</div>
	);
}
