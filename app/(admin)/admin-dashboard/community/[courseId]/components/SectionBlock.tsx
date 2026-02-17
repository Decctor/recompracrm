"use client";

import type { TGetAdminCoursesOutput } from "@/app/api/admin/community/courses/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { createLesson, deleteSection, reorderItems, updateSection } from "@/lib/mutations/community-admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Edit, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import LessonBlock from "./LessonBlock";
import LessonForm from "./LessonForm/LessonForm";

type Section = TGetAdminCoursesOutput["data"][number]["secoes"][number];

type SectionBlockProps = {
	section: Section;
	courseId: string;
	index: number;
	totalSections: number;
	onMoveUp: () => void;
	onMoveDown: () => void;
};

export default function SectionBlock({ section, courseId, index, totalSections, onMoveUp, onMoveDown }: SectionBlockProps) {
	const queryClient = useQueryClient();
	const [isExpanded, setIsExpanded] = useState(true);
	const [isEditing, setIsEditing] = useState(false);
	const [editTitle, setEditTitle] = useState(section.titulo);
	const [newLessonTitle, setNewLessonTitle] = useState("");
	const [lessonFormOpen, setLessonFormOpen] = useState(false);
	const [editingLessonId, setEditingLessonId] = useState<string | null>(null);

	const { mutate: handleUpdateTitle, isPending: isUpdating } = useMutation({
		mutationFn: () => updateSection({ id: section.id, data: { titulo: editTitle } }),
		onSuccess: (data) => {
			toast.success(data.message);
			setIsEditing(false);
			queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const { mutate: handleDelete, isPending: isDeleting } = useMutation({
		mutationFn: () => deleteSection(section.id),
		onSuccess: () => {
			toast.success("Seção excluída com sucesso.");
			queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const { mutate: handleCreateLesson, isPending: isCreatingLesson } = useMutation({
		mutationFn: () => createLesson({ secaoId: section.id, titulo: newLessonTitle }),
		onSuccess: (data) => {
			toast.success(data.message);
			setNewLessonTitle("");
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
						<button
							type="button"
							onClick={() => setIsExpanded(!isExpanded)}
							className="flex items-center gap-2 text-left w-full"
						>
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
					<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setIsEditing(true); setEditTitle(section.titulo); }}>
						<Edit className="w-3.5 h-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-destructive hover:text-destructive"
						onClick={() => handleDelete()}
						disabled={isDeleting}
					>
						<Trash2 className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>

			{/* Lessons */}
			{isExpanded && (
				<div className="p-3 flex flex-col gap-2">
					{section.aulas && section.aulas.length > 0 ? (
						section.aulas.map((lesson, lessonIndex) => (
							<LessonBlock
								key={lesson.id}
								lesson={lesson}
								index={lessonIndex}
								totalLessons={section.aulas.length}
								onMoveUp={() => moveLessonUp(lessonIndex)}
								onMoveDown={() => moveLessonDown(lessonIndex)}
								onEdit={() => {
									setEditingLessonId(lesson.id);
									setLessonFormOpen(true);
								}}
							/>
						))
					) : (
						<p className="text-xs text-muted-foreground text-center py-3">Nenhuma aula nesta seção.</p>
					)}

					{/* Add lesson inline */}
					<div className="flex items-center gap-2 pt-1">
						<Input
							placeholder="Título da nova aula..."
							value={newLessonTitle}
							onChange={(e) => setNewLessonTitle(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && newLessonTitle.trim()) handleCreateLesson();
							}}
							className="flex-1 h-8 text-sm"
						/>
						<Button
							onClick={() => handleCreateLesson()}
							disabled={!newLessonTitle.trim() || isCreatingLesson}
							size="sm"
							variant="outline"
							className="gap-1 h-8 text-xs"
						>
							<Plus className="w-3.5 h-3.5" />
							Aula
						</Button>
					</div>
				</div>
			)}

			{/* Lesson form modal */}
			{lessonFormOpen && (
				<LessonForm
					lessonId={editingLessonId}
					sectionId={section.id}
					courseId={courseId}
					closeModal={() => {
						setLessonFormOpen(false);
						setEditingLessonId(null);
					}}
				/>
			)}
		</div>
	);
}
