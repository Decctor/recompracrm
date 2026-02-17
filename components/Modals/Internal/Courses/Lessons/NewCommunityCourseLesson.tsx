"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createCommunityLesson, requestMuxUploadUrl, updateCommunityLesson } from "@/lib/mutations/community-admin";
import { useInternalCommunityCourseLessonState } from "@/state-hooks/use-internal-community-course-lesson-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import LessonContentBlock from "./Blocks/Content";
import LessonGeneralBlock from "./Blocks/General";

type NewCommunityCourseLessonProps = {
	sectionId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function NewCommunityCourseLesson({ sectionId, closeModal, callbacks }: NewCommunityCourseLessonProps) {
	const queryClient = useQueryClient();
	const { state, updateLesson, updateVideoHolder, resetState } = useInternalCommunityCourseLessonState();

	const showVideoUpload = state.lesson.tipoConteudo === "VIDEO" || state.lesson.tipoConteudo === "VIDEO_TEXTO";
	const showTextContent = state.lesson.tipoConteudo === "TEXTO" || state.lesson.tipoConteudo === "VIDEO_TEXTO";

	function getNormalizedLessonPayload() {
		return {
			secaoId: sectionId,
			titulo: state.lesson.titulo.trim(),
			descricao: state.lesson.descricao?.trim() || null,
			tipoConteudo: state.lesson.tipoConteudo,
			conteudoTexto: showTextContent ? state.lesson.conteudoTexto?.trim() || null : null,
			ordem: state.lesson.ordem,
		};
	}

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

	const { mutate: handleCreateLessonMutation, isPending } = useMutation({
		mutationKey: ["create-community-lesson"],
		mutationFn: async () => {
			const normalizedPayload = getNormalizedLessonPayload();
			if (!normalizedPayload.titulo) throw new Error("Informe o título da aula.");
			if (showVideoUpload && !state.videoHolder.file) throw new Error("Selecione um vídeo para esta aula.");

			const createdLesson = await createCommunityLesson(normalizedPayload);

			if (showVideoUpload && state.videoHolder.file) {
				const muxUploadId = await uploadLessonVideo(state.videoHolder.file);
				await updateCommunityLesson({
					id: createdLesson.data.id,
					data: {
						muxUploadId,
						muxAssetStatus: "AGUARDANDO",
					},
				});
			}

			return createdLesson;
		},
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate();
			return;
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(data.message);
			resetState();
			queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
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
			menuTitle="NOVA AULA"
			menuDescription="Preencha os dados para criar uma nova aula"
			menuActionButtonText="CRIAR AULA"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleCreateLessonMutation()}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<LessonGeneralBlock lesson={state.lesson} updateLesson={updateLesson} />
			<LessonContentBlock lesson={state.lesson} updateLesson={updateLesson} videoHolder={state.videoHolder} updateVideoHolder={updateVideoHolder} />
		</ResponsiveMenu>
	);
}
