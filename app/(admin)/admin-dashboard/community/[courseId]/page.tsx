import UnauthorizedPage from "@/components/Utils/UnauthorizedPage";
import { getCurrentSession } from "@/lib/authentication/session";
import { redirect } from "next/navigation";
import CourseEditorPage from "./course-editor-page";

export default async function AdminCourseEditor({ params }: { params: Promise<{ courseId: string }> }) {
	const authSession = await getCurrentSession();
	if (!authSession) redirect("/auth/signin");
	if (!authSession.user.admin)
		return <UnauthorizedPage message="Oops, aparentemente você não possui permissão para acessar essa área." />;

	const { courseId } = await params;
	return <CourseEditorPage courseId={courseId} />;
}
