"use client";

import MuxPlayer from "@mux/mux-player-react";
import { CommunityHeader } from "@/components/Community/CommunityHeader";
import { LessonSidebarOutline } from "@/components/Community/LessonSidebarOutline";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TCourseSection } from "@/lib/community-helpers";
import { updateProgress } from "@/lib/mutations/community";
import { useCourseDetail, useLesson } from "@/lib/queries/community";
import { BookOpen, ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen, PlayCircle } from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function LessonViewerPage({
	params,
}: {
	params: Promise<{ courseId: string; lessonId: string }>;
}) {
	const { courseId, lessonId } = use(params);
	const { data: lesson, isLoading: lessonLoading } = useLesson(lessonId);
	const { data: course } = useCourseDetail(courseId);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [activeTab, setActiveTab] = useState("overview");
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
		}, 30000);

		return () => {
			if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
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
					<div className="aspect-video bg-muted" />
					<div className="p-6 space-y-3">
						<div className="h-6 bg-muted rounded w-2/3" />
						<div className="h-4 bg-muted rounded w-full" />
					</div>
				</div>
			</div>
		);
	}

	if (!lesson) {
		return (
			<div className="flex items-center justify-center h-[calc(100dvh-3.5rem)]">
				<div className="text-center">
					<div className="rounded-full bg-primary/10 p-5 w-fit mx-auto mb-4">
						<BookOpen className="w-10 h-10 text-primary/50" />
					</div>
					<h2 className="text-lg font-semibold mb-2">Aula não encontrada</h2>
					<Button variant="outline" asChild size="sm">
						<Link href={`/community/courses/${courseId}`}>Voltar ao curso</Link>
					</Button>
				</div>
			</div>
		);
	}

	const hasVideo = lesson.tipoConteudo === "VIDEO" || lesson.tipoConteudo === "VIDEO_TEXTO";
	const hasText = lesson.tipoConteudo === "TEXTO" || lesson.tipoConteudo === "VIDEO_TEXTO";
	const sections = (course?.secoes ?? []) as TCourseSection[];

	const breadcrumbs = course
		? [
				{ label: "Início", href: "/community" },
				{ label: "Cursos", href: "/community/courses" },
				{ label: course.titulo, href: `/community/courses/${courseId}` },
				{ label: lesson.titulo },
			]
		: [
				{ label: "Início", href: "/community" },
				{ label: "Cursos", href: "/community/courses" },
				{ label: lesson.titulo },
			];

	return (
		<div className="flex flex-col h-[calc(100dvh-3.5rem)]">
			{/* Header with breadcrumb */}
			<div className="px-4 py-2 border-b border-primary/10 shrink-0">
				<CommunityHeader breadcrumbs={breadcrumbs} />
			</div>

			<div className="flex flex-col lg:flex-row flex-1 min-h-0">
			{/* Main content area */}
			<div className="flex-1 flex flex-col overflow-y-auto min-w-0">
				{/* Video player */}
				{hasVideo && lesson.muxPlaybackId && (
					<div className="w-full bg-black shrink-0">
						<MuxPlayer
							streamType="on-demand"
							playbackId={lesson.muxPlaybackId}
							metadata={{ video_title: lesson.titulo }}
							accentColor="hsl(var(--primary))"
							style={{ width: "100%", aspectRatio: "16/9" }}
							onTimeUpdate={handleTimeUpdate}
							onEnded={handleVideoEnded}
						/>
					</div>
				)}

				{/* Video not ready */}
				{hasVideo && !lesson.muxPlaybackId && (
					<div className="w-full aspect-video bg-muted flex items-center justify-center shrink-0">
						<div className="text-center">
							<PlayCircle className="w-12 h-12 text-muted-foreground/50 mx-auto mb-2" />
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

				{/* Lesson info below video */}
				<div className="p-4 sm:p-6 flex flex-col gap-4 flex-1">
					{/* Header with sidebar toggle */}
					<div className="flex items-start justify-between gap-3">
						<div className="flex flex-col gap-1 min-w-0">
							<h1 className="text-lg sm:text-xl font-bold tracking-tight">{lesson.titulo}</h1>
							{lesson.descricao && (
								<p className="text-sm text-muted-foreground">{lesson.descricao}</p>
							)}
						</div>
						<Button
							variant="ghost"
							size="icon"
							className="hidden lg:flex shrink-0"
							onClick={() => setSidebarOpen(!sidebarOpen)}
						>
							{sidebarOpen ? (
								<PanelRightClose className="w-4 h-4 min-w-4 min-h-4" />
							) : (
								<PanelRightOpen className="w-4 h-4 min-w-4 min-h-4" />
							)}
						</Button>
					</div>

					{/* Tabs: Overview / Content */}
					{hasText && lesson.conteudoTexto ? (
						<Tabs value={activeTab} onValueChange={setActiveTab}>
							<TabsList className="w-fit h-fit rounded-lg px-1 py-1">
								<TabsTrigger value="overview" className="text-xs px-3 py-1.5">
									Visão Geral
								</TabsTrigger>
								<TabsTrigger value="content" className="text-xs px-3 py-1.5">
									Conteúdo
								</TabsTrigger>
							</TabsList>

							<TabsContent value="overview" className="mt-4">
								{lesson.descricao && (
									<p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
										{lesson.descricao}
									</p>
								)}
							</TabsContent>

							<TabsContent value="content" className="mt-4">
								<div
									className="prose prose-sm max-w-none dark:prose-invert"
									dangerouslySetInnerHTML={{ __html: lesson.conteudoTexto }}
								/>
							</TabsContent>
						</Tabs>
					) : null}

					{/* Navigation */}
					<div className="flex items-center justify-between pt-4 border-t border-primary/10 mt-auto">
						{prevLesson ? (
							<Link
								href={`/community/courses/${courseId}/lessons/${prevLesson.id}`}
								className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
							>
								<ChevronLeft className="w-4 h-4 min-w-4 min-h-4" />
								<span className="hidden sm:inline truncate max-w-[200px]">{prevLesson.titulo}</span>
								<span className="sm:hidden">Anterior</span>
							</Link>
						) : (
							<div />
						)}
						{nextLesson ? (
							<Link
								href={`/community/courses/${courseId}/lessons/${nextLesson.id}`}
								className="flex items-center gap-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
							>
								<span className="hidden sm:inline truncate max-w-[200px]">{nextLesson.titulo}</span>
								<span className="sm:hidden">Próxima</span>
								<ChevronRight className="w-4 h-4 min-w-4 min-h-4" />
							</Link>
						) : (
							<Link
								href={`/community/courses/${courseId}`}
								className="flex items-center gap-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
							>
								Voltar ao curso
								<ChevronRight className="w-4 h-4 min-w-4 min-h-4" />
							</Link>
						)}
					</div>
				</div>
			</div>

			{/* Sidebar - Course outline */}
			<aside
				className={`${sidebarOpen ? "w-80" : "w-0 overflow-hidden"} hidden lg:block border-l border-primary/10 bg-card transition-all duration-200 shrink-0`}
			>
				{course && (
					<LessonSidebarOutline
						courseId={courseId}
						courseTitle={course.titulo}
						sections={sections}
						activeLessonId={lessonId}
					/>
				)}
			</aside>
			</div>
		</div>
	);
}
