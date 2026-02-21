"use client";

import { CommunityHeader } from "@/components/Community/CommunityHeader";
import { CourseContentOutline } from "@/components/Community/CourseContentOutline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACCESS_CONFIG, type TCourseSection, formatTotalDuration, getTotalDurationSeconds, getTotalLessons } from "@/lib/community-helpers";
import { useCourseDetail } from "@/lib/queries/community";
import { BookOpen, Check, Clock, PlayCircle, Share2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { use, useCallback, useState } from "react";
import { toast } from "sonner";

export default function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
	const { courseId } = use(params);
	const { data: course, isLoading, error } = useCourseDetail(courseId);
	const [copied, setCopied] = useState(false);

	const handleShare = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			toast.success("Link copiado!");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Não foi possível copiar o link.");
		}
	}, []);

	if (isLoading) {
		return (
			<div className="w-full h-full flex flex-col gap-6 p-6">
				<div className="animate-pulse space-y-4">
					<div className="h-4 w-48 bg-muted rounded" />
					<div className="flex flex-col lg:flex-row gap-6">
						<div className="aspect-video lg:w-[480px] bg-muted rounded-xl shrink-0" />
						<div className="flex-1 space-y-3">
							<div className="h-8 w-2/3 bg-muted rounded" />
							<div className="h-4 w-full bg-muted rounded" />
							<div className="h-4 w-3/4 bg-muted rounded" />
							<div className="h-10 w-40 bg-muted rounded-full mt-4" />
						</div>
					</div>
					<div className="space-y-2 mt-6">
						{Array.from({ length: 4 }).map((_, i) => (
							<div key={`skeleton-${i.toString()}`} className="h-12 bg-muted rounded-lg" />
						))}
					</div>
				</div>
			</div>
		);
	}

	if (error || !course) {
		return (
			<div className="w-full h-full flex items-center justify-center p-6">
				<div className="text-center">
					<div className="rounded-full bg-primary/10 p-5 w-fit mx-auto mb-4">
						<BookOpen className="w-10 h-10 text-primary/50" />
					</div>
					<h2 className="text-lg font-semibold mb-2">Curso não encontrado</h2>
					<p className="text-sm text-muted-foreground mb-4">Este curso não está disponível ou não existe.</p>
					<Button variant="outline" asChild size="sm">
						<Link href="/community/courses">Voltar para cursos</Link>
					</Button>
				</div>
			</div>
		);
	}

	const totalLessons = getTotalLessons(course);
	const totalDurationSec = getTotalDurationSeconds(course);
	const totalDuration = formatTotalDuration(totalDurationSec);
	const accessConfig = ACCESS_CONFIG[course.nivelAcesso as keyof typeof ACCESS_CONFIG];
	const AccessIcon = accessConfig.icon;
	const firstLesson = course.secoes?.[0]?.aulas?.[0];
	const sections = (course.secoes ?? []) as TCourseSection[];

	return (
		<div className="w-full h-full flex flex-col gap-6 p-6">
			<CommunityHeader
				breadcrumbs={[{ label: "Início", href: "/community" }, { label: "Cursos", href: "/community/courses" }, { label: course.titulo }]}
			/>

			{/* Course Header */}
			<div className="flex flex-col lg:flex-row gap-6">
				{/* Thumbnail */}
				<div className="relative aspect-video lg:aspect-[4/3] lg:w-[420px] rounded-xl overflow-hidden bg-primary/5 shrink-0 border border-primary/10">
					{course.thumbnailUrl ? (
						<Image src={course.thumbnailUrl} alt={course.titulo} fill className="object-cover" />
					) : (
						<div className="w-full h-full flex items-center justify-center">
							<BookOpen className="w-16 h-16 text-primary/15" />
						</div>
					)}
				</div>

				{/* Course Info */}
				<div className="flex-1 flex flex-col gap-3">
					<h1 className="text-xl md:text-2xl font-black tracking-tight">{course.titulo}</h1>

					{/* Meta */}
					<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
						<span className="flex items-center gap-1.5">
							<BookOpen className="w-3.5 h-3.5 min-w-3.5 min-h-3.5" />
							{totalLessons} {totalLessons === 1 ? "aula" : "aulas"}
						</span>
						{totalDuration && (
							<span className="flex items-center gap-1.5">
								<Clock className="w-3.5 h-3.5 min-w-3.5 min-h-3.5" />
								{totalDuration}
							</span>
						)}
						<Badge className={`${accessConfig.badgeClassName} border-0 text-[10px] px-2 py-0.5`}>
							<AccessIcon className="mr-1 h-2.5 w-2.5 min-w-2.5 min-h-2.5" />
							{accessConfig.label}
						</Badge>
					</div>

					{course.descricao && <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{course.descricao}</p>}

					{/* CTA Buttons */}
					<div className="flex items-center gap-3 mt-2">
						{firstLesson && (
							<Button asChild className="rounded-full px-6">
								<Link href={`/community/courses/${courseId}/lessons/${firstLesson.id}`}>
									<PlayCircle className="mr-2 w-4 h-4 min-w-4 min-h-4" />
									Iniciar agora
								</Link>
							</Button>
						)}
						<Button variant="outline" size="icon" className="rounded-full" onClick={handleShare}>
							{copied ? <Check className="w-4 h-4 min-w-4 min-h-4" /> : <Share2 className="w-4 h-4 min-w-4 min-h-4" />}
						</Button>
					</div>
				</div>
			</div>

			{/* About + Content Outline side-by-side */}
			<div className="w-full flex flex-col lg:flex-row gap-6">
				{/* Left - About */}
				<div className="w-full lg:w-1/2 flex flex-col gap-4">
					{course.descricao && (
						<div className="flex flex-col gap-2">
							<h3 className="text-sm font-bold">Sobre o curso</h3>
							<p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{course.descricao}</p>
						</div>
					)}

					<div className="flex flex-col gap-2">
						<h3 className="text-sm font-bold">Resumo</h3>
						<div className="text-xs text-muted-foreground">
							{sections.length} {sections.length === 1 ? "seção" : "seções"} &middot; {totalLessons} {totalLessons === 1 ? "aula" : "aulas"}
							{totalDuration && <> &middot; {totalDuration}</>}
						</div>
					</div>
				</div>

				{/* Right - Content outline */}
				<div className="w-full lg:w-1/2">
					<div className="border border-primary/10 rounded-xl bg-card overflow-hidden">
						<div className="px-4 py-3 border-b border-primary/10 bg-primary/[0.03]">
							<h3 className="text-sm font-bold">Conteúdo do curso</h3>
						</div>
						<div className="p-3 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
							<CourseContentOutline courseId={courseId} sections={sections} compact />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
