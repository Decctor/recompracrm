"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import NewCommunityCourseSection from "@/components/Modals/Internal/Courses/Sections/NewCommunityCourseSection";
import { Button } from "@/components/ui/button";
import SectionWrapper from "@/components/ui/section-wrapper";
import { StatBadge } from "@/components/ui/stat-badge";
import { getErrorMessage } from "@/lib/errors";
import { reorderCommunityItems } from "@/lib/mutations/community-admin";
import { useAdminCommunityCourseById } from "@/lib/queries/community-admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Diamond, FolderIcon, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import SectionBlock from "./components/SectionBlock";

type CourseEditorPageProps = {
	courseId: string;
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
	RASCUNHO: { label: "Rascunho", className: "text-amber-600 border-amber-300 bg-amber-50" },
	PUBLICADO: { label: "Publicado", className: "bg-emerald-600 text-white border-emerald-600" },
	ARQUIVADO: { label: "Arquivado", className: "text-muted-foreground" },
};

export default function CourseEditorPage({ courseId }: CourseEditorPageProps) {
	const queryClient = useQueryClient();
	const { data: course, queryKey, isLoading, isError, error, isSuccess } = useAdminCommunityCourseById({ courseId });
	const [newSectionModalOpen, setNewSectionModalOpen] = useState(false);

	const { mutate: handleReorder } = useMutation({
		mutationFn: (args: { tipo: "secao" | "aula"; itens: Array<{ id: string; ordem: number }> }) =>
			reorderCommunityItems(
				args.tipo === "secao" ? { communityCourseSectionReorder: { itens: args.itens } } : { communityLessonReorder: { itens: args.itens } },
			),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] }),
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function moveSectionUp(index: number) {
		if (!course?.secoes || index <= 0) return;
		const items = course.secoes.map((s, i) => ({
			id: s.id,
			ordem: i === index ? index - 1 : i === index - 1 ? index : i,
		}));
		handleReorder({ tipo: "secao", itens: items });
	}

	function moveSectionDown(index: number) {
		if (!course?.secoes || index >= course.secoes.length - 1) return;
		const items = course.secoes.map((s, i) => ({
			id: s.id,
			ordem: i === index ? index + 1 : i === index + 1 ? index : i,
		}));
		handleReorder({ tipo: "secao", itens: items });
	}

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey });

	if (isLoading) {
		return (
			<div className="w-full h-full flex items-center justify-center">
				<div className="animate-pulse text-muted-foreground">Carregando...</div>
			</div>
		);
	}

	if (isError) {
		return <ErrorComponent msg={getErrorMessage(error)} />;
	}

	if (isSuccess) {
		const statusConfig = STATUS_LABELS[course.status] ?? STATUS_LABELS.RASCUNHO;
		return (
			<div className="w-full h-full flex flex-col gap-6 p-4 lg:p-6">
				{/* Header */}
				<div className="w-full flex items-start justify-between gap-4">
					<div className="flex items-start gap-3">
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2">
								<h1 className="text-2xl font-bold tracking-tight">{course.titulo}</h1>
								<StatBadge icon={<Diamond className="w-4 h-4" />} value={course.status} tooltipContent="Status do curso" />
							</div>
							{course.descricao && <p className="text-sm text-muted-foreground">{course.descricao}</p>}
						</div>
					</div>
				</div>

				<SectionWrapper
					title="SEÇÕES E AULAS"
					icon={<FolderIcon className="w-4 h-4" />}
					actions={
						<Button variant="ghost" size="xs" onClick={() => setNewSectionModalOpen(true)} className="flex items-center gap-1">
							<Plus className="w-4 h-4 min-w-4 min-h-4" />
							ADICIONAR
						</Button>
					}
				>
					{course.secoes && course.secoes.length > 0 ? (
						<div className="flex flex-col gap-3">
							{course.secoes.map((section, index) => (
								<SectionBlock
									key={section.id}
									section={section}
									index={index}
									totalSections={course.secoes.length}
									onMoveUp={() => moveSectionUp(index)}
									onMoveDown={() => moveSectionDown(index)}
									sectionCallbacks={{
										onMutate: handleOnMutate,
										onSettled: handleOnSettled,
									}}
									lessonsCallbacks={{
										onMutate: handleOnMutate,
										onSettled: handleOnSettled,
									}}
								/>
							))}
						</div>
					) : (
						<div className="border border-dashed border-primary/20 rounded-lg py-8 text-center text-muted-foreground text-sm">
							Nenhuma seção criada ainda. Adicione a primeira seção abaixo.
						</div>
					)}
				</SectionWrapper>

				{newSectionModalOpen ? (
					<NewCommunityCourseSection
						courseId={courseId}
						closeModal={() => setNewSectionModalOpen(false)}
						callbacks={{
							onMutate: handleOnMutate,
							onSuccess: () => {
								setNewSectionModalOpen(false);
							},
							onSettled: handleOnSettled,
						}}
					/>
				) : null}
			</div>
		);
	}
	return <></>;
}
