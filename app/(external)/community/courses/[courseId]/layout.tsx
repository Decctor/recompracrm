import { db } from "@/services/drizzle";
import type { Metadata } from "next";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { courseId } = await params;

	const course = await db.query.communityCourses.findFirst({
		where: (fields, { eq }) => eq(fields.id, courseId),
		columns: { titulo: true, descricao: true, thumbnailUrl: true },
	});

	if (!course) {
		return { title: "Curso não encontrado" };
	}

	const images = course.thumbnailUrl ? [{ url: course.thumbnailUrl, alt: course.titulo }] : [];

	return {
		title: course.titulo,
		description: course.descricao ?? undefined,
		openGraph: {
			title: `${course.titulo} | RecompraCRM`,
			description: course.descricao ?? undefined,
			url: `https://recompracrm.com.br/community/courses/${courseId}`,
			images,
		},
		twitter: {
			card: "summary_large_image",
			title: `${course.titulo} | RecompraCRM`,
			description: course.descricao ?? undefined,
			images: course.thumbnailUrl ? [course.thumbnailUrl] : undefined,
		},
	};
}

export default function CourseDetailLayout({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}
