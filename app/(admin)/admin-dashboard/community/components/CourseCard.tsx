"use client";

import type { TGetAdminCoursesOutput } from "@/app/api/admin/community/courses/route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteCourse } from "@/lib/mutations/community-admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Edit, Eye, Globe, Lock, Sparkles, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";

type CourseCardProps = {
	course: TGetAdminCoursesOutput["data"][number];
	onEdit: () => void;
};

const STATUS_CONFIG = {
	RASCUNHO: { label: "Rascunho", variant: "outline" as const, className: "text-amber-600 border-amber-300 bg-amber-50" },
	PUBLICADO: { label: "Publicado", variant: "default" as const, className: "bg-emerald-600" },
	ARQUIVADO: { label: "Arquivado", variant: "secondary" as const, className: "" },
};

const ACCESS_CONFIG = {
	PUBLICO: { label: "Público", icon: Globe, className: "text-emerald-600" },
	AUTENTICADO: { label: "Autenticado", icon: Lock, className: "text-blue-600" },
	ASSINATURA: { label: "Assinatura", icon: Sparkles, className: "text-purple-600" },
};

export default function CourseCard({ course, onEdit }: CourseCardProps) {
	const queryClient = useQueryClient();
	const totalLessons = course.secoes?.reduce((sum, s) => sum + (s.aulas?.length ?? 0), 0) ?? 0;
	const totalSections = course.secoes?.length ?? 0;
	const statusConfig = STATUS_CONFIG[course.status];
	const accessConfig = ACCESS_CONFIG[course.nivelAcesso];
	const AccessIcon = accessConfig.icon;

	const { mutate: handleDelete, isPending: isDeleting } = useMutation({
		mutationFn: () => deleteCourse(course.id),
		onSuccess: () => {
			toast.success("Curso excluído com sucesso.");
			queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
		},
		onError: () => toast.error("Erro ao excluir curso."),
	});

	return (
		<div className="bg-card border border-primary/10 rounded-xl overflow-hidden shadow-2xs hover:shadow-md transition-all group">
			{/* Thumbnail */}
			<div className="relative aspect-video bg-primary/5 overflow-hidden">
				{course.thumbnailUrl ? (
					<Image src={course.thumbnailUrl} alt={course.titulo} fill className="object-cover" />
				) : (
					<div className="w-full h-full flex items-center justify-center">
						<BookOpen className="w-12 h-12 text-primary/20" />
					</div>
				)}
				<div className="absolute top-2 right-2 flex gap-1.5">
					<Badge className={statusConfig.className} variant={statusConfig.variant}>
						{statusConfig.label}
					</Badge>
				</div>
			</div>

			{/* Content */}
			<div className="p-4 flex flex-col gap-3">
				<div className="flex-1 min-w-0">
					<h3 className="font-semibold text-base truncate">{course.titulo}</h3>
					{course.descricao && (
						<p className="text-sm text-muted-foreground mt-1 line-clamp-2">{course.descricao}</p>
					)}
				</div>

				{/* Meta info */}
				<div className="flex items-center gap-4 text-xs text-muted-foreground">
					<div className="flex items-center gap-1.5">
						<AccessIcon className={`w-3.5 h-3.5 ${accessConfig.className}`} />
						<span>{accessConfig.label}</span>
					</div>
					<span>{totalSections} {totalSections === 1 ? "seção" : "seções"}</span>
					<span>{totalLessons} {totalLessons === 1 ? "aula" : "aulas"}</span>
				</div>

				{/* Actions */}
				<div className="flex items-center gap-2 pt-2 border-t border-primary/10">
					<Link href={`/admin-dashboard/community/${course.id}`} className="flex-1">
						<Button variant="outline" size="sm" className="w-full gap-1.5">
							<Eye className="w-3.5 h-3.5" />
							Gerenciar
						</Button>
					</Link>
					<Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
						<Edit className="w-3.5 h-3.5" />
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleDelete()}
						disabled={isDeleting}
						className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
					>
						<Trash2 className="w-3.5 h-3.5" />
					</Button>
				</div>
			</div>
		</div>
	);
}
