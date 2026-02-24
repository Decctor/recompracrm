"use client";

import type { TCreateCommunityMaterialInput } from "@/app/api/admin/community/materials/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Progress } from "@/components/ui/progress";
import { getErrorMessage } from "@/lib/errors";
import { inferFileContentKind } from "@/lib/files-storage";
import { createCommunityMaterial } from "@/lib/mutations/community-admin";
import { type TMuxUploadStatus, uploadMuxVideoWithProgress } from "@/lib/uploads/mux-upload-with-progress";
import { type TSupabaseUploadStatus, uploadFileToSupabaseWithProgress } from "@/lib/uploads/supabase-upload-with-progress";
import { type TUseInternalCommunityMaterialState, useInternalCommunityMaterialState } from "@/state-hooks/use-internal-community-material-state";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import MaterialAssetBlock from "./Blocks/Asset";
import MaterialGeneralBlock from "./Blocks/General";

function toCommunityAssetType(contentKind: ReturnType<typeof inferFileContentKind>): "VIDEO" | "IMAGE" | "AUDIO" | "TEXT" | "DOCUMENT" {
	if (contentKind === "video") return "VIDEO";
	if (contentKind === "image") return "IMAGE";
	if (contentKind === "audio") return "AUDIO";
	if (contentKind === "text") return "TEXT";
	return "DOCUMENT";
}

type NewCommunityMaterialProps = {
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TCreateCommunityMaterialInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export function NewCommunityMaterial({ closeModal, callbacks }: NewCommunityMaterialProps) {
	const { state, updateCommunityMaterial, updateCommunityAsset, updateCommunityAssetFileHolder, resetState } = useInternalCommunityMaterialState({
		initialState: {},
	});
	const [uploadProgress, setUploadProgress] = useState({
		status: "idle" as TMuxUploadStatus | TSupabaseUploadStatus,
		loadedBytes: 0,
		totalBytes: 0,
		progressPercent: 0,
		errorMessage: null as string | null,
	});

	const hasSelectedFile = !!state.communityAssetFileHolder.file;

	const uploadStatusLabelByStatus: Record<TMuxUploadStatus | TSupabaseUploadStatus, string> = useMemo(
		() => ({
			idle: "Aguardando envio.",
			preparing: "Preparando upload...",
			uploading: "Enviando arquivo...",
			success: "Upload concluído.",
			error: "Falha no upload.",
		}),
		[],
	);

	const { mutate: handleCreateMaterialMutation, isPending } = useMutation({
		mutationKey: ["create-community-material"],
		mutationFn: async (variables: TUseInternalCommunityMaterialState["state"]) => {
			if (!variables.communityMaterial.titulo.trim()) throw new Error("Informe o título do material.");
			if (!variables.communityAssetFileHolder.file) throw new Error("Selecione um arquivo para o asset.");

			const inferredAssetType = toCommunityAssetType(inferFileContentKind(variables.communityAssetFileHolder.file));
			const isVideoAsset = inferredAssetType === "VIDEO";

			const communityMaterial: TCreateCommunityMaterialInput["communityMaterial"] = {
				...variables.communityMaterial,
				titulo: variables.communityMaterial.titulo.trim(),
				descricao: variables.communityMaterial.descricao?.trim() || null,
				resumo: variables.communityMaterial.resumo?.trim() || null,
			};
			const communityAsset: NonNullable<TCreateCommunityMaterialInput["communityAsset"]> = {
				...variables.communityAsset,
				titulo: variables.communityMaterial.titulo.trim(),
				tipo: inferredAssetType,
				statusPipeline: "PENDENTE",
			};

			setUploadProgress({
				status: "idle",
				loadedBytes: 0,
				totalBytes: variables.communityAssetFileHolder.file.size,
				progressPercent: 0,
				errorMessage: null,
			});

			try {
				if (isVideoAsset) {
					const muxUploadId = await uploadMuxVideoWithProgress({
						file: variables.communityAssetFileHolder.file,
						onStatusChange: (status) => setUploadProgress((prev) => ({ ...prev, status })),
						onProgress: ({ loadedBytes, totalBytes, progressPercent }) =>
							setUploadProgress((prev) => ({ ...prev, loadedBytes, totalBytes, progressPercent })),
					});

					communityAsset.muxUploadId = muxUploadId;
					communityAsset.muxAssetStatus = "AGUARDANDO";
				} else {
					const uploadedFile = await uploadFileToSupabaseWithProgress({
						file: variables.communityAssetFileHolder.file,
						fileName: variables.communityAssetFileHolder.file.name || variables.communityMaterial.titulo || "material",
						prefix: "community-materials",
						onStatusChange: (status) => setUploadProgress((prev) => ({ ...prev, status })),
						onProgress: ({ loadedBytes, totalBytes, progressPercent }) =>
							setUploadProgress((prev) => ({ ...prev, loadedBytes, totalBytes, progressPercent })),
					});

					communityAsset.storagePath = uploadedFile.storagePath;
					communityAsset.storageUrl = uploadedFile.storageUrl;
					communityAsset.mimeType = uploadedFile.mimeType;
					communityAsset.tamanhoBytes = uploadedFile.tamanhoBytes;
				}
			} catch (error) {
				setUploadProgress((prev) => ({ ...prev, status: "error", errorMessage: getErrorMessage(error) }));
				throw error;
			}

			return await createCommunityMaterial({
				communityMaterial,
				communityAsset,
			});
		},
		onMutate: async (variables) => {
			if (callbacks?.onMutate) callbacks.onMutate(variables);
			return;
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(data.message);
			resetState();
			setUploadProgress({
				status: "idle",
				loadedBytes: 0,
				totalBytes: 0,
				progressPercent: 0,
				errorMessage: null,
			});
			return closeModal();
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError(error);
			return toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			return;
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVO MATERIAL"
			menuDescription="Preencha os dados para criar um novo material."
			menuActionButtonText="CRIAR MATERIAL"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleCreateMaterialMutation(state)}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			lockClose={isPending}
		>
			{hasSelectedFile && (uploadProgress.status !== "idle" || uploadProgress.errorMessage) ? (
				<div className="flex w-full flex-col gap-1 rounded-md border border-primary/20 bg-primary/5 p-2">
					<p className="text-xs font-medium">{uploadStatusLabelByStatus[uploadProgress.status]}</p>
					<Progress value={uploadProgress.progressPercent} className="h-2 w-full" />
					<p className="text-[0.7rem] text-muted-foreground">
						{uploadProgress.progressPercent}% ({uploadProgress.loadedBytes} / {uploadProgress.totalBytes} bytes)
					</p>
					{uploadProgress.errorMessage ? <p className="text-[0.7rem] text-destructive">{uploadProgress.errorMessage}</p> : null}
				</div>
			) : null}

			<MaterialGeneralBlock communityMaterial={state.communityMaterial} updateCommunityMaterial={updateCommunityMaterial} />
			<MaterialAssetBlock
				communityAsset={state.communityAsset}
				communityAssetFileHolder={state.communityAssetFileHolder}
				updateCommunityAsset={updateCommunityAsset}
				updateCommunityAssetFileHolder={updateCommunityAssetFileHolder}
			/>
		</ResponsiveMenu>
	);
}
