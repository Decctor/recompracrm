"use client";

import type { TGetCommunityCoursesOutputById } from "@/app/api/admin/community/courses/route";
import ControlCommunityCourseSection from "@/components/Modals/Internal/Courses/Sections/ControlCommunityCourseSection";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { deleteCommunityCourseSection, reorderCommunityItems } from "@/lib/mutations/community-admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import LessonBlock from "./LessonBlock";
import NewCommunityCourseLesson from "@/components/Modals/Internal/Courses/Lessons/NewCommunityCourseLesson";

type Section = TGetCommunityCoursesOutputById["secoes"][number];

type SectionBlockProps = {
	section: Section;
	index: number;
	totalSections: number;
	onMoveUp: () => void;
	onMoveDown: () => void;
	sectionCallbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	}
	lessonsCallbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	}
};

export default function SectionBlock({ section, index, totalSections, onMoveUp, onMoveDown, sectionCallbacks, lessonsCallbacks	 }: SectionBlockProps) {
	const queryClient = useQueryClient();
	const [isExpanded, setIsExpanded] = useState(true);
	const [controlSectionMenuIsOpen, setControlSectionMenuIsOpen] = useState(false);
	const [newLessonMenuIsOpen, setNewLessonMenuIsOpen] = useState(false);

	const { mutate: handleDelete, isPending: isDeleting } = useMutation({
		mutationFn: () => deleteCommunityCourseSection(section.id),
		onMutate: () => {
			if (sectionCallbacks?.onMutate) sectionCallbacks.onMutate();
			return;
		},
		onSuccess: () => {
			if (sectionCallbacks?.onSuccess) sectionCallbacks.onSuccess();
			toast.success("Seção excluída com sucesso.");
			return queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
		},
		onError: (error) => {
			if (sectionCallbacks?.onError) sectionCallbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			if (sectionCallbacks?.onSettled) sectionCallbacks.onSettled();
			return;
		},
	});

	const { mutate: handleReorderLessons } = useMutation({
		mutationFn: (items: Array<{ id: string; ordem: number }>) => reorderCommunityItems({ communityLessonReorder: { itens: items } }),
		onMutate: () => {
			if (lessonsCallbacks?.onMutate) lessonsCallbacks.onMutate();
			return;
		},
		onSuccess: () => {
			if (lessonsCallbacks?.onSuccess) lessonsCallbacks.onSuccess();
			return queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
		},
		onError: (error) => {
			if (lessonsCallbacks?.onError) lessonsCallbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: () => {
			if (lessonsCallbacks?.onSettled) lessonsCallbacks.onSettled();
			return;
		},
	});

	function moveLessonUp(lessonIndex: number) {
		if (!section.aulas || lessonIndex <= 0) return;
		const items = section.aulas.map((l, i) => ({
			id: l.id,
			ordem: i === lessonIndex ? lessonIndex - 1 : i === lessonIndex - 1 ? lessonIndex : i,
		}));
		handleReorderLessons(items);
	}

	function moveLessonDown(lessonIndex: number) {
		if (!section.aulas || lessonIndex >= section.aulas.length - 1) return;
		const items = section.aulas.map((l, i) => ({
			id: l.id,
			ordem: i === lessonIndex ? lessonIndex + 1 : i === lessonIndex + 1 ? lessonIndex : i,
		}));
		handleReorderLessons(items);
	}

	return (
		<div className="border border-primary/15 rounded-lg bg-card overflow-hidden">
			{/* Section header */}
			<div className="flex items-center gap-2 p-3 bg-primary/5 border-b border-primary/10">
				{/* Reorder buttons */}
				<div className="flex flex-col">
					<button
						type="button"
						onClick={onMoveUp}
						disabled={index === 0}
						className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
					>
						<ChevronUp className="w-3.5 h-3.5" />
					</button>
					<button
						type="button"
						onClick={onMoveDown}
						disabled={index >= totalSections - 1}
						className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
					>
						<ChevronDown className="w-3.5 h-3.5" />
					</button>
				</div>

				{/* Title / edit */}
				<div className="flex-1 min-w-0">
					<button type="button" onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-2 text-left w-full">
						<ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
						<span className="font-semibold text-sm truncate">{section.titulo}</span>
						<span className="text-xs text-muted-foreground ml-1">
							({section.aulas?.length ?? 0} {(section.aulas?.length ?? 0) === 1 ? "aula" : "aulas"})
						</span>
					</button>
				</div>

				{/* Actions */}
				<div className="flex items-center gap-1">
					<Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={() => setControlSectionMenuIsOpen(true)}>
						<Pencil className="h-3.5 w-3.5" />
						CONTROLAR
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 gap-1.5 px-2 text-destructive hover:text-destructive"
						onClick={() => handleDelete()}
						disabled={isDeleting}
					>
						<Trash2 className="h-3.5 w-3.5" />
						EXCLUIR
					</Button>
				</div>
			</div>

			{/* Lessons */}
			{isExpanded && (
				<div className="p-3 flex flex-col gap-2">
					{section.aulas && section.aulas.length > 0 ? (
						<div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-4">
							<button
								type="button"
								onClick={() => setNewLessonMenuIsOpen(true)}	
								className="bg-primary text-primary-foreground flex w-full flex-col gap-2 rounded-xl p-3 text-left shadow-2xs transition-colors"
							>
								<div className="relative aspect-video w-full overflow-hidden rounded-lg border border-dashed border-primary/20 bg-primary/5">
									<div className="flex h-full w-full items-center justify-center">
										<Plus className="h-7 w-7" />
									</div>
								</div>
								<div className="flex min-h-[42px] items-center">
									<h3 className="text-sm font-bold tracking-tight">NOVA AULA</h3>
								</div>
								<p className="text-xs">Clique para criar uma nova aula nesta seção.</p>
							</button>
							{section.aulas.map((lesson, lessonIndex) => (
								<LessonBlock
									key={lesson.id}
									lesson={lesson}
									index={lessonIndex}
									totalLessons={section.aulas.length}
									onMoveUp={() => moveLessonUp(lessonIndex)}
									onMoveDown={() => moveLessonDown(lessonIndex)}
									onEdit={() => setControlSectionMenuIsOpen(true)}
								/>
							))}
						</div>
					) : (
						<div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
							<button
								type="button"
								onClick={() => setControlSectionMenuIsOpen(true)}
								className="bg-primary text-primary-foreground flex w-full flex-col gap-2 rounded-xl border border-dashed p-3 text-left shadow-2xs transition-colors"
							>
								<div className="relative aspect-video w-full overflow-hidden rounded-lg border border-dashed border-primary/20 bg-primary/5">
									<div className="flex h-full w-full items-center justify-center">
										<Plus className="h-7 w-7 text-primary/70" />
									</div>
								</div>
								<div className="flex min-h-[42px] items-center">
									<h3 className="text-sm font-bold tracking-tight">NOVA AULA</h3>
								</div>
								<p className="text-xs">Clique para criar a primeira aula desta seção.</p>
							</button>
						</div>
					)}
				</div>
			)}

			{controlSectionMenuIsOpen && (
				<ControlCommunityCourseSection
					sectionId={section.id}
					closeModal={() => setControlSectionMenuIsOpen(false)}
					callbacks={{
						onMutate: () => {
							if (sectionCallbacks?.onMutate) sectionCallbacks.onMutate();
							return;
						},
						onSuccess: () => {
							if (sectionCallbacks?.onSuccess) sectionCallbacks.onSuccess();
							setControlSectionMenuIsOpen(false);
						},
						onError: (error) => {
							if (sectionCallbacks?.onError) sectionCallbacks.onError();
							return toast.error(getErrorMessage(error));
						},
						onSettled: () => {
							if (sectionCallbacks?.onSettled) sectionCallbacks.onSettled();
							return;
						},
					}}
				/>
			)}

			{newLessonMenuIsOpen && (
				<NewCommunityCourseLesson
					sectionId={section.id}
					closeModal={() => setNewLessonMenuIsOpen(false)}
					callbacks={lessonsCallbacks}
				/>
			)}
		</div>
	);
}
