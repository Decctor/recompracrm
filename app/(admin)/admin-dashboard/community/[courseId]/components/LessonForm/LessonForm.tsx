"use client";

import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { updateCommunityLesson } from "@/lib/mutations/community-admin";
import type { TCommunityLessonContentTypeEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import VideoUploadBlock from "./VideoUploadBlock";

type LessonFormProps = {
	lessonId: string | null;
	sectionId: string;
	courseId: string;
	closeModal: () => void;
};

type LessonFormState = {
	titulo: string;
	descricao: string;
	tipoConteudo: TCommunityLessonContentTypeEnum;
	conteudoTexto: string;
	muxUploadId: string | null;
};

export default function LessonForm({ lessonId, sectionId, courseId, closeModal }: LessonFormProps) {
	const isEditing = !!lessonId;
	const queryClient = useQueryClient();

	const [state, setState] = useState<LessonFormState>({
		titulo: "",
		descricao: "",
		tipoConteudo: "VIDEO",
		conteudoTexto: "",
		muxUploadId: null,
	});

	const updateState = useCallback(<K extends keyof LessonFormState>(key: K, value: LessonFormState[K]) => {
		setState((prev) => ({ ...prev, [key]: value }));
	}, []);

	const { mutate, isPending } = useMutation({
		mutationFn: async () => {
			if (!lessonId) throw new Error("Aula não encontrada para edição.");
			return await updateCommunityLesson({
				id: lessonId,
				data: {
					titulo: state.titulo || undefined,
					descricao: state.descricao || null,
					tipoConteudo: state.tipoConteudo,
					conteudoTexto: state.conteudoTexto || null,
					muxUploadId: state.muxUploadId,
					muxAssetStatus: state.muxUploadId ? "AGUARDANDO" : undefined,
				},
			});
		},
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const showVideoUpload = state.tipoConteudo === "VIDEO" || state.tipoConteudo === "VIDEO_TEXTO";
	const showTextEditor = state.tipoConteudo === "TEXTO" || state.tipoConteudo === "VIDEO_TEXTO";

	return (
		<ResponsiveMenu
			menuTitle={isEditing ? "EDITAR AULA" : "CONFIGURAR AULA"}
			menuDescription="Configure o conteúdo desta aula"
			menuActionButtonText="SALVAR"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate()}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="lg"
			drawerVariant="xl"
		>
			<div className="flex flex-col gap-4">
				{/* Title */}
				<div className="flex flex-col gap-1.5">
					<Label>Título da aula</Label>
					<Input placeholder="Título da aula..." value={state.titulo} onChange={(e) => updateState("titulo", e.target.value)} />
				</div>

				{/* Description */}
				<div className="flex flex-col gap-1.5">
					<Label>Descrição (opcional)</Label>
					<Textarea placeholder="Breve descrição da aula..." value={state.descricao} onChange={(e) => updateState("descricao", e.target.value)} rows={2} />
				</div>

				{/* Content type */}
				<div className="flex flex-col gap-1.5">
					<Label>Tipo de conteúdo</Label>
					<Select value={state.tipoConteudo} onValueChange={(v) => updateState("tipoConteudo", v as TCommunityLessonContentTypeEnum)}>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="VIDEO">Vídeo</SelectItem>
							<SelectItem value="TEXTO">Texto</SelectItem>
							<SelectItem value="VIDEO_TEXTO">Vídeo + Texto</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{/* Video upload */}
				{showVideoUpload && <VideoUploadBlock onUploadComplete={(uploadId) => updateState("muxUploadId", uploadId)} />}

				{/* Text content */}
				{showTextEditor && (
					<div className="flex flex-col gap-1.5">
						<Label>Conteúdo em texto</Label>
						<Textarea
							placeholder="Escreva o conteúdo da aula aqui..."
							value={state.conteudoTexto}
							onChange={(e) => updateState("conteudoTexto", e.target.value)}
							rows={8}
							className="font-mono text-sm"
						/>
						<p className="text-xs text-muted-foreground">Suporta HTML básico para formatação.</p>
					</div>
				)}
			</div>
		</ResponsiveMenu>
	);
}
