import { CommunityCourseSectionSchema, CommunityLessonSchema } from "@/schemas/community";
import { useCallback, useMemo, useState } from "react";
import z from "zod";

const CommunityCourseSectionLessonStateSchema = CommunityLessonSchema.omit({
	secaoId: true,
}).extend({
	id: z
		.string({
			invalid_type_error: "Tipo não válido para o ID da aula.",
		})
		.optional(),
	deletar: z
		.boolean({
			invalid_type_error: "Tipo não válido para deletar a aula.",
		})
		.optional(),
	videoHolder: z.object({
		file: z.instanceof(File).optional().nullable(),
		fileName: z.string().optional().nullable(),
		previewUrl: z.string().optional().nullable(),
	}),
});

export const CommunityCourseSectionStateSchema = z.object({
	communityCourseSection: CommunityCourseSectionSchema.omit({
		cursoId: true,
		dataInsercao: true,
	}),
	communityCourseSectionLessons: z.array(CommunityCourseSectionLessonStateSchema),
});

type TCommunityCourseSectionState = z.infer<typeof CommunityCourseSectionStateSchema>;
type TCommunityCourseSectionLessonState = TCommunityCourseSectionState["communityCourseSectionLessons"][number];

type TUseInternalCommunityCourseSectionStateProps = {
	initialState?: Partial<TCommunityCourseSectionState>;
};

function createDefaultLesson(partialLesson?: Partial<TCommunityCourseSectionLessonState>): TCommunityCourseSectionLessonState {
	return {
		id: partialLesson?.id,
		deletar: partialLesson?.deletar,
		titulo: partialLesson?.titulo ?? "",
		descricao: partialLesson?.descricao ?? "",
		tipoConteudo: partialLesson?.tipoConteudo ?? "VIDEO",
		conteudoTexto: partialLesson?.conteudoTexto ?? "",
		ordem: partialLesson?.ordem ?? 0,
		duracaoSegundos: partialLesson?.duracaoSegundos ?? null,
		muxAssetId: partialLesson?.muxAssetId ?? null,
		muxPlaybackId: partialLesson?.muxPlaybackId ?? null,
		muxAssetStatus: partialLesson?.muxAssetStatus ?? null,
		muxUploadId: partialLesson?.muxUploadId ?? null,
		muxMetadata: partialLesson?.muxMetadata ?? {},
		dataInsercao: partialLesson?.dataInsercao ?? new Date(),
		videoHolder: {
			file: partialLesson?.videoHolder?.file ?? null,
			fileName: partialLesson?.videoHolder?.fileName ?? null,
			previewUrl: partialLesson?.videoHolder?.previewUrl ?? null,
		},
	};
}

export function useInternalCommunityCourseSectionState({ initialState }: TUseInternalCommunityCourseSectionStateProps = {}) {
	const normalizedInitialState = useMemo<TCommunityCourseSectionState>(
		() => ({
			communityCourseSection: {
				titulo: initialState?.communityCourseSection?.titulo ?? "",
				descricao: initialState?.communityCourseSection?.descricao ?? "",
				ordem: initialState?.communityCourseSection?.ordem ?? 0,
			},
			communityCourseSectionLessons: (initialState?.communityCourseSectionLessons ?? []).map((lesson, index) =>
				createDefaultLesson({
					...lesson,
					ordem: lesson.ordem ?? index,
				}),
			),
		}),
		[initialState],
	);

	const [state, setState] = useState<TCommunityCourseSectionState>(normalizedInitialState);

	const updateCommunityCourseSection = useCallback((section: Partial<TCommunityCourseSectionState["communityCourseSection"]>) => {
		setState((prevState) => ({
			...prevState,
			communityCourseSection: {
				...prevState.communityCourseSection,
				...section,
			},
		}));
	}, []);

	const addCommunityCourseSectionLesson = useCallback((lesson: Partial<TCommunityCourseSectionLessonState>) => {
		setState((prevState) => ({
			...prevState,
			communityCourseSectionLessons: [
				...prevState.communityCourseSectionLessons,
				createDefaultLesson({
					...lesson,
					ordem: lesson.ordem ?? prevState.communityCourseSectionLessons.length,
				}),
			],
		}));
	}, []);

	const updateCommunityCourseSectionLesson = useCallback(
		({ index, changes }: { index: number; changes: Partial<TCommunityCourseSectionLessonState> }) => {
			setState((prevState) => ({
				...prevState,
				communityCourseSectionLessons: prevState.communityCourseSectionLessons.map((lesson, lessonIndex) =>
					lessonIndex === index
						? createDefaultLesson({
								...lesson,
								...changes,
								videoHolder: {
									...lesson.videoHolder,
									...(changes.videoHolder ?? {}),
								},
							})
						: lesson,
				),
			}));
		},
		[],
	);

	const updateCommunityCourseSectionLessonVideoHolder = useCallback((index: number, videoHolder: Partial<TCommunityCourseSectionLessonState["videoHolder"]>) => {
		setState((prevState) => ({
			...prevState,
			communityCourseSectionLessons: prevState.communityCourseSectionLessons.map((lesson, lessonIndex) =>
				lessonIndex === index
					? {
							...lesson,
							videoHolder: {
								...lesson.videoHolder,
								...videoHolder,
							},
						}
					: lesson,
			),
		}));
	}, []);

	const removeCommunityCourseSectionLesson = useCallback((index: number) => {
		setState((prevState) => {
			const lesson = prevState.communityCourseSectionLessons[index];
			if (!lesson) return prevState;
			const isPersistedLesson = !!lesson.id;
			if (!isPersistedLesson) {
				return {
					...prevState,
					communityCourseSectionLessons: prevState.communityCourseSectionLessons
						.filter((_, lessonIndex) => lessonIndex !== index)
						.map((item, orderIndex) => ({ ...item, ordem: orderIndex })),
				};
			}
			return {
				...prevState,
				communityCourseSectionLessons: prevState.communityCourseSectionLessons.map((item, lessonIndex) =>
					lessonIndex === index ? { ...item, deletar: true } : item,
				),
			};
		});
	}, []);

	const redefineState = useCallback((newState: TCommunityCourseSectionState) => {
		setState(newState);
	}, []);

	const resetState = useCallback(() => {
		setState(normalizedInitialState);
	}, [normalizedInitialState]);

	return {
		state,
		updateCommunityCourseSection,
		addCommunityCourseSectionLesson,
		updateCommunityCourseSectionLesson,
		updateCommunityCourseSectionLessonVideoHolder,
		removeCommunityCourseSectionLesson,
		redefineState,
		resetState,
	};
}

export type TUseInternalCommunityCourseSectionState = ReturnType<typeof useInternalCommunityCourseSectionState>;
