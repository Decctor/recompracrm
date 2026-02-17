"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import { createSection, reorderItems } from "@/lib/mutations/community-admin";
import { useAdminCourses } from "@/lib/queries/community-admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, GripVertical, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
	const coursesQuery = useAdminCourses();
	const course = useMemo(() => coursesQuery.data?.data?.find((c) => c.id === courseId), [coursesQuery.data, courseId]);

	const [newSectionTitle, setNewSectionTitle] = useState("");

	const { mutate: handleCreateSection, isPending: isCreatingSection } = useMutation({
		mutationFn: () => createSection({ cursoId: courseId, titulo: newSectionTitle }),
		onSuccess: (data) => {
			toast.success(data.message);
			setNewSectionTitle("");
			queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const { mutate: handleReorder } = useMutation({
		mutationFn: (args: { tipo: "secao" | "aula"; itens: Array<{ id: string; ordem: number }> }) => reorderItems(args),
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

	if (coursesQuery.isLoading) {
		return (
			<div className="w-full h-full flex items-center justify-center">
				<div className="animate-pulse text-muted-foreground">Carregando...</div>
			</div>
		);
	}

	if (!course) {
		return (
			<div className="w-full h-full flex flex-col items-center justify-center gap-4">
				<p className="text-muted-foreground">Curso não encontrado.</p>
				<Link href="/admin-dashboard/community">
					<Button variant="outline">Voltar</Button>
				</Link>
			</div>
		);
	}

	const statusConfig = STATUS_LABELS[course.status] ?? STATUS_LABELS.RASCUNHO;

	return (
		<div className="w-full h-full flex flex-col gap-6 p-4 lg:p-6">
			{/* Header */}
			<div className="w-full flex items-start justify-between gap-4">
				<div className="flex items-start gap-3">
					<Link href="/admin-dashboard/community">
						<Button variant="outline" size="icon" className="h-8 w-8 mt-0.5">
							<ArrowLeft className="w-4 h-4" />
						</Button>
					</Link>
					<div className="flex flex-col gap-1">
						<div className="flex items-center gap-2">
							<h1 className="text-2xl font-bold tracking-tight">{course.titulo}</h1>
							<Badge className={statusConfig.className} variant="outline">
								{statusConfig.label}
							</Badge>
						</div>
						{course.descricao && <p className="text-sm text-muted-foreground">{course.descricao}</p>}
					</div>
				</div>
			</div>

			{/* Sections */}
			<div className="flex flex-col gap-4">
				<h2 className="text-lg font-semibold flex items-center gap-2">
					<GripVertical className="w-4 h-4 text-muted-foreground" />
					Seções e Aulas
				</h2>

				{course.secoes && course.secoes.length > 0 ? (
					<div className="flex flex-col gap-3">
						{course.secoes.map((section, index) => (
							<SectionBlock
								key={section.id}
								section={section}
								courseId={courseId}
								index={index}
								totalSections={course.secoes.length}
								onMoveUp={() => moveSectionUp(index)}
								onMoveDown={() => moveSectionDown(index)}
							/>
						))}
					</div>
				) : (
					<div className="border border-dashed border-primary/20 rounded-lg py-8 text-center text-muted-foreground text-sm">
						Nenhuma seção criada ainda. Adicione a primeira seção abaixo.
					</div>
				)}

				{/* Add section */}
				<div className="flex items-center gap-2 bg-card border border-primary/10 rounded-lg p-3">
					<Input
						placeholder="Título da nova seção..."
						value={newSectionTitle}
						onChange={(e) => setNewSectionTitle(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && newSectionTitle.trim()) handleCreateSection();
						}}
						className="flex-1"
					/>
					<Button
						onClick={() => handleCreateSection()}
						disabled={!newSectionTitle.trim() || isCreatingSection}
						size="sm"
						className="gap-1.5"
					>
						<Plus className="w-4 h-4" />
						Seção
					</Button>
				</div>
			</div>
		</div>
	);
}
