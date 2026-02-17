import type { TCreateCourseInput, TCreateCourseOutput, TUpdateCourseInput, TUpdateCourseOutput } from "@/app/api/admin/community/courses/route";
import type { TCreateLessonInput, TCreateLessonOutput, TUpdateLessonInput, TUpdateLessonOutput } from "@/app/api/admin/community/lessons/route";
import type { TCreateMuxUploadUrlOutput } from "@/app/api/admin/community/mux/upload-url/route";
import type { TCreateSectionInput, TCreateSectionOutput, TUpdateSectionInput, TUpdateSectionOutput } from "@/app/api/admin/community/sections/route";
import type { CommunityReorderSchema } from "@/schemas/community";
import axios from "axios";
import type { z } from "zod";

export async function createCourse(input: TCreateCourseInput) {
	const response = await axios.post<TCreateCourseOutput>("/api/admin/community/courses", input);
	return response.data;
}

export async function updateCourse(input: TUpdateCourseInput) {
	const response = await axios.put<TUpdateCourseOutput>("/api/admin/community/courses", input);
	return response.data;
}

export async function deleteCourse(id: string) {
	const response = await axios.delete(`/api/admin/community/courses?id=${id}`);
	return response.data;
}

export async function createSection(input: TCreateSectionInput) {
	const response = await axios.post<TCreateSectionOutput>("/api/admin/community/sections", input);
	return response.data;
}

export async function updateSection(input: TUpdateSectionInput) {
	const response = await axios.put<TUpdateSectionOutput>("/api/admin/community/sections", input);
	return response.data;
}

export async function deleteSection(id: string) {
	const response = await axios.delete(`/api/admin/community/sections?id=${id}`);
	return response.data;
}

export async function createLesson(input: TCreateLessonInput) {
	const response = await axios.post<TCreateLessonOutput>("/api/admin/community/lessons", input);
	return response.data;
}

export async function updateLesson(input: TUpdateLessonInput) {
	const response = await axios.put<TUpdateLessonOutput>("/api/admin/community/lessons", input);
	return response.data;
}

export async function deleteLesson(id: string) {
	const response = await axios.delete(`/api/admin/community/lessons?id=${id}`);
	return response.data;
}

export async function reorderItems(input: z.infer<typeof CommunityReorderSchema>) {
	const response = await axios.put("/api/admin/community/reorder", input);
	return response.data;
}

export async function requestMuxUploadUrl() {
	const response = await axios.post<TCreateMuxUploadUrlOutput>("/api/admin/community/mux/upload-url");
	return response.data;
}
