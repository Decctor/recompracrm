"use client";

import { Button } from "@/components/ui/button";
import { uploadFile } from "@/lib/files-storage";
import { cn } from "@/lib/utils";
import {
	TEMPLATE_MEDIA_CONSTRAINTS,
	type TemplateMediaHeaderType,
	formatFileSize,
	getAcceptForHeaderType,
	validateTemplateMediaFile,
} from "@/lib/whatsapp/media-upload";
import { FileText, ImageIcon, Loader2, Upload, VideoIcon, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

type TemplateMediaUploadProps = {
	headerType: TemplateMediaHeaderType;
	currentUrl: string | null;
	onMediaUploaded: (url: string) => void;
	onMediaRemoved: () => void;
	organizationId: string;
	disabled?: boolean;
};

type UploadState = "idle" | "uploading" | "uploaded";

function TemplateMediaUpload({
	headerType,
	currentUrl,
	onMediaUploaded,
	onMediaRemoved,
	organizationId,
	disabled = false,
}: TemplateMediaUploadProps) {
	const [uploadState, setUploadState] = useState<UploadState>(currentUrl ? "uploaded" : "idle");
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const constraints = TEMPLATE_MEDIA_CONSTRAINTS[headerType];

	const handleFileSelect = useCallback(
		async (file: File) => {
			// Validate file
			const validation = validateTemplateMediaFile(file, headerType);
			if (!validation.valid) {
				toast.error(validation.error);
				return;
			}

			setUploadState("uploading");

			try {
				const result = await uploadFile({
					file,
					fileName: file.name,
					vinculationId: organizationId,
					prefix: "organizations",
				});

				onMediaUploaded(result.url);
				setUploadState("uploaded");
				toast.success("Arquivo enviado com sucesso!");
			} catch (error) {
				console.error("Error uploading file:", error);
				toast.error("Erro ao enviar arquivo. Tente novamente.");
				setUploadState("idle");
			}
		},
		[headerType, organizationId, onMediaUploaded],
	);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			handleFileSelect(file);
		}
		// Reset input
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const handleDragEnter = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!disabled && uploadState !== "uploading") {
			setIsDragging(true);
		}
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);

		if (disabled || uploadState === "uploading") return;

		const file = e.dataTransfer.files[0];
		if (file) {
			handleFileSelect(file);
		}
	};

	const handleRemove = () => {
		onMediaRemoved();
		setUploadState("idle");
	};

	const handleClick = () => {
		if (!disabled && uploadState !== "uploading") {
			fileInputRef.current?.click();
		}
	};

	const renderIcon = () => {
		if (headerType === "image") return <ImageIcon className="w-8 h-8 text-primary/50" />;
		if (headerType === "video") return <VideoIcon className="w-8 h-8 text-primary/50" />;
		return <FileText className="w-8 h-8 text-primary/50" />;
	};

	const renderPreview = () => {
		if (!currentUrl) return null;

		if (headerType === "image") {
			return (
				<div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gray-100">
					<img src={currentUrl} alt="Preview" className="w-full h-full object-cover" />
				</div>
			);
		}

		if (headerType === "video") {
			return (
				<div className="relative w-full aspect-video rounded-lg overflow-hidden bg-gray-100">
					<video src={currentUrl} className="w-full h-full object-cover" controls>
						<track kind="captions" />
					</video>
				</div>
			);
		}

		// Document
		return (
			<div className="w-full flex items-center gap-3 p-3 bg-gray-100 rounded-lg">
				<FileText className="w-8 h-8 text-red-500" />
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium truncate">Documento PDF</p>
					<a href={currentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
						Visualizar documento
					</a>
				</div>
			</div>
		);
	};

	return (
		<div className="w-full flex flex-col gap-2">
			<input
				ref={fileInputRef}
				type="file"
				accept={getAcceptForHeaderType(headerType)}
				onChange={handleInputChange}
				className="hidden"
				disabled={disabled || uploadState === "uploading"}
			/>

			{uploadState === "uploaded" && currentUrl ? (
				<div className="w-full flex flex-col gap-2">
					{renderPreview()}
					<Button type="button" variant="outline" size="sm" onClick={handleRemove} disabled={disabled} className="w-fit self-end">
						<X className="w-4 h-4 mr-1" />
						REMOVER
					</Button>
				</div>
			) : (
				<div
					onClick={handleClick}
					onDragEnter={handleDragEnter}
					onDragLeave={handleDragLeave}
					onDragOver={handleDragOver}
					onDrop={handleDrop}
					className={cn(
						"w-full flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
						isDragging ? "border-primary bg-primary/5" : "border-primary/30 hover:border-primary/50",
						disabled && "opacity-50 cursor-not-allowed",
						uploadState === "uploading" && "cursor-wait",
					)}
				>
					{uploadState === "uploading" ? (
						<>
							<Loader2 className="w-8 h-8 text-primary animate-spin" />
							<p className="text-sm text-primary/70">Enviando arquivo...</p>
						</>
					) : (
						<>
							{renderIcon()}
							<div className="flex flex-col items-center gap-1">
								<div className="flex items-center gap-1">
									<Upload className="w-4 h-4 text-primary/70" />
									<p className="text-sm font-medium text-primary/70">Clique ou arraste um arquivo</p>
								</div>
								<p className="text-xs text-primary/50">{constraints.description}</p>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}

export default TemplateMediaUpload;
