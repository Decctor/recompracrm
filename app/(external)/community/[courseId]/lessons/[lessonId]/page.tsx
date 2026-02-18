"use client";

import MuxPlayer from "@mux/mux-player-react";
import { useCourseDetail, useLesson } from "@/lib/queries/community";
import { updateProgress } from "@/lib/mutations/community";
import { BookOpen, CheckCircle, ChevronLeft, ChevronRight, FileText, PlayCircle } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

const CONTENT_TYPE_ICONS = {
	VIDEO: PlayCircle,
	TEXTO: FileText,
	VIDEO_TEXTO: PlayCircle,
};

function formatDuration(seconds: number | null) {
	if (!seconds) return null;
	const mins = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function LessonViewerPage({
	params,
}: {
	params: Promise<{ courseId: string; lessonId: string }>;
}) {
	const { courseId, lessonId } = use(params);
	const { data: lesson, isLoading: lessonLoading } = useLesson(lessonId);
	const { data: course } = useCourseDetail(courseId);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const currentTimeRef = useRef(0);

	// Build flat lesson list for navigation
	const flatLessons = useMemo(() => {
		if (!course?.secoes) return [];
		return course.secoes.flatMap((s: any) =>
			(s.aulas ?? []).map((a: any) => ({
				id: a.id,
				titulo: a.titulo,
				tipoConteudo: a.tipoConteudo,
				duracaoSegundos: a.duracaoSegundos,
				secaoTitulo: s.titulo,
				secaoId: s.id,
			})),
		);
	}, [course]);

	const currentIndex = flatLessons.findIndex((l: any) => l.id === lessonId);
	const prevLesson = currentIndex > 0 ? flatLessons[currentIndex - 1] : null;
	const nextLesson = currentIndex < flatLessons.length - 1 ? flatLessons[currentIndex + 1] : null;

	// Save progress periodically
	const saveProgress = useCallback(
		(completed = false) => {
			if (!lessonId) return;
			updateProgress({
				aulaId: lessonId,
				concluido: completed,
				progressoSegundos: Math.floor(currentTimeRef.current),
			}).catch(() => {});
		},
		[lessonId],
	);

	// Start progress saving interval
	useEffect(() => {
		progressIntervalRef.current = setInterval(() => {
			if (currentTimeRef.current > 0) saveProgress(false);
		}, 30000); // Every 30 seconds

		return () => {
			if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
			// Save on unmount
			if (currentTimeRef.current > 0) saveProgress(false);
		};
	}, [saveProgress]);

	// Handle video time update
	const handleTimeUpdate = useCallback((e: any) => {
		currentTimeRef.current = e.detail ?? e.target?.currentTime ?? 0;
	}, []);

	// Handle video ended
	const handleVideoEnded = useCallback(() => {
		saveProgress(true);
	}, [saveProgress]);

	if (lessonLoading) {
		return (
			<div className="flex flex-col lg:flex-row h-[calc(100dvh-3.5rem)]">
				<div className="flex-1 animate-pulse">
					<div className="aspect-video bg-primary/5" />
					<div className="p-6 space-y-3">
						<div className="h-6 bg-primary/5 rounded w-2/3" />
						<div className="h-4 bg-primary/5 rounded w-full" />
					</div>
				</div>
			</div>
		);
	}

	if (!lesson) {
		return (
			<div className="flex items-center justify-center h-[calc(100dvh-3.5rem)]">
				<div className="text-center">
					<BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
					<h2 className="text-xl font-semibold mb-2">Aula não encontrada</h2>
					<Link href={`/community/${courseId}`} className="text-primary hover:underline text-sm">
						Voltar ao curso
					</Link>
				</div>
			</div>
		);
	}

	const hasVideo = lesson.tipoConteudo === "VIDEO" || lesson.tipoConteudo === "VIDEO_TEXTO";
	const hasText = lesson.tipoConteudo === "TEXTO" || lesson.tipoConteudo === "VIDEO_TEXTO";

	return (
		<div className="flex flex-col lg:flex-row h-[calc(100dvh-3.5rem)]">
			{/* Main content area */}
			<div className="flex-1 flex flex-col overflow-y-auto">
				{/* Video player */}
				{hasVideo && lesson.muxPlaybackId && (
					<div className="w-full bg-black">
						<MuxPlayer
							streamType="on-demand"
							playbackId={lesson.muxPlaybackId}
							metadata={{ video_title: lesson.titulo }}
							accentColor="#6366f1"
							style={{ width: "100%", aspectRatio: "16/9" }}
							onTimeUpdate={handleTimeUpdate}
							onEnded={handleVideoEnded}
						/>
					</div>
				)}

				{/* Video not ready */}
				{hasVideo && !lesson.muxPlaybackId && (
					<div className="w-full aspect-video bg-primary/5 flex items-center justify-center">
						<div className="text-center">
							<PlayCircle className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
							<p className="text-sm text-muted-foreground">
								{lesson.muxAssetStatus === "PROCESSANDO"
									? "Vídeo em processamento..."
									: lesson.muxAssetStatus === "ERRO"
										? "Erro no processamento do vídeo"
										: "Vídeo indisponível"}
							</p>
						</div>
					</div>
				)}

				{/* Lesson info + text content */}
				<div className="p-4 sm:p-6 lg:p-8 flex flex-col gap-4">
					<div>
						<h1 className="text-xl sm:text-2xl font-bold tracking-tight">{lesson.titulo}</h1>
						{lesson.descricao && (
							<p className="text-muted-foreground mt-1">{lesson.descricao}</p>
						)}
					</div>

					{/* Text content */}
					{hasText && lesson.conteudoTexto && (
						<div
							className="prose prose-sm max-w-none dark:prose-invert"
							dangerouslySetInnerHTML={{ __html: lesson.conteudoTexto }}
						/>
					)}

					{/* Navigation */}
					<div className="flex items-center justify-between pt-4 border-t border-primary/10 mt-4">
						{prevLesson ? (
							<Link
								href={`/community/${courseId}/lessons/${prevLesson.id}`}
								className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								<ChevronLeft className="w-4 h-4" />
								<span className="hidden sm:inline">{prevLesson.titulo}</span>
								<span className="sm:hidden">Anterior</span>
							</Link>
						) : (
							<div />
						)}
						{nextLesson ? (
							<Link
								href={`/community/${courseId}/lessons/${nextLesson.id}`}
								className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
							>
								<span className="hidden sm:inline">{nextLesson.titulo}</span>
								<span className="sm:hidden">Próxima</span>
								<ChevronRight className="w-4 h-4" />
							</Link>
						) : (
							<Link
								href={`/community/${courseId}`}
								className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
							>
								Voltar ao curso
								<ChevronRight className="w-4 h-4" />
							</Link>
						)}
					</div>
				</div>
			</div>

			{/* Sidebar - Course outline */}
			<aside
				className={`${sidebarOpen ? "w-80" : "w-0"} hidden lg:block border-l border-primary/10 bg-card overflow-y-auto transition-all flex-shrink-0`}
			>
				<div className="p-4">
					<div className="flex items-center justify-between mb-4">
						<h3 className="font-semibold text-sm">Conteúdo do curso</h3>
						<Link href={`/community/${courseId}`} className="text-xs text-muted-foreground hover:text-foreground">
							Ver curso
						</Link>
					</div>

					<div className="flex flex-col gap-3">
						{course?.secoes?.map((section: any) => (
							<div key={section.id} className="flex flex-col gap-0.5">
								<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
									{section.titulo}
								</h4>
								{section.aulas?.map((aula: any) => {
									const isActive = aula.id === lessonId;
									const LessonIcon = CONTENT_TYPE_ICONS[aula.tipoConteudo as keyof typeof CONTENT_TYPE_ICONS] ?? PlayCircle;

									return (
										<Link
											key={aula.id}
											href={`/community/${courseId}/lessons/${aula.id}`}
											className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
												isActive
													? "bg-primary/10 text-primary font-medium"
													: "text-muted-foreground hover:text-foreground hover:bg-primary/[0.03]"
											}`}
										>
											<LessonIcon className="w-3.5 h-3.5 flex-shrink-0" />
											<span className="flex-1 truncate">{aula.titulo}</span>
											{aula.duracaoSegundos && (
												<span className="text-[10px] opacity-60">{formatDuration(aula.duracaoSegundos)}</span>
											)}
										</Link>
									);
								})}
							</div>
						))}
					</div>
				</div>
			</aside>
		</div>
	);
}
