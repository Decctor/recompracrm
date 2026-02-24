import { CommunityTutorialSchema } from "@/schemas/community-pipeline";
import { useCallback, useState } from "react";
import z from "zod";

export const InternalCommunityTutorialStateSchema = z.object({
	communityTutorial: CommunityTutorialSchema.omit({
		assetId: true,
		dataInsercao: true,
		dataAtualizacao: true,
		autorId: true,
	}),
	communityAssetFileHolder: z.object({
		file: z.instanceof(File).optional().nullable(),
		previewUrl: z.string({ invalid_type_error: "Tipo não válido para a url do preview do arquivo do asset." }).optional().nullable(),
	}),
});

type TInternalCommunityTutorialState = z.infer<typeof InternalCommunityTutorialStateSchema>;

type TUseInternalCommunityTutorialStateProps = {
	initialState?: TInternalCommunityTutorialState;
};
export function useInternalCommunityTutorialState({ initialState }: TUseInternalCommunityTutorialStateProps = {}) {
	const initialStateInternal: TInternalCommunityTutorialState = {
		communityTutorial: {
			titulo: "",
			descricao: "",
			nivel: "INICIANTE",
			status: "RASCUNHO",
			tags: [],
			ordem: 0,
		},
		communityAssetFileHolder: {
			file: null,
			previewUrl: null,
		},
	};

	const [state, setState] = useState<TInternalCommunityTutorialState>(initialStateInternal);

	const updateCommunityTutorial = useCallback((communityTutorial: Partial<TInternalCommunityTutorialState["communityTutorial"]>) => {
		setState((prev) => ({
			...prev,
			communityTutorial: {
				...prev.communityTutorial,
				...communityTutorial,
			},
		}));
	}, []);

	const updateCommunityAssetFileHolder = useCallback(
		(communityAssetFileHolder: Partial<TInternalCommunityTutorialState["communityAssetFileHolder"]>) => {
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
		setState(initialStateInternal);
	}, []);

	const redefineState = useCallback((state: TInternalCommunityTutorialState) => {
		setState(state);
	}, []);

	return {
		state,
		updateCommunityTutorial,
		updateCommunityAssetFileHolder,
		resetState,
		redefineState,
	};
}
export type TUseInternalCommunityTutorialState = ReturnType<typeof useInternalCommunityTutorialState>;
