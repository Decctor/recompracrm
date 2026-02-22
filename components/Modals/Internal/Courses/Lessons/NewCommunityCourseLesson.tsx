"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Progress } from "@/components/ui/progress";
import { getErrorMessage } from "@/lib/errors";
import { createCommunityLesson } from "@/lib/mutations/community-admin";
import { type TMuxUploadStatus, uploadMuxVideoWithProgress } from "@/lib/uploads/mux-upload-with-progress";
import { useInternalCommunityCourseLessonState } from "@/state-hooks/use-internal-community-course-lesson-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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

type TCreateCommunityLessonPayload = Parameters<typeof createCommunityLesson>[0]["communityLesson"];

export default function NewCommunityCourseLesson({ sectionId, closeModal, callbacks }: NewCommunityCourseLessonProps) {
	const queryClient = useQueryClient();
	const { state, updateLesson, updateVideoHolder, resetState } = useInternalCommunityCourseLessonState();
	const [uploadProgress, setUploadProgress] = useState({
		status: "idle" as TMuxUploadStatus,
		loadedBytes: 0,
		totalBytes: 0,
		progressPercent: 0,
		errorMessage: null as string | null,
	});

	const showVideoUpload = state.lesson.tipoConteudo === "VIDEO" || state.lesson.tipoConteudo === "VIDEO_TEXTO";
	const showTextContent = state.lesson.tipoConteudo === "TEXTO" || state.lesson.tipoConteudo === "VIDEO_TEXTO";

	function getNormalizedLessonPayload(): TCreateCommunityLessonPayload {
		return {
			secaoId: sectionId,
			titulo: state.lesson.titulo.trim(),
			descricao: state.lesson.descricao?.trim() || null,
			tipoConteudo: state.lesson.tipoConteudo,
			conteudoTexto: showTextContent ? state.lesson.conteudoTexto?.trim() || null : null,
			ordem: state.lesson.ordem,
			muxMetadata: {},
			dataInsercao: new Date(),
		};
	}

	const { mutate: handleCreateLessonMutation, isPending } = useMutation({
		mutationKey: ["create-community-lesson"],
		mutationFn: async () => {
			const normalizedPayload = getNormalizedLessonPayload();
			if (!normalizedPayload.titulo) throw new Error("Informe o título da aula.");
			if (showVideoUpload && !state.videoHolder.file) throw new Error("Selecione um vídeo para esta aula.");

			setUploadProgress({
				status: "idle",
				loadedBytes: 0,
				totalBytes: state.videoHolder.file?.size ?? 0,
				progressPercent: 0,
				errorMessage: null,
			});

			if (showVideoUpload && state.videoHolder.file) {
				try {
					const muxUploadId = await uploadMuxVideoWithProgress({
						file: state.videoHolder.file,
						onStatusChange: (status) => {
							setUploadProgress((prevState) => ({ ...prevState, status }));
						},
						onProgress: ({ loadedBytes, totalBytes, progressPercent }) => {
							setUploadProgress((prevState) => ({
								...prevState,
								loadedBytes,
								totalBytes,
								progressPercent,
							}));
						},
					});
					normalizedPayload.muxUploadId = muxUploadId;
					normalizedPayload.muxAssetStatus = "AGUARDANDO";
				} catch (error) {
					setUploadProgress((prevState) => ({
						...prevState,
						status: "error",
						errorMessage: getErrorMessage(error),
					}));
					throw error;
				}
			}

			return await createCommunityLesson({ communityLesson: normalizedPayload });
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

	const uploadStatusLabelByStatus: Record<TMuxUploadStatus, string> = {
		idle: "Aguardando envio.",
		preparing: "Preparando upload...",
		uploading: "Enviando vídeo...",
		success: "Upload concluído.",
		error: "Falha no upload.",
	};

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
			lockClose={isPending}
		>
			{showVideoUpload && (uploadProgress.status !== "idle" || uploadProgress.errorMessage) ? (
				<div className="flex w-full flex-col gap-1 rounded-md border border-primary/20 bg-primary/5 p-2">
					<p className="text-xs font-medium">{uploadStatusLabelByStatus[uploadProgress.status]}</p>
					<Progress value={uploadProgress.progressPercent} className="h-2 w-full" />
					<p className="text-[0.7rem] text-muted-foreground">
						{uploadProgress.progressPercent}% ({uploadProgress.loadedBytes} / {uploadProgress.totalBytes} bytes)
					</p>
					{uploadProgress.errorMessage ? <p className="text-[0.7rem] text-destructive">{uploadProgress.errorMessage}</p> : null}
				</div>
			) : null}
			<LessonGeneralBlock lesson={state.lesson} updateLesson={updateLesson} />
			<LessonContentBlock lesson={state.lesson} updateLesson={updateLesson} videoHolder={state.videoHolder} updateVideoHolder={updateVideoHolder} />
		</ResponsiveMenu>
	);
}
