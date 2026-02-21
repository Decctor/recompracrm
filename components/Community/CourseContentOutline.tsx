"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	CONTENT_TYPE_ICONS,
	type TContentType,
	type TCourseSection,
	formatDuration,
	getSectionDurationSeconds,
	formatTotalDuration,
} from "@/lib/community-helpers";
import { cn } from "@/lib/utils";
import { CheckCircle, ChevronDown, PlayCircle } from "lucide-react";
import Link from "next/link";

type CourseContentOutlineProps = {
	courseId: string;
	sections: TCourseSection[];
	activeLessonId?: string;
	completedLessonIds?: Set<string>;
	compact?: boolean;
};

export function CourseContentOutline({
	courseId,
	sections,
	activeLessonId,
	completedLessonIds,
	compact = false,
}: CourseContentOutlineProps) {
	return (
		<div className="flex flex-col gap-1">
			{sections.map((section, sIndex) => {
				const sectionDuration = getSectionDurationSeconds(section);
				const sectionDurationFormatted = formatTotalDuration(sectionDuration);
				const lessonCount = section.aulas?.length ?? 0;
				const hasActiveLesson = section.aulas?.some((a) => a.id === activeLessonId) ?? false;

				return (
					<Collapsible key={section.id} defaultOpen={hasActiveLesson || sIndex === 0}>
						<CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg hover:bg-primary/[0.04] transition-colors group text-left">
							<div className="flex items-center gap-2 min-w-0">
								<span className="text-[10px] font-bold text-muted-foreground bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
									{String(sIndex + 1).padStart(2, "0")}
								</span>
								<span className={cn("font-semibold truncate", compact ? "text-xs" : "text-sm")}>
									{section.titulo}
								</span>
							</div>
							<div className="flex items-center gap-2 shrink-0 ml-2">
								{sectionDurationFormatted && (
									<span className="text-[10px] text-muted-foreground">{sectionDurationFormatted}</span>
								)}
								<ChevronDown className="w-3.5 h-3.5 min-w-3.5 min-h-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
							</div>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<div className="flex flex-col gap-0.5 pl-2 ml-3 border-l border-primary/10">
								{section.aulas?.map((lesson) => {
									const isActive = lesson.id === activeLessonId;
									const isCompleted = completedLessonIds?.has(lesson.id) ?? false;
									const LessonIcon =
										CONTENT_TYPE_ICONS[lesson.tipoConteudo as TContentType] ?? PlayCircle;

									return (
										<Link
											key={lesson.id}
											href={`/community/courses/${courseId}/lessons/${lesson.id}`}
											className={cn(
												"flex items-center gap-2 px-3 py-2 rounded-md transition-colors",
												compact ? "text-xs" : "text-sm",
												isActive
													? "bg-primary/10 text-primary font-medium"
													: "text-muted-foreground hover:text-foreground hover:bg-primary/[0.03]",
											)}
										>
											{isCompleted ? (
												<CheckCircle className="w-3.5 h-3.5 min-w-3.5 min-h-3.5 text-emerald-500" />
											) : (
												<LessonIcon className="w-3.5 h-3.5 min-w-3.5 min-h-3.5 shrink-0" />
											)}
											<span className="flex-1 truncate">{lesson.titulo}</span>
											{lesson.duracaoSegundos && (
												<span className="text-[10px] opacity-60 shrink-0">
													{formatDuration(lesson.duracaoSegundos)}
												</span>
											)}
										</Link>
									);
								})}
							</div>
						</CollapsibleContent>
					</Collapsible>
				);
			})}
		</div>
	);
}
