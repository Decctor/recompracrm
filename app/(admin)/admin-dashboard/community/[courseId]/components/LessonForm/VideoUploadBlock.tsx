"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";
import { requestMuxUploadUrl } from "@/lib/mutations/community-admin";
import { CheckCircle, CloudUpload, Loader2, UploadCloud, XCircle } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

type VideoUploadBlockProps = {
	onUploadComplete: (uploadId: string) => void;
};

type UploadStatus = "idle" | "requesting_url" | "uploading" | "done" | "error";

export default function VideoUploadBlock({ onUploadComplete }: VideoUploadBlockProps) {
	const [status, setStatus] = useState<UploadStatus>("idle");
	const [progress, setProgress] = useState(0);
	const [fileName, setFileName] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileSelect = useCallback(
		async (file: File) => {
			if (!file.type.startsWith("video/")) {
				toast.error("Por favor, selecione um arquivo de vídeo.");
				return;
			}

			setFileName(file.name);
			setStatus("requesting_url");
			setProgress(0);

			try {
				// Step 1: Get direct upload URL from our API
				const { data } = await requestMuxUploadUrl();

				setStatus("uploading");

				// Step 2: Upload directly to Mux
				const xhr = new XMLHttpRequest();

				xhr.upload.addEventListener("progress", (e) => {
					if (e.lengthComputable) {
						setProgress(Math.round((e.loaded / e.total) * 100));
					}
				});

				xhr.addEventListener("load", () => {
					if (xhr.status >= 200 && xhr.status < 300) {
						setStatus("done");
						onUploadComplete(data.uploadId);
						toast.success("Vídeo enviado com sucesso! Processamento iniciado.");
					} else {
						setStatus("error");
						toast.error("Erro no upload do vídeo.");
					}
				});

				xhr.addEventListener("error", () => {
					setStatus("error");
					toast.error("Erro de rede no upload.");
				});

				xhr.open("PUT", data.uploadUrl);
				xhr.send(file);
			} catch (error) {
				setStatus("error");
				toast.error(getErrorMessage(error));
			}
		},
		[onUploadComplete],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			const file = e.dataTransfer.files[0];
			if (file) handleFileSelect(file);
		},
		[handleFileSelect],
	);

	return (
		<div className="flex flex-col gap-2">
			<Label>Upload de vídeo</Label>

			{status === "idle" && (
				<div
					className="border-2 border-dashed border-primary/20 rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/[0.02] transition-colors"
					onDrop={handleDrop}
					onDragOver={(e) => e.preventDefault()}
					onClick={() => fileInputRef.current?.click()}
				>
					<UploadCloud className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
					<p className="text-sm font-medium">Arraste um vídeo ou clique para selecionar</p>
					<p className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM até 5GB</p>
					<input
						ref={fileInputRef}
						type="file"
						accept="video/*"
						className="hidden"
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) handleFileSelect(file);
						}}
					/>
				</div>
			)}

			{status === "requesting_url" && (
				<div className="border border-primary/20 rounded-lg p-6 text-center">
					<Loader2 className="w-6 h-6 mx-auto animate-spin text-primary mb-2" />
					<p className="text-sm text-muted-foreground">Preparando upload...</p>
				</div>
			)}

			{status === "uploading" && (
				<div className="border border-primary/20 rounded-lg p-4">
					<div className="flex items-center gap-3 mb-3">
						<CloudUpload className="w-5 h-5 text-primary animate-pulse" />
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium truncate">{fileName}</p>
							<p className="text-xs text-muted-foreground">Enviando... {progress}%</p>
						</div>
					</div>
					<div className="w-full bg-primary/10 rounded-full h-2">
						<div
							className="bg-primary h-2 rounded-full transition-all duration-300"
							style={{ width: `${progress}%` }}
						/>
					</div>
				</div>
			)}

			{status === "done" && (
				<div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4 flex items-center gap-3">
					<CheckCircle className="w-5 h-5 text-emerald-600" />
					<div className="flex-1">
						<p className="text-sm font-medium text-emerald-800">{fileName}</p>
						<p className="text-xs text-emerald-600">Upload concluído. O vídeo será processado em breve.</p>
					</div>
				</div>
			)}

			{status === "error" && (
				<div className="border border-destructive/20 bg-destructive/5 rounded-lg p-4">
					<div className="flex items-center gap-3">
						<XCircle className="w-5 h-5 text-destructive" />
						<div className="flex-1">
							<p className="text-sm font-medium text-destructive">Erro no upload</p>
							<p className="text-xs text-muted-foreground">Tente novamente.</p>
						</div>
						<Button variant="outline" size="sm" onClick={() => { setStatus("idle"); setProgress(0); }}>
							Tentar novamente
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
