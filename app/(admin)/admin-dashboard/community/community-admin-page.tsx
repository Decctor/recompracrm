"use client";

import { Button } from "@/components/ui/button";
import { useAdminCourses } from "@/lib/queries/community-admin";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import CourseForm from "./components/CourseForm/CourseForm";
import CourseListBlock from "./components/CourseListBlock";

export default function CommunityAdminPage() {
	const [courseFormOpen, setCourseFormOpen] = useState(false);
	const [editingCourseId, setEditingCourseId] = useState<string | null>(null);

	const coursesQuery = useAdminCourses();

	function handleEditCourse(courseId: string) {
		setEditingCourseId(courseId);
		setCourseFormOpen(true);
	}

	function handleCloseCourseForm() {
		setCourseFormOpen(false);
		setEditingCourseId(null);
	}

	return (
		<div className="w-full h-full flex flex-col gap-6 p-4 lg:p-6">
			{/* Header */}
			<div className="w-full flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Link href="/admin-dashboard">
						<Button variant="outline" size="icon" className="h-8 w-8">
							<ArrowLeft className="w-4 h-4" />
						</Button>
					</Link>
					<div>
						<h1 className="text-2xl font-bold tracking-tight">Comunidade</h1>
						<p className="text-sm text-muted-foreground">Gerencie cursos, seções e aulas da comunidade</p>
					</div>
				</div>
				<Button onClick={() => setCourseFormOpen(true)} className="flex items-center gap-2">
					<Plus className="w-4 h-4 min-w-4 min-h-4" />
					NOVO CURSO
				</Button>
			</div>

			{/* Course list */}
			<CourseListBlock coursesQuery={coursesQuery} onEditCourse={handleEditCourse} />

			{/* Course form modal */}
			{courseFormOpen && (
				<CourseForm
					courseId={editingCourseId}
					coursesData={coursesQuery.data?.data}
					closeModal={handleCloseCourseForm}
				/>
			)}
		</div>
	);
}
