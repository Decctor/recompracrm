"use client";

import type { TGetCommunityCoursesOutputById } from "@/app/api/admin/community/courses/route";
import { Button } from "@/components/ui/button";
import { StatBadge } from "@/components/ui/stat-badge";
import { formatDateAsLocale } from "@/lib/formatting";
import { deleteCommunityLesson } from "@/lib/mutations/community-admin";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Calendar, Diamond, FileText, Loader2, Pencil, PlayCircle, Trash2, VideoIcon } from "lucide-react";
import { toast } from "sonner";

type Lesson = TGetCommunityCoursesOutputById["secoes"][number]["aulas"][number];

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

const MUX_STATUS_CONFIG: Record<string, { label: string; className: string; mediaClassName: string }> = {
	AGUARDANDO: {
		label: "Aguardando upload",
		className: "text-muted-foreground",
		mediaClassName: "bg-primary/5 text-muted-foreground",
	},
	PROCESSANDO: {
		label: "Processando",
		className: "text-amber-700",
		mediaClassName: "bg-amber-100 text-amber-700",
	},
	PRONTO: {
		label: "Pronto",
		className: "text-emerald-700",
		mediaClassName: "bg-emerald-100 text-emerald-700",
	},
	ERRO: {
		label: "Erro",
		className: "text-destructive",
		mediaClassName: "bg-destructive/10 text-destructive",
	},
};

function formatDuration(seconds: number | null) {
	if (!seconds) return null;
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function LessonBlock({ lesson, index, totalLessons, onMoveUp, onMoveDown, onEdit }: LessonBlockProps) {
	const queryClient = useQueryClient();
	const contentConfig = CONTENT_TYPE_CONFIG[lesson.tipoConteudo as keyof typeof CONTENT_TYPE_CONFIG];
	const ContentIcon = contentConfig.icon;
	const muxStatus = lesson.muxAssetStatus ? MUX_STATUS_CONFIG[lesson.muxAssetStatus] : null;

	const { mutate: handleDelete, isPending: isDeleting } = useMutation({
		mutationFn: () => deleteCommunityLesson(lesson.id),
		onSuccess: () => {
			toast.success("Aula excluída.");
			queryClient.invalidateQueries({ queryKey: ["admin-community-courses"] });
		},
		onError: () => toast.error("Erro ao excluir aula."),
	});

	return (
		<div className="bg-card border-primary/20 flex w-full flex-col gap-2 rounded-xl border p-3 shadow-2xs">
			<div className={cn("relative aspect-video w-full overflow-hidden rounded-lg", muxStatus?.mediaClassName ?? "bg-primary/5 text-muted-foreground")}>
				<div className="flex h-full w-full flex-col items-center justify-center gap-1">
					{lesson.muxAssetStatus === "PROCESSANDO" ? <Loader2 className="h-6 w-6 animate-spin" /> : <VideoIcon className="h-6 w-6" />}
					<p className="text-xs font-medium">{muxStatus ? muxStatus.label : "Sem vídeo definido"}</p>
				</div>
			</div>

			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-1">
					<div className="p-2 rounded-full bg-secondary text-primary font-bold text-[0.65rem]">#{index + 1}</div>
					<h3 className="truncate text-sm font-bold tracking-tight">{lesson.titulo}</h3>
				</div>
				{muxStatus ? (
					<StatBadge
						icon={<Diamond className={cn("h-3.5 w-3.5", muxStatus.className)} />}
						value={muxStatus.label}
						tooltipContent="Status do processamento de vídeo da aula"
						className="px-2 py-1"
						valueClassName={cn("text-[10px]", muxStatus.className)}
					/>
				) : null}
			</div>

			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<div className="flex items-center gap-1">
					<Calendar className="h-3.5 w-3.5" />
					<span>{formatDateAsLocale(lesson.dataInsercao)}</span>
				</div>
				<div className="flex items-center gap-1">
					{lesson.duracaoSegundos ? <span>{formatDuration(lesson.duracaoSegundos)}</span> : null}
					<div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
						<ContentIcon className={`h-3.5 w-3.5 ${contentConfig.className}`} />
						<span>{contentConfig.label}</span>
					</div>
				</div>
			</div>

			<div className="flex items-center justify-between gap-1 pt-1">
				<div className="flex items-center gap-1">
					<Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveUp} disabled={index === 0}>
						<ArrowUp className="h-3.5 w-3.5" />
					</Button>
					<Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveDown} disabled={index >= totalLessons - 1}>
						<ArrowDown className="h-3.5 w-3.5" />
					</Button>
				</div>
				<div className="flex items-center gap-1">
					<Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={onEdit}>
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
		</div>
	);
}
