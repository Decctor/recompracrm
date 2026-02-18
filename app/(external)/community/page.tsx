"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCourses } from "@/lib/queries/community";
import { BookOpen, Clock, Globe, Lock, PlayCircle, Search, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const ACCESS_CONFIG = {
	PUBLICO: {
		icon: Globe,
		label: "Público",
		variant: "default" as const,
		className: "bg-emerald-500 hover:bg-emerald-600 border-transparent text-white",
	},
	AUTENTICADO: {
		icon: Lock,
		label: "Login necessário",
		variant: "secondary" as const,
		className: "bg-blue-500 hover:bg-blue-600 border-transparent text-white",
	},
	ASSINATURA: {
		icon: Sparkles,
		label: "Assinatura",
		variant: "destructive" as const,
		className: "bg-purple-500 hover:bg-purple-600 border-transparent text-white",
	},
};

interface Course {
	id: string;
	titulo: string;
	descricao?: string;
	thumbnailUrl?: string;
	nivelAcesso: keyof typeof ACCESS_CONFIG;
	secoes?: Array<{
		aulas?: Array<{
			duracaoSegundos?: number;
		}>;
	}>;
}

function formatTotalDuration(courses: Array<Course>, courseIndex: number) {
	const course = courses[courseIndex];
	if (!course) return null;
	const totalSeconds = course.secoes?.reduce((sum, s) => sum + (s.aulas?.reduce((aSum, a) => aSum + (a.duracaoSegundos ?? 0), 0) ?? 0), 0) ?? 0;

	if (!totalSeconds) return null;
	const hours = Math.floor(totalSeconds / 3600);
	const mins = Math.floor((totalSeconds % 3600) / 60);
	if (hours > 0) return `${hours}h ${mins}min`;
	return `${mins}min`;
}

export default function CommunityCatalogPage() {
	const { data: coursesData, isLoading } = useCourses();
	const courses = coursesData as Course[] | undefined;
	const [searchQuery, setSearchQuery] = useState("");

	const filteredCourses = courses?.filter(
		(course) => course.titulo.toLowerCase().includes(searchQuery.toLowerCase()) || course.descricao?.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const featuredCourse = filteredCourses && filteredCourses.length > 0 ? filteredCourses[0] : null;
	const otherCourses = filteredCourses && filteredCourses.length > 0 ? filteredCourses.slice(1) : [];

	return (
		<div className="min-h-screen bg-background">
			{/* Hero Section */}
			<div className="relative overflow-hidden bg-primary/5 pb-20 pt-24 sm:pt-32 lg:pb-24">
				<div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10" />
				<div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="flex flex-col items-center text-center">
						<Badge variant="outline" className="mb-6 animate-fade-in bg-background/50 backdrop-blur-sm">
							🎓 Central de Aprendizado
						</Badge>
						<h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl max-w-4xl">
							Domine suas habilidades com nossos <span className="text-primary">cursos exclusivos</span>
						</h1>
						<p className="mt-6 text-xl text-muted-foreground max-w-2xl">
							Acesse conteúdos de alta qualidade, tutoriais práticos e materiais complementares para impulsionar sua carreira.
						</p>

						<div className="mt-10 w-full max-w-md relative group">
							<div className="absolute -inset-0.5 bg-linear-to-r from-primary/50 to-purple-600/50 rounded-lg blur opacity-30 group-hover:opacity-75 transition duration-200" />
							<div className="relative flex items-center bg-background rounded-lg border border-input shadow-sm">
								<Search className="ml-3 h-5 w-5 text-muted-foreground" />
								<Input
									type="text"
									placeholder="Buscar cursos..."
									className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent py-6"
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
				{/* Loading State */}
				{isLoading && (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
						{Array.from({ length: 6 }).map((_, i) => (
							<div key={`skeleton-${i}`} className="space-y-4">
								<div className="aspect-video w-full rounded-xl bg-muted animate-pulse" />
								<div className="space-y-2">
									<div className="h-6 w-3/4 bg-muted rounded animate-pulse" />
									<div className="h-4 w-full bg-muted rounded animate-pulse" />
									<div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
								</div>
							</div>
						))}
					</div>
				)}

				{!isLoading && (!courses || courses.length === 0) && (
					<div className="text-center py-20">
						<div className="rounded-full bg-primary/10 p-6 w-fit mx-auto mb-6">
							<BookOpen className="w-12 h-12 text-primary" />
						</div>
						<h3 className="text-2xl font-bold mb-3">Nenhum curso encontrado</h3>
						<p className="text-muted-foreground max-w-md mx-auto">
							{searchQuery ? "Tente buscar por outros termos." : "Em breve teremos novos conteúdos disponíveis."}
						</p>
					</div>
				)}

				{!isLoading && filteredCourses && filteredCourses.length > 0 && (
					<div className="space-y-20">
						{/* Featured Course (only shows if no search query or if it's the top match) */}
						{!searchQuery && featuredCourse && (
							<section>
								<div className="flex items-center justify-between mb-8">
									<h2 className="text-2xl font-bold tracking-tight">Destaque</h2>
								</div>
								<div className="group relative overflow-hidden rounded-3xl border bg-card shadow-xl transition-all hover:shadow-2xl">
									<div className="grid lg:grid-cols-2 gap-0">
										<div className="relative h-64 lg:h-auto overflow-hidden">
											{featuredCourse.thumbnailUrl ? (
												<Image
													src={featuredCourse.thumbnailUrl}
													alt={featuredCourse.titulo}
													fill
													className="object-cover transition-transform duration-500 group-hover:scale-105"
												/>
											) : (
												<div className="absolute inset-0 flex items-center justify-center bg-muted">
													<BookOpen className="h-20 w-20 text-muted-foreground/20" />
												</div>
											)}
											<div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent lg:hidden" />
										</div>
										<div className="flex flex-col justify-center p-8 lg:p-12">
											<div className="mb-4">
												{(() => {
													const config = ACCESS_CONFIG[featuredCourse.nivelAcesso as keyof typeof ACCESS_CONFIG];
													const Icon = config.icon;
													return (
														<Badge className={`${config.className} border-0 px-3 py-1 text-sm`}>
															<Icon className="mr-1.5 h-3.5 w-3.5" />
															{config.label}
														</Badge>
													);
												})()}
											</div>
											<h3 className="text-3xl font-bold mb-4">{featuredCourse.titulo}</h3>
											{featuredCourse.descricao && <p className="text-lg text-muted-foreground mb-8 line-clamp-3">{featuredCourse.descricao}</p>}
											<div className="flex items-center gap-6 text-sm text-muted-foreground mb-8">
												<div className="flex items-center gap-2">
													<BookOpen className="h-5 w-5" />
													<span>{featuredCourse.secoes?.reduce((sum: number, s: any) => sum + (s.aulas?.length ?? 0), 0) ?? 0} aulas</span>
												</div>
												<div className="flex items-center gap-2">
													<Clock className="h-5 w-5" />
													<span>{formatTotalDuration(courses ?? [], 0) || "Duração variada"}</span>
												</div>
											</div>
											<div className="flex gap-4">
												<Button asChild size="lg" className="rounded-full px-8">
													<Link href={`/community/${featuredCourse.id}`}>
														Começar agora
														<PlayCircle className="ml-2 h-5 w-5" />
													</Link>
												</Button>
											</div>
										</div>
									</div>
								</div>
							</section>
						)}

						{/* Course Grid */}
						{(searchQuery || otherCourses.length > 0) && (
							<section>
								<div className="flex items-center justify-between mb-8">
									<h2 className="text-2xl font-bold tracking-tight">{searchQuery ? "Resultados da busca" : "Todos os cursos"}</h2>
								</div>
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
									{(searchQuery ? filteredCourses : otherCourses).map((course: any, idx: number) => {
										// Compensate index if we're showing otherCourses
										const realIndex = searchQuery ? idx : idx + 1;
										const totalLessons = course.secoes?.reduce((sum: number, s: any) => sum + (s.aulas?.length ?? 0), 0) ?? 0;
										const duration = formatTotalDuration(courses ?? [], realIndex);
										const accessConfig = ACCESS_CONFIG[course.nivelAcesso as keyof typeof ACCESS_CONFIG];
										const AccessIcon = accessConfig.icon;

										return (
											<Link key={course.id} href={`/community/${course.id}`} className="block group h-full">
												<Card className="h-full overflow-hidden border-muted transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
													<div className="relative aspect-video overflow-hidden bg-muted">
														{course.thumbnailUrl ? (
															<Image
																src={course.thumbnailUrl}
																alt={course.titulo}
																fill
																className="object-cover transition-transform duration-500 group-hover:scale-105"
															/>
														) : (
															<div className="absolute inset-0 flex items-center justify-center">
																<BookOpen className="h-12 w-12 text-muted-foreground/20" />
															</div>
														)}
														<div className="absolute top-3 right-3">
															<Badge className={`${accessConfig.className} shadow-sm border-0`}>
																<AccessIcon className="mr-1 h-3 w-3" />
																{accessConfig.label}
															</Badge>
														</div>
													</div>

													<CardHeader>
														<CardTitle className="line-clamp-1 group-hover:text-primary transition-colors">{course.titulo}</CardTitle>
														<CardDescription className="line-clamp-2 mt-2">{course.descricao || "Sem descrição disponível."}</CardDescription>
													</CardHeader>

													<CardFooter className="mt-auto border-t bg-muted/20 p-4">
														<div className="flex w-full items-center justify-between text-xs text-muted-foreground font-medium">
															<span className="flex items-center gap-1.5">
																<BookOpen className="h-3.5 w-3.5" />
																{totalLessons} {totalLessons === 1 ? "aula" : "aulas"}
															</span>
															{duration && (
																<span className="flex items-center gap-1.5">
																	<Clock className="h-3.5 w-3.5" />
																	{duration}
																</span>
															)}
														</div>
													</CardFooter>
												</Card>
											</Link>
										);
									})}
								</div>
							</section>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
