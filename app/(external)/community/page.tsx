"use client";

import { useCourses } from "@/lib/queries/community";
import { BookOpen, Clock, Globe, Lock, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const ACCESS_CONFIG = {
	PUBLICO: { icon: Globe, label: "Público", className: "text-emerald-600 bg-emerald-50 border-emerald-200" },
	AUTENTICADO: { icon: Lock, label: "Login necessário", className: "text-blue-600 bg-blue-50 border-blue-200" },
	ASSINATURA: { icon: Sparkles, label: "Assinatura", className: "text-purple-600 bg-purple-50 border-purple-200" },
};

function formatTotalDuration(courses: Array<{ secoes: Array<{ aulas: Array<{ duracaoSegundos: number | null }> }> }>, courseIndex: number) {
	const course = courses[courseIndex];
	if (!course) return null;
	const totalSeconds = course.secoes.reduce(
		(sum, s) => sum + s.aulas.reduce((aSum, a) => aSum + (a.duracaoSegundos ?? 0), 0),
		0,
	);
	if (!totalSeconds) return null;
	const hours = Math.floor(totalSeconds / 3600);
	const mins = Math.floor((totalSeconds % 3600) / 60);
	if (hours > 0) return `${hours}h ${mins}min`;
	return `${mins}min`;
}

export default function CommunityCatalogPage() {
	const { data: courses, isLoading } = useCourses();

	return (
		<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
			{/* Hero */}
			<div className="text-center mb-10">
				<h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Nossos Cursos</h1>
				<p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
					Aprenda com nossos conteúdos exclusivos. Vídeos, tutoriais e materiais para impulsionar seus resultados.
				</p>
			</div>

			{/* Loading state */}
			{isLoading && (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
					{Array.from({ length: 6 }).map((_, i) => (
						<div key={`skeleton-${i}`} className="rounded-xl border border-primary/10 overflow-hidden animate-pulse">
							<div className="aspect-video bg-primary/5" />
							<div className="p-5 space-y-3">
								<div className="h-5 bg-primary/5 rounded w-3/4" />
								<div className="h-4 bg-primary/5 rounded w-full" />
								<div className="h-4 bg-primary/5 rounded w-1/2" />
							</div>
						</div>
					))}
				</div>
			)}

			{/* Empty state */}
			{!isLoading && (!courses || courses.length === 0) && (
				<div className="text-center py-20">
					<div className="rounded-full bg-primary/10 p-5 w-fit mx-auto mb-4">
						<BookOpen className="w-10 h-10 text-primary/40" />
					</div>
					<h3 className="text-xl font-semibold mb-2">Nenhum curso disponível</h3>
					<p className="text-muted-foreground">Em breve teremos novos conteúdos. Fique ligado!</p>
				</div>
			)}

			{/* Course grid */}
			{courses && courses.length > 0 && (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
					{courses.map((course: any, idx: number) => {
						const totalLessons = course.secoes?.reduce((sum: number, s: any) => sum + (s.aulas?.length ?? 0), 0) ?? 0;
						const duration = formatTotalDuration(courses, idx);
						const accessConfig = ACCESS_CONFIG[course.nivelAcesso as keyof typeof ACCESS_CONFIG];
						const AccessIcon = accessConfig.icon;

						return (
							<Link
								key={course.id}
								href={`/community/${course.id}`}
								className="group rounded-xl border border-primary/10 overflow-hidden bg-card hover:shadow-lg hover:border-primary/20 transition-all duration-200"
							>
								{/* Thumbnail */}
								<div className="relative aspect-video bg-gradient-to-br from-primary/5 to-primary/10 overflow-hidden">
									{course.thumbnailUrl ? (
										<Image
											src={course.thumbnailUrl}
											alt={course.titulo}
											fill
											className="object-cover group-hover:scale-105 transition-transform duration-300"
										/>
									) : (
										<div className="w-full h-full flex items-center justify-center">
											<BookOpen className="w-16 h-16 text-primary/15" />
										</div>
									)}
									{/* Access badge */}
									<div className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${accessConfig.className}`}>
										<AccessIcon className="w-3 h-3" />
										{accessConfig.label}
									</div>
								</div>

								{/* Content */}
								<div className="p-5">
									<h3 className="font-semibold text-base mb-1.5 group-hover:text-primary transition-colors line-clamp-1">
										{course.titulo}
									</h3>
									{course.descricao && (
										<p className="text-sm text-muted-foreground line-clamp-2 mb-3">{course.descricao}</p>
									)}
									<div className="flex items-center gap-3 text-xs text-muted-foreground">
										<span className="flex items-center gap-1">
											<BookOpen className="w-3.5 h-3.5" />
											{totalLessons} {totalLessons === 1 ? "aula" : "aulas"}
										</span>
										{duration && (
											<span className="flex items-center gap-1">
												<Clock className="w-3.5 h-3.5" />
												{duration}
											</span>
										)}
									</div>
								</div>
							</Link>
						);
					})}
				</div>
			)}
		</div>
	);
}
