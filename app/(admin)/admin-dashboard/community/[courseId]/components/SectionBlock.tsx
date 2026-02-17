"use client";

import type { TGetCommunityCoursesOutputById } from "@/app/api/admin/community/courses/route";
import ControlCommunityCourseLesson from "@/components/Modals/Internal/Courses/Lessons/ControlCommunityCourseLesson";
import NewCommunityCourseLesson from "@/components/Modals/Internal/Courses/Lessons/NewCommunityCourseLesson";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { deleteCommunityCourseSection, reorderItems, updateCommunityCourseSection } from "@/lib/mutations/community-admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Edit, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import LessonBlock from "./LessonBlock";

type Section = TGetCommunityCoursesOutputById["secoes"][number];

type SectionBlockProps = {
	section: Section;
	courseId: string;
	index: number;
	totalSections: number;
	onMoveUp: () => void;
	onMoveDown: () => void;
};

export default function SectionBlock({ section, courseId: _courseId, index, totalSections, onMoveUp, onMoveDown }: SectionBlockProps) {
	const queryClient = useQueryClient();
	const [isExpanded, setIsExpanded] = useState(true);
	const [isEditing, setIsEditing] = useState(false);
	const [newLessonMenuIsOpen, setNewLessonMenuIsOpen] = useState(false);
	const [editTitle, setEditTitle] = useState(section.titulo);
	const [controlLessonMenuIsOpen, setControlLessonMenuIsOpen] = useState(false);
	const [editingLessonId, setEditingLessonId] = useState<string | null>(null);

	const { mutate: handleUpdateTitle, isPending: isUpdating } = useMutation({
		mutationFn: () => updateCommunityCourseSection({ id: section.id, data: { titulo: editTitle } }),
		onSuccess: (data) => {
			toast.success(data.message);
			setIsEditing(false);
			queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const { mutate: handleDelete, isPending: isDeleting } = useMutation({
		mutationFn: () => deleteCommunityCourseSection(section.id),
		onSuccess: () => {
			toast.success("Seção excluída com sucesso.");
			queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const { mutate: handleReorderLessons } = useMutation({
		mutationFn: (items: Array<{ id: string; ordem: number }>) => reorderItems({ tipo: "aula", itens: items }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] }),
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
					{isEditing ? (
						<div className="flex items-center gap-2">
							<Input
								value={editTitle}
								onChange={(e) => setEditTitle(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleUpdateTitle();
									if (e.key === "Escape") setIsEditing(false);
								}}
								className="h-7 text-sm"
								autoFocus
							/>
							<Button size="sm" variant="ghost" onClick={() => handleUpdateTitle()} disabled={isUpdating} className="h-7 text-xs">
								Salvar
							</Button>
						</div>
					) : (
						<button type="button" onClick={() => setIsExpanded(!isExpanded)} className="flex items-center gap-2 text-left w-full">
							<ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
							<span className="font-semibold text-sm truncate">{section.titulo}</span>
							<span className="text-xs text-muted-foreground ml-1">
								({section.aulas?.length ?? 0} {(section.aulas?.length ?? 0) === 1 ? "aula" : "aulas"})
							</span>
						</button>
					)}
				</div>

				{/* Actions */}
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 gap-1.5 px-2"
						onClick={() => {
							setIsEditing(true);
							setEditTitle(section.titulo);
						}}
					>
						<Pencil className="h-3.5 w-3.5" />
						EDITAR
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
									onEdit={() => {
										setEditingLessonId(lesson.id);
										setControlLessonMenuIsOpen(true);
									}}
								/>
							))}
						</div>
					) : (
						<div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
							<button
								type="button"
								onClick={() => setNewLessonMenuIsOpen(true)}
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

			{/* Lesson control modal */}
			{controlLessonMenuIsOpen && editingLessonId && (
				<ControlCommunityCourseLesson
					lessonId={editingLessonId}
					closeModal={() => {
						setControlLessonMenuIsOpen(false);
						setEditingLessonId(null);
					}}
				/>
			)}
			{newLessonMenuIsOpen && (
				<NewCommunityCourseLesson
					closeModal={() => setNewLessonMenuIsOpen(false)}
					sectionId={section.id}
					callbacks={{
						onSuccess: () => {
							setNewLessonMenuIsOpen(false);
						},
					}}
				/>
			)}
		</div>
	);
}
