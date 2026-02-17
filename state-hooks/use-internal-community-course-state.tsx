import { CommunityCourseSchema, CommunityCourseSectionSchema } from "@/schemas/community";
import { useCallback, useState } from "react";
import z from "zod";

export const CommunityCourseStateSchema = z.object({
	communityCourse: CommunityCourseSchema.omit({
		dataInsercao: true,
		dataPublicacao: true,
		autorId: true,
	}),
	communityCourseSections: z.array(
		CommunityCourseSectionSchema.omit({
			cursoId: true,
			dataInsercao: true,
		}).extend({
			id: z
				.string({
					invalid_type_error: "Tipo não válido para o ID da seção do curso.",
				})
				.optional()
				.nullable(),
			deletar: z
				.boolean({
					required_error: "Deletar seção do curso não informado.",
					invalid_type_error: "Tipo não válido para deletar seção do curso.",
				})
				.optional()
				.nullable(),
		}),
	),
});
type TCommunityCourseState = z.infer<typeof CommunityCourseStateSchema>;

type TUseInternalCommunityCourseStateProps = {
	initialState: Partial<TCommunityCourseState>;
};
export function useInternalCommunityCourseState({ initialState }: TUseInternalCommunityCourseStateProps) {
	const [state, setState] = useState<TCommunityCourseState>({
		communityCourse: {
			titulo: initialState.communityCourse?.titulo ?? "",
			nivelAcesso: initialState.communityCourse?.nivelAcesso ?? "PUBLICO",
			status: initialState.communityCourse?.status ?? "RASCUNHO",
			ordem: initialState.communityCourse?.ordem ?? 0,
			descricao: initialState.communityCourse?.descricao ?? "",
			thumbnailUrl: initialState.communityCourse?.thumbnailUrl ?? "",
		},
		communityCourseSections: initialState.communityCourseSections ?? [],
	});

	const updateCommunityCourse = useCallback((communityCourse: Partial<TCommunityCourseState["communityCourse"]>) => {
		setState((prevState) => ({
			...prevState,
			communityCourse: {
				...prevState.communityCourse,
				...communityCourse,
			},
		}));
	}, []);
	const addCommunityCourseSection = useCallback((communityCourseSection: TCommunityCourseState["communityCourseSections"][number]) => {
		setState((prevState) => ({
			...prevState,
			communityCourseSections: [...prevState.communityCourseSections, communityCourseSection],
		}));
	}, []);
	const updateCommunityCourseSection = useCallback(
		({ index, changes }: { index: number; changes: Partial<TCommunityCourseState["communityCourseSections"][number]> }) => {
			setState((prevState) => ({
				...prevState,
				communityCourseSections: prevState.communityCourseSections.map((section, i) => (i === index ? { ...section, ...changes } : section)),
			}));
		},
		[],
	);
	const removeCommunityCourseSection = useCallback((index: number) => {
		setState((prev) => {
			// Validating existence (id defined)
			const isExistingRemoveItem = prev.communityCourseSections.find((section, i) => i === index && !!section.id);
			if (!isExistingRemoveItem)
				// If not an existing instance, just filtering it out
				return { ...prev, communityCourseSections: prev.communityCourseSections.filter((_, i) => i !== index) };
			// Else, marking it with a deletar flag
			return {
				...prev,
				communityCourseSections: prev.communityCourseSections.map((item, i) => (i === index ? { ...item, deletar: true } : item)),
			};
		});
	}, []);

	const redefineState = useCallback((state: TCommunityCourseState) => {
		setState(state);
	}, []);

	const resetState = useCallback(() => {
		setState({
			communityCourse: {
				titulo: initialState.communityCourse?.titulo ?? "",
				nivelAcesso: initialState.communityCourse?.nivelAcesso ?? "PUBLICO",
				status: initialState.communityCourse?.status ?? "RASCUNHO",
				ordem: initialState.communityCourse?.ordem ?? 0,
				descricao: initialState.communityCourse?.descricao ?? "",
				thumbnailUrl: initialState.communityCourse?.thumbnailUrl ?? "",
			},
			communityCourseSections: initialState.communityCourseSections ?? [],
		});
	}, [initialState]);
	return {
		state,
		updateCommunityCourse,
		addCommunityCourseSection,
		updateCommunityCourseSection,
		removeCommunityCourseSection,
		redefineState,
		resetState,
	};
}
export type TUseInternalCommunityCourseState = ReturnType<typeof useInternalCommunityCourseState>;
