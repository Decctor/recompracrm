"use client";

import SelectInput from "@/components/Inputs/SelectInput";
import VideoInput from "@/components/Inputs/VideoInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { TCommunityAssetTypeEnum } from "@/schemas/enums";
import type { TUseInternalCommunityMaterialState } from "@/state-hooks/use-internal-community-material-state";
import { FileUp, X } from "lucide-react";
import { useId, useRef } from "react";
import { toast } from "sonner";

const AssetTypeOptions: { id: number; value: TCommunityAssetTypeEnum; label: string }[] = [
	{ id: 1, value: "DOCUMENT", label: "DOCUMENTO" },
	{ id: 2, value: "VIDEO", label: "VÍDEO" },
	{ id: 3, value: "IMAGE", label: "IMAGEM" },
	{ id: 4, value: "AUDIO", label: "ÁUDIO" },
	{ id: 5, value: "TEXT", label: "TEXTO" },
];

type MaterialAssetBlockProps = {
	communityAsset: TUseInternalCommunityMaterialState["state"]["communityAsset"];
	communityAssetFileHolder: TUseInternalCommunityMaterialState["state"]["communityAssetFileHolder"];
	updateCommunityAsset: TUseInternalCommunityMaterialState["updateCommunityAsset"];
	updateCommunityAssetFileHolder: TUseInternalCommunityMaterialState["updateCommunityAssetFileHolder"];
};
export default function MaterialAssetBlock({
	communityAsset,
	communityAssetFileHolder,
	updateCommunityAsset,
	updateCommunityAssetFileHolder,
}: MaterialAssetBlockProps) {
	const inputId = useId();
	const inputRef = useRef<HTMLInputElement | null>(null);
	const isVideoAsset = communityAsset.tipo === "VIDEO";

	function openFilePicker() {
		inputRef.current?.click();
	}

	function clearFile() {
		updateCommunityAssetFileHolder({ file: null, previewUrl: null });
	}

	return (
		<ResponsiveMenuSection title="ASSET DO MATERIAL" icon={<FileUp className="h-4 min-h-4 w-4 min-w-4" />}>
			<SelectInput
				label="TIPO DO ASSET"
				value={communityAsset.tipo ?? "DOCUMENT"}
				resetOptionLabel="SELECIONE O TIPO DO ASSET"
				handleChange={(value) => updateCommunityAsset({ tipo: value as TCommunityAssetTypeEnum })}
				width="100%"
				options={AssetTypeOptions}
				onReset={() => updateCommunityAsset({ tipo: "DOCUMENT" })}
			/>

			{isVideoAsset ? (
				<VideoInput
					label="ARQUIVO DE VÍDEO"
					videoHolder={{
						file: communityAssetFileHolder.file,
						fileName: communityAssetFileHolder.file?.name ?? null,
						previewUrl: communityAssetFileHolder.previewUrl,
					}}
					updateVideoHolder={({ file, previewUrl }) => updateCommunityAssetFileHolder({ file: file ?? null, previewUrl: previewUrl ?? null })}
					hintText="O upload do vídeo será iniciado ao salvar o material."
				/>
			) : (
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={inputId} className="text-sm font-medium tracking-tight text-primary/80">
						ARQUIVO
					</Label>
					<input
						ref={inputRef}
						id={inputId}
						type="file"
						className="hidden"
						onChange={(event) => {
							const file = event.target.files?.[0] ?? null;
							if (!file) return clearFile();
							if (!file.type) {
								toast.error("Selecione um arquivo válido.");
								return;
							}
							updateCommunityAssetFileHolder({
								file,
								previewUrl: null,
							});
						}}
					/>
					<div className="flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 p-2">
						<span className="min-w-0 truncate text-xs text-muted-foreground">
							{communityAssetFileHolder.file?.name ?? "Nenhum arquivo selecionado"}
						</span>
						<div className="flex items-center gap-1">
							<Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={openFilePicker}>
								Selecionar
							</Button>
							{communityAssetFileHolder.file ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 gap-1 px-2 text-destructive hover:text-destructive"
									onClick={clearFile}
								>
									<X className="h-3.5 w-3.5" />
									Remover
								</Button>
							) : null}
						</div>
					</div>
					<p className="text-xs text-muted-foreground">O upload será iniciado ao salvar o material.</p>
				</div>
			)}
		</ResponsiveMenuSection>
	);
}
