import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export function useCourses() {
	return useQuery({
		queryKey: ["community-courses"],
		queryFn: async () => {
			const { data } = await axios.get("/api/community/courses");
			return data.data;
		},
	});
}

export function useCourseDetail(courseId: string) {
	return useQuery({
		queryKey: ["community-course", courseId],
		queryFn: async () => {
			const { data } = await axios.get(`/api/community/courses/${courseId}`);
			return data.data;
		},
		enabled: !!courseId,
	});
}

export function useLesson(lessonId: string) {
	return useQuery({
		queryKey: ["community-lesson", lessonId],
		queryFn: async () => {
			const { data } = await axios.get(`/api/community/lessons/${lessonId}`);
			return data.data;
		},
		enabled: !!lessonId,
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
