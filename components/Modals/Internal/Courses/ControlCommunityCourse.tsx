"use client";

import type { TUpdateCommunityCourseInput } from "@/app/api/admin/community/courses/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/files-storage";
import { updateCommunityCourse as updateCommunityCourseMutation } from "@/lib/mutations/community-admin";
import { useAdminCommunityCourseById } from "@/lib/queries/community-admin";
import { useInternalCommunityCourseState } from "@/state-hooks/use-internal-community-course-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import CommunityCourseGeneralBlock from "./Blocks/General";

type ControlCommunityCourseProps = {
	courseId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdateCommunityCourseInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export function ControlCommunityCourse({ courseId, closeModal, callbacks }: ControlCommunityCourseProps) {
	const queryClient = useQueryClient();
	const { data: course, queryKey, isLoading, error } = useAdminCommunityCourseById({ courseId });
	const { state, updateCommunityCourse, updateCommunityCourseThumbnailHolder, redefineState } = useInternalCommunityCourseState({ initialState: {} });

	useEffect(() => {
		if (!course) return;
		redefineState({
			communityCourse: {
				titulo: course.titulo,
				descricao: course.descricao ?? "",
				thumbnailUrl: course.thumbnailUrl ?? "",
				nivelAcesso: course.nivelAcesso,
				status: course.status,
				ordem: course.ordem,
			},
			communityCourseSections: [],
			communityCourseThumbnailHolder: {
				file: null,
				previewUrl: null,
			},
		});
	}, [course, redefineState]);

	const { mutate: handleControlCommunityCourseMutation, isPending } = useMutation({
		mutationKey: ["update-community-course", courseId],
		mutationFn: async (variables: TUpdateCommunityCourseInput) => {
			if (!state.communityCourse.titulo.trim()) throw new Error("Informe o título do curso.");

			let courseThumbnailUrl = state.communityCourse.thumbnailUrl?.trim() || null;
			if (state.communityCourseThumbnailHolder.file) {
				const { url } = await uploadFile({
					file: state.communityCourseThumbnailHolder.file,
					fileName: state.communityCourse.titulo || "thumbnail-curso",
				});
				courseThumbnailUrl = url;
			}

			return await updateCommunityCourseMutation({
				communityCourseId: variables.communityCourseId,
				communityCourse: {
					titulo: state.communityCourse.titulo.trim(),
					descricao: state.communityCourse.descricao?.trim() || null,
					thumbnailUrl: courseThumbnailUrl,
					nivelAcesso: state.communityCourse.nivelAcesso,
					status: state.communityCourse.status,
					ordem: state.communityCourse.ordem,
				},
				communityCourseSections: [],
			});
		},
		onMutate: async (variables) => {
			await queryClient.cancelQueries({ queryKey });
			if (callbacks?.onMutate) callbacks.onMutate(variables);
			return;
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(data.message);
			closeModal();
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			await queryClient.invalidateQueries({ queryKey });
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="CONTROLAR CURSO"
			menuDescription="Atualize as informações principais do curso."
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleControlCommunityCourseMutation({ communityCourseId: courseId, communityCourse: {}, communityCourseSections: [] })}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeModal}
		>
			<CommunityCourseGeneralBlock
				communityCourse={state.communityCourse}
				updateCommunityCourse={updateCommunityCourse}
				communityCourseThumbnailHolder={state.communityCourseThumbnailHolder}
				updateCommunityCourseThumbnailHolder={updateCommunityCourseThumbnailHolder}
			/>
		</ResponsiveMenu>
	);
}
