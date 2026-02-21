"use client";

import type { TCourseSection } from "@/lib/community-helpers";
import { CourseContentOutline } from "./CourseContentOutline";
import Link from "next/link";

type LessonSidebarOutlineProps = {
	courseId: string;
	courseTitle: string;
	sections: TCourseSection[];
	activeLessonId: string;
	completedLessonIds?: Set<string>;
};

export function LessonSidebarOutline({
	courseId,
	courseTitle,
	sections,
	activeLessonId,
	completedLessonIds,
}: LessonSidebarOutlineProps) {
	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center justify-between px-4 py-3 border-b border-primary/10">
				<h3 className="font-semibold text-sm truncate">{courseTitle}</h3>
				<Link
					href={`/community/courses/${courseId}`}
					className="text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2"
				>
					Ver curso
				</Link>
			</div>
			<div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-track-primary/10 scrollbar-thumb-primary/30">
				<CourseContentOutline
					courseId={courseId}
					sections={sections}
					activeLessonId={activeLessonId}
					completedLessonIds={completedLessonIds}
					compact
				/>
			</div>
		</div>
	);
}
