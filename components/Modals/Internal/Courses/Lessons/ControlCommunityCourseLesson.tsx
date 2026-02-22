"use client";

import type { TUpdateCommunityLessonInput } from "@/app/api/admin/community/lessons/route";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Progress } from "@/components/ui/progress";
import { getErrorMessage } from "@/lib/errors";
import { updateCommunityLesson } from "@/lib/mutations/community-admin";
import { useAdminCommunityLessonById } from "@/lib/queries/community-admin";
import { type TMuxUploadStatus, uploadMuxVideoWithProgress } from "@/lib/uploads/mux-upload-with-progress";
import { useInternalCommunityCourseLessonState } from "@/state-hooks/use-internal-community-course-lesson-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
	const [uploadProgress, setUploadProgress] = useState({
		status: "idle" as TMuxUploadStatus,
		loadedBytes: 0,
		totalBytes: 0,
		progressPercent: 0,
		errorMessage: null as string | null,
	});

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
				muxMetadata: lesson.muxMetadata,
			},
			videoHolder: {
				file: null,
				fileName: lesson.muxAssetId ? "Vídeo já definido nesta aula." : null,
				previewUrl: null,
			},
		});
	}, [lesson, redefineState]);

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
				setUploadProgress({
					status: "idle",
					loadedBytes: 0,
					totalBytes: state.videoHolder.file.size,
					progressPercent: 0,
					errorMessage: null,
				});
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
					communityLesson.muxUploadId = muxUploadId;
					communityLesson.muxAssetStatus = "AGUARDANDO";
				} catch (uploadError) {
					setUploadProgress((prevState) => ({
						...prevState,
						status: "error",
						errorMessage: getErrorMessage(uploadError),
					}));
					throw uploadError;
				}
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
			await queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
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
			menuTitle="CONTROLAR AULA"
			menuDescription="Edite os dados e o conteúdo da aula"
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleControlLessonMutation({ communityLessonId: lessonId, communityLesson: {} })}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
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
