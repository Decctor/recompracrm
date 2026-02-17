"use client";

import { useCourseDetail } from "@/lib/queries/community";
import { BookOpen, CheckCircle, ChevronRight, Clock, FileText, Globe, Lock, PlayCircle, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { use } from "react";

const ACCESS_CONFIG = {
	PUBLICO: { icon: Globe, label: "Acesso público", className: "text-emerald-600" },
	AUTENTICADO: { icon: Lock, label: "Requer login", className: "text-blue-600" },
	ASSINATURA: { icon: Sparkles, label: "Requer assinatura", className: "text-purple-600" },
};

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

export default function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
	const { courseId } = use(params);
	const { data: course, isLoading, error } = useCourseDetail(courseId);

	if (isLoading) {
		return (
			<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
				<div className="animate-pulse space-y-6">
					<div className="aspect-[3/1] bg-primary/5 rounded-xl" />
					<div className="h-8 bg-primary/5 rounded w-2/3" />
					<div className="h-5 bg-primary/5 rounded w-full" />
					<div className="space-y-3">
						{Array.from({ length: 3 }).map((_, i) => (
							<div key={`skeleton-${i}`} className="h-14 bg-primary/5 rounded-lg" />
						))}
					</div>
				</div>
			</div>
		);
	}

	if (error || !course) {
		return (
			<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
				<BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
				<h2 className="text-xl font-semibold mb-2">Curso não encontrado</h2>
				<p className="text-muted-foreground mb-6">Este curso não está disponível ou não existe.</p>
				<Link href="/community" className="text-primary hover:underline text-sm">
					Voltar para cursos
				</Link>
			</div>
		);
	}

	const totalLessons = course.secoes?.reduce((sum: number, s: any) => sum + (s.aulas?.length ?? 0), 0) ?? 0;
	const totalDuration = course.secoes?.reduce(
		(sum: number, s: any) => sum + s.aulas.reduce((aSum: number, a: any) => aSum + (a.duracaoSegundos ?? 0), 0),
		0,
	) ?? 0;
	const accessConfig = ACCESS_CONFIG[course.nivelAcesso as keyof typeof ACCESS_CONFIG];
	const AccessIcon = accessConfig.icon;

	// Find the first lesson for the "Start" CTA
	const firstLesson = course.secoes?.[0]?.aulas?.[0];

	return (
		<div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
			{/* Breadcrumb */}
			<nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
				<Link href="/community" className="hover:text-foreground transition-colors">Cursos</Link>
				<ChevronRight className="w-3.5 h-3.5" />
				<span className="text-foreground font-medium truncate">{course.titulo}</span>
			</nav>

			{/* Hero section */}
			<div className="flex flex-col lg:flex-row gap-8 mb-10">
				{/* Thumbnail */}
				<div className="relative aspect-video lg:aspect-[4/3] lg:w-96 rounded-xl overflow-hidden bg-gradient-to-br from-primary/5 to-primary/10 flex-shrink-0">
					{course.thumbnailUrl ? (
						<Image src={course.thumbnailUrl} alt={course.titulo} fill className="object-cover" />
					) : (
						<div className="w-full h-full flex items-center justify-center">
							<BookOpen className="w-20 h-20 text-primary/15" />
						</div>
					)}
				</div>

				{/* Course info */}
				<div className="flex-1 flex flex-col gap-4">
					<h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{course.titulo}</h1>
					{course.descricao && (
						<p className="text-muted-foreground text-base leading-relaxed">{course.descricao}</p>
					)}

					{/* Meta */}
					<div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
						<span className="flex items-center gap-1.5">
							<BookOpen className="w-4 h-4" />
							{totalLessons} {totalLessons === 1 ? "aula" : "aulas"}
						</span>
						{totalDuration > 0 && (
							<span className="flex items-center gap-1.5">
								<Clock className="w-4 h-4" />
								{Math.floor(totalDuration / 3600) > 0
									? `${Math.floor(totalDuration / 3600)}h ${Math.floor((totalDuration % 3600) / 60)}min`
									: `${Math.floor(totalDuration / 60)}min`}
							</span>
						)}
						<span className={`flex items-center gap-1.5 ${accessConfig.className}`}>
							<AccessIcon className="w-4 h-4" />
							{accessConfig.label}
						</span>
					</div>

					{/* CTA */}
					{firstLesson && (
						<Link
							href={`/community/${courseId}/lessons/${firstLesson.id}`}
							className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-colors w-fit mt-2"
						>
							<PlayCircle className="w-5 h-5" />
							Começar curso
						</Link>
					)}
				</div>
			</div>

			{/* Course content outline */}
			<div className="flex flex-col gap-4">
				<h2 className="text-xl font-semibold">Conteúdo do curso</h2>

				{course.secoes?.map((section: any, sIndex: number) => {
					const sectionDuration = section.aulas?.reduce((sum: number, a: any) => sum + (a.duracaoSegundos ?? 0), 0) ?? 0;

					return (
						<div key={section.id} className="border border-primary/10 rounded-lg overflow-hidden">
							{/* Section header */}
							<div className="bg-primary/[0.03] px-4 py-3 flex items-center justify-between">
								<div className="flex items-center gap-2">
									<span className="text-xs font-semibold text-muted-foreground bg-primary/10 px-2 py-0.5 rounded">
										{sIndex + 1}
									</span>
									<h3 className="font-semibold text-sm">{section.titulo}</h3>
								</div>
								<span className="text-xs text-muted-foreground">
									{section.aulas?.length ?? 0} {(section.aulas?.length ?? 0) === 1 ? "aula" : "aulas"}
									{sectionDuration > 0 && ` \u00b7 ${Math.floor(sectionDuration / 60)}min`}
								</span>
							</div>

							{/* Lessons */}
							<div className="divide-y divide-primary/5">
								{section.aulas?.map((lesson: any, lIndex: number) => {
									const LessonIcon = CONTENT_TYPE_ICONS[lesson.tipoConteudo as keyof typeof CONTENT_TYPE_ICONS] ?? PlayCircle;

									return (
										<Link
											key={lesson.id}
											href={`/community/${courseId}/lessons/${lesson.id}`}
											className="flex items-center gap-3 px-4 py-3 hover:bg-primary/[0.02] transition-colors group"
										>
											<LessonIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
											<span className="flex-1 text-sm group-hover:text-primary transition-colors">
												{lesson.titulo}
											</span>
											{lesson.duracaoSegundos && (
												<span className="text-xs text-muted-foreground">
													{formatDuration(lesson.duracaoSegundos)}
												</span>
											)}
										</Link>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
