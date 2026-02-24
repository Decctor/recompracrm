import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { TGetPublicCommunityCoursesOutput } from "@/app/api/community/courses/public/route";
import type { TGetPublicCommunityLessonsOutput } from "@/app/api/community/lessons/public/route";
import type { TGetPublicCommunityMaterialsOutput } from "@/app/api/community/materials/public/route";

export function useCourses() {
	return useQuery({
		queryKey: ["community-courses"],
		queryFn: async () => {
			const { data } = await axios.get<TGetPublicCommunityCoursesOutput>("/api/community/courses/public");
			return data.data.default;
		},
	});
}

export function useCourseDetail(courseId: string) {
	return useQuery({
		queryKey: ["community-course", courseId],
		queryFn: async () => {
			const { data } = await axios.get<TGetPublicCommunityCoursesOutput>(`/api/community/courses/public?id=${courseId}`);
			return data.data.byId;
		},
		enabled: !!courseId,
	});
}

export function useLesson(lessonId: string) {
	return useQuery({
		queryKey: ["community-lesson", lessonId],
		queryFn: async () => {
			const { data } = await axios.get<TGetPublicCommunityLessonsOutput>(`/api/community/lessons/public?id=${lessonId}`);
			return data.data.byId;
		},
		enabled: !!lessonId,
	});
}

export function usePublicCommunityMaterials(params?: { tipo?: string[]; search?: string }) {
	return useQuery({
		queryKey: ["community-materials", params],
		queryFn: async () => {
			const searchParams = new URLSearchParams();
			if (params?.search?.trim()) searchParams.set("search", params.search.trim());
			if (params?.tipo && params.tipo.length > 0) searchParams.set("tipo", params.tipo.join(","));
			const { data } = await axios.get<TGetPublicCommunityMaterialsOutput>(
				`/api/community/materials/public${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
			);
			return data.data.default ?? [];
		},
	});
}

export function usePublicCommunityMaterialById(materialId: string) {
	return useQuery({
		queryKey: ["community-material", materialId],
		queryFn: async () => {
			const { data } = await axios.get<TGetPublicCommunityMaterialsOutput>(`/api/community/materials/public?id=${materialId}`);
			return data.data.byId;
		},
		enabled: !!materialId,
	});
}

export function useUserProgress(cursoId?: string) {
	return useQuery({
		queryKey: ["community-progress", cursoId],
		queryFn: async () => {
			const url = cursoId ? `/api/community/progress?cursoId=${cursoId}` : "/api/community/progress";
			const { data } = await axios.get(url);
			return data.data;
		},
	});
}
