"use client";

import type { TGetAdminCoursesOutput } from "@/app/api/admin/community/courses/route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteLesson } from "@/lib/mutations/community-admin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Edit, FileText, Loader2, PlayCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Lesson = TGetAdminCoursesOutput["data"][number]["secoes"][number]["aulas"][number];

type LessonBlockProps = {
	lesson: Lesson;
	index: number;
	totalLessons: number;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onEdit: () => void;
};

const CONTENT_TYPE_CONFIG = {
	VIDEO: { label: "Vídeo", icon: PlayCircle, className: "text-blue-600" },
	TEXTO: { label: "Texto", icon: FileText, className: "text-emerald-600" },
	VIDEO_TEXTO: { label: "Vídeo + Texto", icon: PlayCircle, className: "text-purple-600" },
};

const MUX_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
	AGUARDANDO: { label: "Aguardando upload", className: "text-muted-foreground border-muted" },
	PROCESSANDO: { label: "Processando", className: "text-amber-600 border-amber-300 bg-amber-50" },
	PRONTO: { label: "Pronto", className: "text-emerald-600 border-emerald-300 bg-emerald-50" },
	ERRO: { label: "Erro", className: "text-destructive border-destructive/30 bg-destructive/10" },
};

function formatDuration(seconds: number | null) {
	if (!seconds) return null;
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function LessonBlock({ lesson, index, totalLessons, onMoveUp, onMoveDown, onEdit }: LessonBlockProps) {
	const queryClient = useQueryClient();
	const contentConfig = CONTENT_TYPE_CONFIG[lesson.tipoConteudo];
	const ContentIcon = contentConfig.icon;
	const muxStatus = lesson.muxAssetStatus ? MUX_STATUS_CONFIG[lesson.muxAssetStatus] : null;

	const { mutate: handleDelete, isPending: isDeleting } = useMutation({
		mutationFn: () => deleteLesson(lesson.id),
		onSuccess: () => {
			toast.success("Aula excluída.");
			queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
		},
		onError: () => toast.error("Erro ao excluir aula."),
	});

	return (
		<div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/[0.02] border border-primary/10 hover:bg-primary/[0.04] transition-colors group">
			{/* Reorder */}
			<div className="flex flex-col">
				<button
					type="button"
					onClick={onMoveUp}
					disabled={index === 0}
					className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
				>
					<ChevronUp className="w-3 h-3" />
				</button>
				<button
					type="button"
					onClick={onMoveDown}
					disabled={index >= totalLessons - 1}
					className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
				>
					<ChevronDown className="w-3 h-3" />
				</button>
			</div>

			{/* Content type icon */}
			<ContentIcon className={`w-4 h-4 min-w-4 ${contentConfig.className}`} />

			{/* Title */}
			<span className="flex-1 text-sm truncate">{lesson.titulo}</span>

			{/* Duration */}
			{lesson.duracaoSegundos && (
				<span className="text-xs text-muted-foreground">{formatDuration(lesson.duracaoSegundos)}</span>
			)}

			{/* Mux status */}
			{muxStatus && (
				<Badge variant="outline" className={`text-[10px] h-5 ${muxStatus.className}`}>
					{lesson.muxAssetStatus === "PROCESSANDO" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
					{muxStatus.label}
				</Badge>
			)}

			{/* Actions */}
			<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
				<Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}>
					<Edit className="w-3 h-3" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="h-6 w-6 text-destructive hover:text-destructive"
					onClick={() => handleDelete()}
					disabled={isDeleting}
				>
					<Trash2 className="w-3 h-3" />
				</Button>
			</div>
		</div>
	);
}
