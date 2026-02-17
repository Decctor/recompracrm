"use client";

import type { TCreateCommunityCourseSectionInput } from "@/app/api/admin/community/sections/route";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import LessonContentBlock from "@/components/Modals/Internal/Courses/Lessons/Blocks/Content";
import LessonGeneralBlock from "@/components/Modals/Internal/Courses/Lessons/Blocks/General";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { createCommunityCourseSection, requestMuxUploadUrl } from "@/lib/mutations/community-admin";
import { useInternalCommunityCourseLessonState } from "@/state-hooks/use-internal-community-course-lesson-state";
import {
	type TUseInternalCommunityCourseSectionState,
	useInternalCommunityCourseSectionState,
} from "@/state-hooks/use-internal-community-course-section-state";
import { LessonContentTypeOptions } from "@/utils/select-options";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, ListIcon, PencilIcon, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type NewCommunityCourseSectionProps = {
	courseId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: (variables: TCreateCommunityCourseSectionInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

type TSectionLessonState = ReturnType<typeof useInternalCommunityCourseSectionState>["state"]["communityCourseSectionLessons"][number];

export default function NewCommunityCourseSection({ courseId, closeModal, callbacks }: NewCommunityCourseSectionProps) {
	const queryClient = useQueryClient();
	const {
		state,
		updateCommunityCourseSection,
		addCommunityCourseSectionLesson,
		updateCommunityCourseSectionLesson,
		removeCommunityCourseSectionLesson,
		resetState,
	} = useInternalCommunityCourseSectionState();

	const [newLessonMenuIsOpen, setNewLessonMenuIsOpen] = useState(false);
	const [editingLessonIndex, setEditingLessonIndex] = useState<number | null>(null);

	const editingLesson = useMemo(
		() => (editingLessonIndex == null ? null : (state.communityCourseSectionLessons[editingLessonIndex] ?? null)),
		[editingLessonIndex, state.communityCourseSectionLessons],
	);

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

	const { mutate: handleCreateSectionMutation, isPending } = useMutation({
		mutationKey: ["create-community-course-section", courseId],
		mutationFn: handleCreateSection,
		onMutate: async (variables) => {
			if (callbacks?.onMutate)
				callbacks.onMutate({
					communityCourseSection: {
						cursoId: courseId,
						titulo: state.communityCourseSection.titulo,
						ordem: state.communityCourseSection.ordem,
						descricao: state.communityCourseSection.descricao ?? null,
					},
					communityCourseSectionLessons: state.communityCourseSectionLessons.map((lesson) => ({
						...lesson,
						ordem: lesson.ordem,
					})),
				});
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(data.message);
			resetState();
			await queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
			closeModal();
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError(error);
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
		},
	});

	async function handleCreateSection(info: TUseInternalCommunityCourseSectionState["state"]) {
		const sectionTitle = info.communityCourseSection.titulo.trim();
		if (!sectionTitle) throw new Error("Informe o título da seção.");

		const activeLessons = info.communityCourseSectionLessons.filter((lesson) => !lesson.deletar);
		const communityCourseSectionLessons: TCreateCommunityCourseSectionInput["communityCourseSectionLessons"] = await Promise.all(
			activeLessons.map(async (lesson, lessonOrder) => {
				const showVideoUpload = lesson.tipoConteudo === "VIDEO" || lesson.tipoConteudo === "VIDEO_TEXTO";
				const showTextContent = lesson.tipoConteudo === "TEXTO" || lesson.tipoConteudo === "VIDEO_TEXTO";
				if (!lesson.titulo.trim()) throw new Error(`Informe o título da aula ${lessonOrder + 1}.`);
				if (showVideoUpload && !lesson.videoHolder.file) throw new Error(`Selecione um vídeo para a aula "${lesson.titulo}".`);

				const muxUploadId = showVideoUpload && lesson.videoHolder.file ? await uploadLessonVideo(lesson.videoHolder.file) : null;
				return {
					titulo: lesson.titulo.trim(),
					descricao: lesson.descricao?.trim() || null,
					tipoConteudo: lesson.tipoConteudo,
					conteudoTexto: showTextContent ? lesson.conteudoTexto?.trim() || null : null,
					ordem: lessonOrder,
					duracaoSegundos: lesson.duracaoSegundos ?? null,
					muxAssetId: null,
					muxPlaybackId: null,
					muxAssetStatus: muxUploadId ? "AGUARDANDO" : null,
					muxUploadId,
					muxMetadata: {},
					dataInsercao: lesson.dataInsercao,
				};
			}),
		);

		return await createCommunityCourseSection({
			communityCourseSection: {
				cursoId: courseId,
				titulo: sectionTitle,
				descricao: info.communityCourseSection.descricao?.trim() || null,
				ordem: info.communityCourseSection.ordem,
			},
			communityCourseSectionLessons,
		});
	}

	return (
		<ResponsiveMenu
			menuTitle="NOVA SEÇÃO"
			menuDescription="Crie uma seção e defina as aulas desta seção."
			menuActionButtonText="CRIAR SEÇÃO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => handleCreateSection(state)}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="sm"
		>
			<ResponsiveMenuSection title="SEÇÃO" icon={<ListIcon className="h-4 w-4 min-h-4 min-w-4" />}>
				<TextInput
					label="TÍTULO"
					placeholder="Preencha aqui o título da seção..."
					value={state.communityCourseSection.titulo}
					handleChange={(value) => updateCommunityCourseSection({ titulo: value })}
				/>
				<TextareaInput
					label="DESCRIÇÃO (OPCIONAL)"
					placeholder="Preencha aqui uma breve descrição da seção..."
					value={state.communityCourseSection.descricao ?? ""}
					handleChange={(value) => updateCommunityCourseSection({ descricao: value })}
				/>
			</ResponsiveMenuSection>

			<ResponsiveMenuSection title="AULAS DA SEÇÃO" icon={<FilePlus2 className="h-4 w-4 min-h-4 min-w-4" />}>
				<div className="w-full flex items-center justify-end">
					<Button variant="ghost" size="xs" className="flex items-center gap-1" onClick={() => setNewLessonMenuIsOpen(true)}>
						<Plus className="w-4 h-4 min-w-4 min-h-4" />
						ADICIONAR AULA
					</Button>
				</div>
				<div className="w-full flex flex-col gap-1.5">
					{state.communityCourseSectionLessons.filter((lesson) => !lesson.deletar).length > 0 ? (
						state.communityCourseSectionLessons.map((lesson, index) =>
							lesson.deletar ? null : (
								<SectionLessonCard
									key={`${lesson.id ?? "new"}-${index.toString()}`}
									lesson={lesson}
									handleRemoveClick={() => removeCommunityCourseSectionLesson(index)}
									handleEditClick={() => setEditingLessonIndex(index)}
								/>
							),
						)
					) : (
						<div className="w-full text-center text-sm font-medium tracking-tight text-muted-foreground">Nenhuma aula adicionada ainda.</div>
					)}
				</div>
			</ResponsiveMenuSection>

			{newLessonMenuIsOpen ? (
				<NewSectionLessonMenu
					closeMenu={() => setNewLessonMenuIsOpen(false)}
					addLesson={(lesson) => {
						addCommunityCourseSectionLesson({
							...lesson,
							ordem: state.communityCourseSectionLessons.filter((item) => !item.deletar).length,
						});
						setNewLessonMenuIsOpen(false);
					}}
				/>
			) : null}

			{editingLesson ? (
				<EditSectionLessonMenu
					initialLesson={editingLesson}
					closeMenu={() => setEditingLessonIndex(null)}
					updateLesson={(lesson) => {
						updateCommunityCourseSectionLesson({
							index: editingLessonIndex as number,
							changes: lesson,
						});
						setEditingLessonIndex(null);
					}}
				/>
			) : null}
		</ResponsiveMenu>
	);
}

type SectionLessonCardProps = {
	lesson: TSectionLessonState;
	handleRemoveClick: () => void;
	handleEditClick: () => void;
};

function SectionLessonCard({ lesson, handleRemoveClick, handleEditClick }: SectionLessonCardProps) {
	const contentTypeLabel = LessonContentTypeOptions.find((option) => option.value === lesson.tipoConteudo)?.label ?? lesson.tipoConteudo;
	return (
		<div className="w-full flex flex-col gap-1.5 bg-card border-primary/20 rounded-xl border p-2 shadow-2xs">
			<div className="w-full flex items-center justify-between gap-2">
				<h3 className="text-xs font-bold tracking-tight lg:text-sm">{lesson.titulo}</h3>
				<p className="text-[0.65rem] rounded-md bg-primary/10 px-2 py-0.5">{contentTypeLabel}</p>
			</div>
			<p className="text-xs text-muted-foreground">{lesson.descricao || "Nenhuma descrição definida..."}</p>
			<div className="w-full flex items-center justify-end gap-2 flex-wrap">
				<Button
					variant="ghost"
					className="flex items-center gap-1.5 p-2 rounded-full hover:bg-destructive/10 hover:text-destructive duration-300 ease-in-out"
					size="fit"
					onClick={handleRemoveClick}
				>
					<Trash2 className="w-3 min-w-3 h-3 min-h-3" />
				</Button>
				<Button variant="ghost" className="flex items-center gap-1.5 p-2 rounded-full" size="fit" onClick={handleEditClick}>
					<PencilIcon className="w-3 min-w-3 h-3 min-h-3" />
				</Button>
			</div>
		</div>
	);
}

type NewSectionLessonMenuProps = {
	closeMenu: () => void;
	addLesson: (lesson: TSectionLessonState) => void;
};

function NewSectionLessonMenu({ closeMenu, addLesson }: NewSectionLessonMenuProps) {
	const { state, updateLesson, updateVideoHolder } = useInternalCommunityCourseLessonState();
	function handleSubmit() {
		if (!state.lesson.titulo.trim()) return toast.error("Informe o título da aula.");
		const requiresVideo = state.lesson.tipoConteudo === "VIDEO" || state.lesson.tipoConteudo === "VIDEO_TEXTO";
		if (requiresVideo && !state.videoHolder.file) return toast.error("Selecione um vídeo para esta aula.");
		addLesson({
			...state.lesson,
			videoHolder: state.videoHolder,
		});
	}
	return (
		<ResponsiveMenu
			menuTitle="NOVA AULA"
			menuDescription="Preencha os dados da aula."
			menuActionButtonText="ADICIONAR AULA"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={false}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
		>
			<LessonGeneralBlock lesson={state.lesson} updateLesson={updateLesson} />
			<LessonContentBlock lesson={state.lesson} updateLesson={updateLesson} videoHolder={state.videoHolder} updateVideoHolder={updateVideoHolder} />
		</ResponsiveMenu>
	);
}

type EditSectionLessonMenuProps = {
	initialLesson: TSectionLessonState;
	closeMenu: () => void;
	updateLesson: (lesson: TSectionLessonState) => void;
};

function EditSectionLessonMenu({ initialLesson, closeMenu, updateLesson }: EditSectionLessonMenuProps) {
	const {
		state,
		updateLesson: updateDraftLesson,
		updateVideoHolder,
	} = useInternalCommunityCourseLessonState({
		initialState: {
			lesson: {
				titulo: initialLesson.titulo,
				descricao: initialLesson.descricao ?? "",
				tipoConteudo: initialLesson.tipoConteudo,
				conteudoTexto: initialLesson.conteudoTexto ?? "",
				ordem: initialLesson.ordem,
				duracaoSegundos: initialLesson.duracaoSegundos ?? null,
				muxAssetId: initialLesson.muxAssetId ?? null,
				muxPlaybackId: initialLesson.muxPlaybackId ?? null,
				muxAssetStatus: initialLesson.muxAssetStatus ?? null,
				muxUploadId: initialLesson.muxUploadId ?? null,
				muxMetadata: initialLesson.muxMetadata ?? {},
				dataInsercao: initialLesson.dataInsercao,
			},
			videoHolder: initialLesson.videoHolder,
		},
	});

	function handleSubmit() {
		if (!state.lesson.titulo.trim()) return toast.error("Informe o título da aula.");
		const requiresVideo = state.lesson.tipoConteudo === "VIDEO" || state.lesson.tipoConteudo === "VIDEO_TEXTO";
		if (requiresVideo && !state.videoHolder.file && !initialLesson.muxAssetId) return toast.error("Selecione um vídeo para esta aula.");
		updateLesson({
			...state.lesson,
			id: initialLesson.id,
			videoHolder: state.videoHolder,
		});
	}

	return (
		<ResponsiveMenu
			menuTitle="EDITAR AULA"
			menuDescription="Atualize os dados da aula."
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={false}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
		>
			<LessonGeneralBlock lesson={state.lesson} updateLesson={updateDraftLesson} />
			<LessonContentBlock lesson={state.lesson} updateLesson={updateDraftLesson} videoHolder={state.videoHolder} updateVideoHolder={updateVideoHolder} />
		</ResponsiveMenu>
	);
}
