import { CommunityAssetSchema, CommunityMaterialSchema } from "@/schemas/community-pipeline";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

export const InternalCommunityMaterialStateSchema = z.object({
	communityMaterial: CommunityMaterialSchema.omit({
		assetId: true,
		dataInsercao: true,
		dataAtualizacao: true,
		autorId: true,
	}),
	communityAsset: CommunityAssetSchema.pick({
		tipo: true,
		muxAssetId: true,
		muxUploadId: true,
		muxMetadata: true,
		muxAssetStatus: true,
		muxPlaybackId: true,

		storagePath: true,
		storageUrl: true,
		mimeType: true,
		tamanhoBytes: true,
	}),
	communityAssetFileHolder: z.object({
		file: z.instanceof(File).optional().nullable(),
		previewUrl: z.string({ invalid_type_error: "Tipo não válido para a url do preview do arquivo do asset." }).optional().nullable(),
	}),
});
type TInternalCommunityMaterialState = z.infer<typeof InternalCommunityMaterialStateSchema>;

type TUseInternalCommunityMaterialStateProps = {
	initialState?: Partial<TInternalCommunityMaterialState>;
};
export function useInternalCommunityMaterialState({ initialState }: TUseInternalCommunityMaterialStateProps = {}) {
	const normalizedInitialState = useMemo<TInternalCommunityMaterialState>(
		() => ({
			communityMaterial: {
				titulo: initialState?.communityMaterial?.titulo ?? "",
				descricao: initialState?.communityMaterial?.descricao ?? "",
				tipo: initialState?.communityMaterial?.tipo ?? "EBOOK",
				status: initialState?.communityMaterial?.status ?? "RASCUNHO",
				capaUrl: initialState?.communityMaterial?.capaUrl ?? null,
				resumo: initialState?.communityMaterial?.resumo ?? "",
				tags: initialState?.communityMaterial?.tags ?? [],
				metadadosEspecificos: initialState?.communityMaterial?.metadadosEspecificos ?? null,
				ordem: initialState?.communityMaterial?.ordem ?? 0,
				categoriaId: initialState?.communityMaterial?.categoriaId ?? null,
				dataPublicacao: initialState?.communityMaterial?.dataPublicacao ?? undefined,
			},
			communityAsset: {
				tipo: initialState?.communityAsset?.tipo ?? "DOCUMENT",
				muxAssetId: initialState?.communityAsset?.muxAssetId ?? null,
				muxUploadId: initialState?.communityAsset?.muxUploadId ?? null,
				muxMetadata: initialState?.communityAsset?.muxMetadata ?? {},
				muxAssetStatus: initialState?.communityAsset?.muxAssetStatus ?? null,
				muxPlaybackId: initialState?.communityAsset?.muxPlaybackId ?? null,
				storagePath: initialState?.communityAsset?.storagePath ?? null,
				storageUrl: initialState?.communityAsset?.storageUrl ?? null,
				mimeType: initialState?.communityAsset?.mimeType ?? null,
				tamanhoBytes: initialState?.communityAsset?.tamanhoBytes ?? null,
			},
			communityAssetFileHolder: {
				file: initialState?.communityAssetFileHolder?.file ?? null,
				previewUrl: initialState?.communityAssetFileHolder?.previewUrl ?? null,
			},
		}),
		[initialState],
	);

	const [state, setState] = useState<TInternalCommunityMaterialState>(normalizedInitialState);

	const updateCommunityMaterial = useCallback((communityMaterial: Partial<TInternalCommunityMaterialState["communityMaterial"]>) => {
		setState((prev) => ({
			...prev,
			communityMaterial: {
				...prev.communityMaterial,
				...communityMaterial,
			},
		}));
	}, []);

	const updateCommunityAsset = useCallback((communityAsset: Partial<TInternalCommunityMaterialState["communityAsset"]>) => {
		setState((prev) => ({
			...prev,
			communityAsset: {
				...prev.communityAsset,
				...communityAsset,
			},
		}));
	}, []);

	const updateCommunityAssetFileHolder = useCallback(
		(communityAssetFileHolder: Partial<TInternalCommunityMaterialState["communityAssetFileHolder"]>) => {
			setState((prev) => ({
				...prev,
				communityAssetFileHolder: {
					...prev.communityAssetFileHolder,
					...communityAssetFileHolder,
				},
			}));
		},
		[],
	);

	const resetState = useCallback(() => {
		setState(normalizedInitialState);
	}, [normalizedInitialState]);

	const redefineState = useCallback((state: TInternalCommunityMaterialState) => {
		setState(state);
	}, []);

	return {
		state,
		updateCommunityMaterial,
		updateCommunityAsset,
		updateCommunityAssetFileHolder,
		resetState,
		redefineState,
	};
}
export type TUseInternalCommunityMaterialState = ReturnType<typeof useInternalCommunityMaterialState>;
