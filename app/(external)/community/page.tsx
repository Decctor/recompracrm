"use client";

import { CommunityHeader } from "@/components/Community/CommunityHeader";
import { CommunityHero } from "@/components/Community/CommunityHero";
import { ContentSectionHeader } from "@/components/Community/ContentSectionHeader";
import { CourseCard } from "@/components/Community/CourseCard";
import { EmptyContentPlaceholder } from "@/components/Community/EmptyContentPlaceholder";
import type { TCourseSummary } from "@/lib/community-helpers";
import { useCourses, usePublicCommunityMaterials } from "@/lib/queries/community";
import { BookOpen, BookText, FileText, GraduationCap } from "lucide-react";
import { useState } from "react";

export default function CommunityHubPage() {
	const { data: coursesData, isLoading } = useCourses();
	const { data: materials = [], isLoading: isMaterialsLoading } = usePublicCommunityMaterials();
	const courses = (coursesData as TCourseSummary[] | undefined) ?? [];
	const [searchQuery, setSearchQuery] = useState("");

	const filteredCourses = searchQuery
		? courses.filter(
				(c) => c.titulo.toLowerCase().includes(searchQuery.toLowerCase()) || c.descricao?.toLowerCase().includes(searchQuery.toLowerCase()),
			)
		: courses;

	const featuredCourses = filteredCourses.slice(0, 3);
	const featuredEbooks = materials.filter((material) => material.tipo === "EBOOK").slice(0, 3);
	const featuredDocuments = materials.filter((material) => material.tipo !== "EBOOK").slice(0, 3);

	return (
		<div className="w-full h-full flex flex-col gap-6 p-6">
			<CommunityHeader breadcrumbs={[{ label: "Início" }]} />
			<CommunityHero searchQuery={searchQuery} onSearchChange={setSearchQuery} />

			{/* Courses Section */}
			<section className="flex flex-col gap-4">
				<ContentSectionHeader title="Cursos em Destaque" href="/community/courses" />

				{isLoading && (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{Array.from({ length: 3 }).map((_, i) => (
							<div key={`skeleton-${i.toString()}`} className="space-y-3">
								<div className="aspect-video w-full rounded-xl bg-muted animate-pulse" />
								<div className="space-y-2">
									<div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
									<div className="h-4 w-full bg-muted rounded animate-pulse" />
								</div>
							</div>
						))}
					</div>
				)}

				{!isLoading && featuredCourses.length === 0 && (
					<EmptyContentPlaceholder
						icon={BookOpen}
						title={searchQuery ? "Nenhum curso encontrado" : "Nenhum curso disponível"}
						description={searchQuery ? "Tente buscar por outros termos." : "Em breve teremos cursos disponíveis."}
					/>
				)}

				{!isLoading && featuredCourses.length > 0 && (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{featuredCourses.map((course) => (
							<CourseCard key={course.id} course={course} />
						))}
					</div>
				)}
			</section>

			{/* Documents Section */}
			<section className="flex flex-col gap-4">
				<ContentSectionHeader title="Documentos em Destaque" href="/community/documents" />
				{isMaterialsLoading ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{Array.from({ length: 3 }).map((_, i) => (
							<div key={`document-skeleton-${i.toString()}`} className="space-y-3">
								<div className="aspect-video w-full rounded-xl bg-muted animate-pulse" />
								<div className="space-y-2">
									<div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
									<div className="h-4 w-full bg-muted rounded animate-pulse" />
								</div>
							</div>
						))}
					</div>
				) : null}
				{!isMaterialsLoading && featuredDocuments.length === 0 ? (
					<EmptyContentPlaceholder icon={FileText} title="Nada por aqui por enquanto :(" description="Em breve teremos documentos disponíveis." />
				) : null}
				{!isMaterialsLoading && featuredDocuments.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{featuredDocuments.map((material) => (
							<div key={material.id} className="rounded-xl border border-primary/15 bg-card p-4 shadow-2xs">
								<h3 className="text-sm font-bold tracking-tight line-clamp-2">{material.titulo}</h3>
								<p className="mt-1 text-xs text-muted-foreground line-clamp-3">{material.descricao}</p>
								<a href={`/community/documents/${material.id}`} className="mt-3 inline-flex text-xs font-medium text-primary hover:text-primary/80">
									Ver detalhes
								</a>
							</div>
						))}
					</div>
				) : null}
			</section>

			{/* Ebooks Section */}
			<section className="flex flex-col gap-4">
				<ContentSectionHeader title="eBooks em Destaque" href="/community/ebooks" />
				{isMaterialsLoading ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{Array.from({ length: 3 }).map((_, i) => (
							<div key={`ebook-skeleton-${i.toString()}`} className="space-y-3">
								<div className="aspect-video w-full rounded-xl bg-muted animate-pulse" />
								<div className="space-y-2">
									<div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
									<div className="h-4 w-full bg-muted rounded animate-pulse" />
								</div>
							</div>
						))}
					</div>
				) : null}
				{!isMaterialsLoading && featuredEbooks.length === 0 ? (
					<EmptyContentPlaceholder icon={BookText} title="Nada por aqui por enquanto :(" description="Em breve teremos eBooks disponíveis." />
				) : null}
				{!isMaterialsLoading && featuredEbooks.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{featuredEbooks.map((material) => (
							<div key={material.id} className="rounded-xl border border-primary/15 bg-card p-4 shadow-2xs">
								<h3 className="text-sm font-bold tracking-tight line-clamp-2">{material.titulo}</h3>
								<p className="mt-1 text-xs text-muted-foreground line-clamp-3">{material.descricao}</p>
								<a href={`/community/ebooks/${material.id}`} className="mt-3 inline-flex text-xs font-medium text-primary hover:text-primary/80">
									Ver detalhes
								</a>
							</div>
						))}
					</div>
				) : null}
			</section>
		</div>
	);
}
