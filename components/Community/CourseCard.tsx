"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ACCESS_CONFIG,
	type TCourseSummary,
	formatTotalDuration,
	getTotalDurationSeconds,
	getTotalLessons,
} from "@/lib/community-helpers";
import { BookOpen, Clock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type CourseCardProps = {
	course: TCourseSummary;
};

export function CourseCard({ course }: CourseCardProps) {
	const totalLessons = getTotalLessons(course);
	const totalDuration = formatTotalDuration(getTotalDurationSeconds(course));
	const accessConfig = ACCESS_CONFIG[course.nivelAcesso];
	const AccessIcon = accessConfig.icon;

	return (
		<Link href={`/community/courses/${course.id}`} className="block group h-full">
			<Card className="h-full overflow-hidden border-primary/20 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/40">
				<div className="relative aspect-video overflow-hidden bg-muted">
					{course.thumbnailUrl ? (
						<Image
							src={course.thumbnailUrl}
							alt={course.titulo}
							fill
							className="object-cover transition-transform duration-500 group-hover:scale-105"
						/>
					) : (
						<div className="absolute inset-0 flex items-center justify-center bg-primary/5">
							<BookOpen className="h-12 w-12 text-muted-foreground/20" />
						</div>
					)}
					<div className="absolute top-3 right-3">
						<Badge className={`${accessConfig.badgeClassName} shadow-sm border-0 text-xs`}>
							<AccessIcon className="mr-1 h-3 w-3 min-w-3 min-h-3" />
							{accessConfig.label}
						</Badge>
					</div>
				</div>

				<CardHeader className="pb-2">
					<CardTitle className="line-clamp-1 text-sm font-bold group-hover:text-primary transition-colors">
						{course.titulo}
					</CardTitle>
					<CardDescription className="line-clamp-2 text-xs mt-1">
						{course.descricao || "Sem descrição disponível."}
					</CardDescription>
				</CardHeader>

				<CardFooter className="mt-auto border-t bg-muted/20 p-3">
					<div className="flex w-full items-center justify-between text-xs text-muted-foreground font-medium">
						<span className="flex items-center gap-1.5">
							<BookOpen className="h-3.5 w-3.5 min-w-3.5 min-h-3.5" />
							{totalLessons} {totalLessons === 1 ? "aula" : "aulas"}
						</span>
						{totalDuration && (
							<span className="flex items-center gap-1.5">
								<Clock className="h-3.5 w-3.5 min-w-3.5 min-h-3.5" />
								{totalDuration}
							</span>
						)}
					</div>
				</CardFooter>
			</Card>
		</Link>
	);
}
