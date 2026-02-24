"use client";

import type { TUpdateCommunityMaterialInput } from "@/app/api/admin/community/materials/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Progress } from "@/components/ui/progress";
import { getErrorMessage } from "@/lib/errors";
import { inferFileContentKind } from "@/lib/files-storage";
import { updateCommunityMaterial as updateCommunityMaterialMutation } from "@/lib/mutations/community-admin";
import { useAdminCommunityMaterialById } from "@/lib/queries/community-admin";
import { type TMuxUploadStatus, uploadMuxVideoWithProgress } from "@/lib/uploads/mux-upload-with-progress";
import { type TSupabaseUploadStatus, uploadFileToSupabaseWithProgress } from "@/lib/uploads/supabase-upload-with-progress";
import { type TUseInternalCommunityMaterialState, useInternalCommunityMaterialState } from "@/state-hooks/use-internal-community-material-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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

type ControlCommunityMaterialProps = {
	materialId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdateCommunityMaterialInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export function ControlCommunityMaterial({ materialId, closeModal, callbacks }: ControlCommunityMaterialProps) {
	const queryClient = useQueryClient();
	const { data: material, queryKey, isLoading, error } = useAdminCommunityMaterialById({ materialId });
	const { state, updateCommunityMaterial, updateCommunityAsset, updateCommunityAssetFileHolder, redefineState } = useInternalCommunityMaterialState({
		initialState: {},
	});
	const [uploadProgress, setUploadProgress] = useState({
		status: "idle" as TMuxUploadStatus | TSupabaseUploadStatus,
		loadedBytes: 0,
		totalBytes: 0,
		progressPercent: 0,
		errorMessage: null as string | null,
	});

	useEffect(() => {
		if (!material) return;
		redefineState({
			communityMaterial: {
				titulo: material.titulo,
				descricao: material.descricao ?? "",
				tipo: material.tipo,
				status: material.status,
				capaUrl: material.capaUrl ?? null,
				resumo: material.resumo ?? "",
				tags: material.tags ?? [],
				metadadosEspecificos: material.metadadosEspecificos ?? null,
				ordem: material.ordem,
				categoriaId: material.categoriaId ?? null,
				dataPublicacao: material.dataPublicacao ?? undefined,
			},
			communityAsset: {
				tipo: material.asset?.tipo ?? "DOCUMENT",
				muxAssetId: material.asset?.muxAssetId ?? null,
				muxUploadId: material.asset?.muxUploadId ?? null,
				muxMetadata: material.asset?.muxMetadata ?? {},
				muxAssetStatus: material.asset?.muxAssetStatus ?? null,
				muxPlaybackId: material.asset?.muxPlaybackId ?? null,
				storagePath: material.asset?.storagePath ?? null,
				storageUrl: material.asset?.storageUrl ?? null,
				mimeType: material.asset?.mimeType ?? null,
				tamanhoBytes: material.asset?.tamanhoBytes ?? null,
			},
			communityAssetFileHolder: {
				file: null,
				previewUrl: null,
			},
		});
	}, [material, redefineState]);

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

	const { mutate: handleUpdateMaterialMutation, isPending } = useMutation({
		mutationKey: ["update-community-material", materialId],
		mutationFn: async (variables: TUseInternalCommunityMaterialState["state"]) => {
			if (!material) throw new Error("Material não encontrado.");
			if (!variables.communityMaterial.titulo.trim()) throw new Error("Informe o título do material.");

			const communityMaterial: TUpdateCommunityMaterialInput["communityMaterial"] = {
				...variables.communityMaterial,
				titulo: variables.communityMaterial.titulo.trim(),
				descricao: variables.communityMaterial.descricao?.trim() || null,
				resumo: variables.communityMaterial.resumo?.trim() || null,
			};

			const communityAsset: TUpdateCommunityMaterialInput["communityAsset"] = {
				...variables.communityAsset,
				titulo: variables.communityMaterial.titulo.trim(),
				tipo: variables.communityAsset.tipo ?? "DOCUMENT",
			};

			if (variables.communityAssetFileHolder.file) {
				const inferredAssetType = toCommunityAssetType(inferFileContentKind(variables.communityAssetFileHolder.file));
				const isVideoAsset = inferredAssetType === "VIDEO";
				communityAsset.tipo = inferredAssetType;

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
				} catch (uploadError) {
					setUploadProgress((prev) => ({
						...prev,
						status: "error",
						errorMessage: getErrorMessage(uploadError),
					}));
					throw uploadError;
				}
			}

			return await updateCommunityMaterialMutation({
				communityMaterialId: materialId,
				communityMaterial,
				communityAsset,
			});
		},
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey });
			if (callbacks?.onMutate)
				callbacks.onMutate({
					communityMaterialId: materialId,
					communityMaterial: variables.communityMaterial,
					communityAsset: variables.communityAsset,
				});
			return;
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(data.message);
			setUploadProgress({
				status: "idle",
				loadedBytes: 0,
				totalBytes: 0,
				progressPercent: 0,
				errorMessage: null,
			});
			closeModal();
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			await queryClient.invalidateQueries({ queryKey });
			await queryClient.invalidateQueries({ queryKey: ["admin-community-materials"] });
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="CONTROLAR MATERIAL"
			menuDescription="Edite os dados e o asset do material."
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={() =>
				handleUpdateMaterialMutation({
					communityMaterial: state.communityMaterial,
					communityAsset: state.communityAsset,
					communityAssetFileHolder: state.communityAssetFileHolder,
				})
			}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
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
