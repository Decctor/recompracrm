"use client";

import type { TUpdateCommunityLessonInput } from "@/app/api/admin/community/lessons/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { requestMuxUploadUrl, updateCommunityLesson } from "@/lib/mutations/community-admin";
import { useAdminCommunityLessonById } from "@/lib/queries/community-admin";
import { useInternalCommunityCourseLessonState } from "@/state-hooks/use-internal-community-course-lesson-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import LessonContentBlock from "./Blocks/Content";
import LessonGeneralBlock from "./Blocks/General";

type ControlCommunityCourseLessonProps = {
	lessonId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TUpdateCommunityLessonInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function ControlCommunityCourseLesson({ lessonId, closeModal, callbacks }: ControlCommunityCourseLessonProps) {
	const queryClient = useQueryClient();
	const { state, updateLesson, updateVideoHolder, redefineState } = useInternalCommunityCourseLessonState();
	const { data: lesson, queryKey, isLoading, error } = useAdminCommunityLessonById({ lessonId });

	const showVideoUpload = state.lesson.tipoConteudo === "VIDEO" || state.lesson.tipoConteudo === "VIDEO_TEXTO";
	const showTextContent = state.lesson.tipoConteudo === "TEXTO" || state.lesson.tipoConteudo === "VIDEO_TEXTO";

	useEffect(() => {
		if (!lesson) return;
		redefineState({
			lesson: {
				titulo: lesson.titulo,
				descricao: lesson.descricao ?? "",
				tipoConteudo: lesson.tipoConteudo,
				conteudoTexto: lesson.conteudoTexto ?? "",
				ordem: lesson.ordem,
			},
			videoHolder: {
				file: null,
				fileName: lesson.muxAssetId ? "Vídeo já definido nesta aula." : null,
				previewUrl: null,
			},
		});
	}, [lesson, redefineState]);

	async function uploadLessonVideo(file: File) {
		const { data } = await requestMuxUploadUrl();
		await new Promise<void>((resolve, reject) => {
			const xhr = new XMLHttpRequest();

			xhr.addEventListener("load", () => {
				if (xhr.status >= 200 && xhr.status < 300) return resolve();
				return reject(new Error("Falha ao enviar vídeo para o Mux."));
			});

			xhr.addEventListener("error", () => reject(new Error("Erro de rede ao enviar vídeo para o Mux.")));
			xhr.open("PUT", data.uploadUrl);
			xhr.send(file);
		});

		return data.uploadId;
	}

	const { mutate: handleControlLessonMutation, isPending } = useMutation({
		mutationKey: ["update-community-lesson", lessonId],
		mutationFn: async (variables: TUpdateCommunityLessonInput) => {
			if (!lesson) throw new Error("Aula não encontrada.");
			if (!state.lesson.titulo.trim()) throw new Error("Informe o título da aula.");

			const hasExistingVideo = !!lesson.muxAssetId;
			if (showVideoUpload && !hasExistingVideo && !state.videoHolder.file) {
				throw new Error("Selecione um vídeo para esta aula.");
			}

			const communityLesson: TUpdateCommunityLessonInput["communityLesson"] = {
				titulo: state.lesson.titulo.trim(),
				descricao: state.lesson.descricao?.trim() || null,
				tipoConteudo: state.lesson.tipoConteudo,
				conteudoTexto: showTextContent ? state.lesson.conteudoTexto?.trim() || null : null,
				ordem: state.lesson.ordem,
			};

			if (showVideoUpload && state.videoHolder.file) {
				const muxUploadId = await uploadLessonVideo(state.videoHolder.file);
				communityLesson.muxUploadId = muxUploadId;
				communityLesson.muxAssetStatus = "AGUARDANDO";
			}

			return await updateCommunityLesson({ communityLessonId: variables.communityLessonId, communityLesson });
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
			await queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="CONTROLAR AULA"
			menuDescription="Edite os dados e o conteúdo da aula"
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleControlLessonMutation({ communityLessonId: lessonId, communityLesson: {} })}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeModal}
		>
			<LessonGeneralBlock lesson={state.lesson} updateLesson={updateLesson} />
			<LessonContentBlock lesson={state.lesson} updateLesson={updateLesson} videoHolder={state.videoHolder} updateVideoHolder={updateVideoHolder} />
		</ResponsiveMenu>
	);
}
