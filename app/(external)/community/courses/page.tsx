"use client";

import { CommunityHeader } from "@/components/Community/CommunityHeader";
import { CourseCard } from "@/components/Community/CourseCard";
import { EmptyContentPlaceholder } from "@/components/Community/EmptyContentPlaceholder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	ACCESS_CONFIG,
	type TCourseSummary,
	formatTotalDuration,
	getTotalDurationSeconds,
	getTotalLessons,
} from "@/lib/community-helpers";
import { useCourses } from "@/lib/queries/community";
import { BookOpen, Clock, PlayCircle, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export default function CoursesListingPage() {
	const { data: coursesData, isLoading } = useCourses();
	const courses = (coursesData as TCourseSummary[] | undefined) ?? [];
	const [searchQuery, setSearchQuery] = useState("");

	const filteredCourses = searchQuery
		? courses.filter(
				(c) =>
					c.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
					c.descricao?.toLowerCase().includes(searchQuery.toLowerCase()),
			)
		: courses;

	const featuredCourse = !searchQuery && filteredCourses.length > 0 ? filteredCourses[0] : null;
	const gridCourses = searchQuery ? filteredCourses : filteredCourses.slice(1);

	return (
		<div className="w-full h-full flex flex-col gap-6 p-6">
			<CommunityHeader
				breadcrumbs={[
					{ label: "Início", href: "/community" },
					{ label: "Cursos" },
				]}
			/>

			{/* Page Header */}
			<div className="flex flex-col gap-1">
				<h1 className="text-xl font-black leading-none tracking-tight md:text-2xl text-primary">Cursos</h1>
				<p className="text-sm text-muted-foreground">
					Explore todos os cursos disponíveis para impulsionar seu conhecimento.
				</p>
			</div>

			{/* Search */}
			<div className="w-full max-w-md relative">
				<div className="flex items-center bg-background rounded-xl border border-primary/20 shadow-2xs">
					<Search className="ml-3 h-4 w-4 min-w-4 min-h-4 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Buscar cursos..."
						className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>
			</div>

			{/* Loading */}
			{isLoading && (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{Array.from({ length: 6 }).map((_, i) => (
						<div key={`skeleton-${i}`} className="space-y-3">
							<div className="aspect-video w-full rounded-xl bg-muted animate-pulse" />
							<div className="space-y-2">
								<div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
								<div className="h-4 w-full bg-muted rounded animate-pulse" />
							</div>
						</div>
					))}
				</div>
			)}

			{/* Empty */}
			{!isLoading && filteredCourses.length === 0 && (
				<EmptyContentPlaceholder
					icon={BookOpen}
					title={searchQuery ? "Nenhum curso encontrado" : "Nenhum curso disponível"}
					description={searchQuery ? "Tente buscar por outros termos." : "Em breve teremos cursos disponíveis."}
				/>
			)}

			{/* Featured Course */}
			{!isLoading && featuredCourse && (
				<section>
					<div className="group relative overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-2xs transition-all hover:shadow-lg hover:border-primary/40">
						<div className="grid lg:grid-cols-2 gap-0">
							<div className="relative h-56 lg:h-auto overflow-hidden">
								{featuredCourse.thumbnailUrl ? (
									<Image
										src={featuredCourse.thumbnailUrl}
										alt={featuredCourse.titulo}
										fill
										className="object-cover transition-transform duration-500 group-hover:scale-105"
									/>
								) : (
									<div className="absolute inset-0 flex items-center justify-center bg-primary/5">
										<BookOpen className="h-16 w-16 text-muted-foreground/20" />
									</div>
								)}
							</div>
							<div className="flex flex-col justify-center p-6 lg:p-10">
								<div className="mb-3">
									{(() => {
										const config = ACCESS_CONFIG[featuredCourse.nivelAcesso];
										const Icon = config.icon;
										return (
											<Badge className={`${config.badgeClassName} border-0 px-2.5 py-0.5 text-xs`}>
												<Icon className="mr-1 h-3 w-3 min-w-3 min-h-3" />
												{config.label}
											</Badge>
										);
									})()}
								</div>
								<h3 className="text-2xl font-bold mb-3">{featuredCourse.titulo}</h3>
								{featuredCourse.descricao && (
									<p className="text-sm text-muted-foreground mb-6 line-clamp-3">
										{featuredCourse.descricao}
									</p>
								)}
								<div className="flex items-center gap-4 text-xs text-muted-foreground mb-6">
									<span className="flex items-center gap-1.5">
										<BookOpen className="h-4 w-4 min-w-4 min-h-4" />
										{getTotalLessons(featuredCourse)} aulas
									</span>
									{getTotalDurationSeconds(featuredCourse) > 0 && (
										<span className="flex items-center gap-1.5">
											<Clock className="h-4 w-4 min-w-4 min-h-4" />
											{formatTotalDuration(getTotalDurationSeconds(featuredCourse))}
										</span>
									)}
								</div>
								<Button asChild size="lg" className="rounded-full px-8 w-fit">
									<Link href={`/community/courses/${featuredCourse.id}`}>
										Começar agora
										<PlayCircle className="ml-2 h-4 w-4 min-w-4 min-h-4" />
									</Link>
								</Button>
							</div>
						</div>
					</div>
				</section>
			)}

			{/* Course Grid */}
			{!isLoading && gridCourses.length > 0 && (
				<section className="flex flex-col gap-4">
					<h2 className="text-base font-bold tracking-tight">
						{searchQuery ? "Resultados da busca" : "Todos os cursos"}
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{gridCourses.map((course) => (
							<CourseCard key={course.id} course={course} />
						))}
					</div>
				</section>
			)}
		</div>
	);
}
