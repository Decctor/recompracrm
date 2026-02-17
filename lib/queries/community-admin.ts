import type { TGetCommunityCoursesInput, TGetCommunityCoursesOutput } from "@/app/api/admin/community/courses/route";
import type { TGetLessonOutput } from "@/app/api/admin/community/lessons/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchAdminCommunityCourseById(courseId: string) {
	const { data } = await axios.get<TGetCommunityCoursesOutput>(`/api/admin/community/courses?id=${courseId}`);
	const result = data.data.byId;
	if (!result) throw new Error("Curso não encontrado.");
	return result;
}

export function useAdminCommunityCourseById({ courseId }: { courseId: string }) {
	return {
		...useQuery({
			queryKey: ["admin-community-course-by-id", courseId],
			queryFn: () => fetchAdminCommunityCourseById(courseId),
		}),
		queryKey: ["admin-community-course-by-id", courseId],
	};
}

async function fetchAdminCommunityLessonById(lessonId: string) {
	const { data } = await axios.get<TGetLessonOutput>(`/api/admin/community/lessons?id=${lessonId}`);
	return data.data;
}

export function useAdminCommunityLessonById({ lessonId }: { lessonId: string }) {
	return {
		...useQuery({
			queryKey: ["admin-community-lesson-by-id", lessonId],
			queryFn: () => fetchAdminCommunityLessonById(lessonId),
			enabled: !!lessonId,
		}),
		queryKey: ["admin-community-lesson-by-id", lessonId],
	};
}

async function fetchAdminCommunityCourses(input: TGetCommunityCoursesInput) {
	const response = await axios.get<TGetCommunityCoursesOutput>("/api/admin/community/courses");
	const defaultResult = response.data.data.default;
	if (!defaultResult) throw new Error("Cursos não encontrados.");
	return defaultResult;
}

type TUseAdminCommunityCoursesParams = {
	initialParams?: Partial<TGetCommunityCoursesInput>;
};
export function useAdminCommunityCourses({ initialParams }: TUseAdminCommunityCoursesParams) {
	const [params, setParams] = useState<TGetCommunityCoursesInput>({
		page: initialParams?.page || 1,
		search: initialParams?.search || "",
		status: initialParams?.status || [],
		periodFilter: initialParams?.periodFilter || null,
		periodAfter: initialParams?.periodAfter || null,
		periodBefore: initialParams?.periodBefore || null,
	});
	function updateParams(newParams: Partial<TGetCommunityCoursesInput>) {
		setParams((prevParams) => ({ ...prevParams, ...newParams }));
	}
	const debouncedParams = useDebounceMemo(params, 500);
	return {
		...useQuery({
			queryKey: ["admin-community-courses", debouncedParams],
			queryFn: () => fetchAdminCommunityCourses(debouncedParams),
		}),
		queryKey: ["admin-community-courses", debouncedParams],
		params,
		updateParams,
	};
}
