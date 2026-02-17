"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import type { useAdminCourses } from "@/lib/queries/community-admin";
import CourseCard from "./CourseCard";

type CourseListBlockProps = {
	coursesQuery: ReturnType<typeof useAdminCourses>;
	onEditCourse: (courseId: string) => void;
};

export default function CourseListBlock({ coursesQuery, onEditCourse }: CourseListBlockProps) {
	if (coursesQuery.isLoading) return <LoadingComponent />;
	if (coursesQuery.error) return <ErrorComponent msg="Erro ao carregar cursos." />;

	const courses = coursesQuery.data?.data ?? [];

	if (courses.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-20 text-center">
				<div className="rounded-full bg-primary/10 p-4 mb-4">
					<svg className="w-8 h-8 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
						<path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
					</svg>
				</div>
				<h3 className="text-lg font-semibold">Nenhum curso cadastrado</h3>
				<p className="text-sm text-muted-foreground mt-1">Clique em &ldquo;NOVO CURSO&rdquo; para começar.</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
			{courses.map((course) => (
				<CourseCard key={course.id} course={course} onEdit={() => onEditCourse(course.id)} />
			))}
		</div>
	);
}
