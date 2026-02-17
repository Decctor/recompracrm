import { CommunityLessonSchema } from "@/schemas/community";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

const InternalCommunityCourseLessonStateSchema = z.object({
	lesson: CommunityLessonSchema.omit({
		secaoId: true,
	}),
	videoHolder: z.object({
		file: z.instanceof(File).optional().nullable(),
		fileName: z.string().optional().nullable(),
		previewUrl: z.string().optional().nullable(),
	}),
});

type TInternalCommunityCourseLessonState = z.infer<typeof InternalCommunityCourseLessonStateSchema>;

type TUseInternalCommunityCourseLessonStateProps = {
	initialState?: Partial<TInternalCommunityCourseLessonState>;
};

export function useInternalCommunityCourseLessonState({ initialState }: TUseInternalCommunityCourseLessonStateProps = {}) {
	const normalizedInitialState = useMemo<TInternalCommunityCourseLessonState>(
		() => ({
			lesson: {
				titulo: initialState?.lesson?.titulo ?? "",
				descricao: initialState?.lesson?.descricao ?? "",
				tipoConteudo: initialState?.lesson?.tipoConteudo ?? "VIDEO",
				conteudoTexto: initialState?.lesson?.conteudoTexto ?? "",
				ordem: initialState?.lesson?.ordem ?? 0,
				muxMetadata: initialState?.lesson?.muxMetadata ?? {},
			},
			videoHolder: {
				file: initialState?.videoHolder?.file ?? null,
				fileName: initialState?.videoHolder?.fileName ?? null,
				previewUrl: initialState?.videoHolder?.previewUrl ?? null,
			},
		}),
		[initialState],
	);

	const [state, setState] = useState<TInternalCommunityCourseLessonState>(normalizedInitialState);

	const updateLesson = useCallback((lesson: Partial<TInternalCommunityCourseLessonState["lesson"]>) => {
		setState((prevState) => ({
			...prevState,
			lesson: {
				...prevState.lesson,
				...lesson,
			},
		}));
	}, []);

	const updateVideoHolder = useCallback((videoHolder: Partial<TInternalCommunityCourseLessonState["videoHolder"]>) => {
		setState((prevState) => ({
			...prevState,
			videoHolder: {
				...prevState.videoHolder,
				...videoHolder,
			},
		}));
	}, []);

	const redefineState = useCallback((newState: TInternalCommunityCourseLessonState) => {
		setState(newState);
	}, []);

	const resetState = useCallback(() => {
		setState(normalizedInitialState);
	}, [normalizedInitialState]);

	return {
		state,
		updateLesson,
		updateVideoHolder,
		redefineState,
		resetState,
	};
}

export type TUseInternalCommunityCourseLessonState = ReturnType<typeof useInternalCommunityCourseLessonState>;
