import type {
	TCreateCommunityCourseInput,
	TCreateCommunityCourseOutput,
	TUpdateCommunityCourseInput,
	TUpdateCommunityCourseOutput,
} from "@/app/api/admin/community/courses/route";
import type { TCreateLessonInput, TCreateLessonOutput, TUpdateLessonInput, TUpdateLessonOutput } from "@/app/api/admin/community/lessons/route";
import type { TCreateMuxUploadUrlOutput } from "@/app/api/admin/community/mux/upload-url/route";
import type { TCreateSectionInput, TCreateSectionOutput, TUpdateSectionInput, TUpdateSectionOutput } from "@/app/api/admin/community/sections/route";
import type { CommunityReorderSchema } from "@/schemas/community";
import axios from "axios";
import type { z } from "zod";

export async function createCommunityCourse(input: TCreateCommunityCourseInput) {
	const response = await axios.post<TCreateCommunityCourseOutput>("/api/admin/community/courses", input);
	return response.data;
}

export async function updateCommunityCourse(input: TUpdateCommunityCourseInput) {
	const response = await axios.put<TUpdateCommunityCourseOutput>("/api/admin/community/courses", input);
	return response.data;
}

export async function deleteCommunityCourse(id: string) {
	const response = await axios.delete(`/api/admin/community/courses?id=${id}`);
	return response.data;
}

export async function createCommunityCourseSection(input: TCreateSectionInput) {
	const response = await axios.post<TCreateSectionOutput>("/api/admin/community/sections", input);
	return response.data;
}

export async function updateCommunityCourseSection(input: TUpdateSectionInput) {
	const response = await axios.put<TUpdateSectionOutput>("/api/admin/community/sections", input);
	return response.data;
}

export async function deleteCommunityCourseSection(id: string) {
	const response = await axios.delete(`/api/admin/community/sections?id=${id}`);
	return response.data;
}

export async function createCommunityLesson(input: TCreateLessonInput) {
	const response = await axios.post<TCreateLessonOutput>("/api/admin/community/lessons", input);
	return response.data;
}

export async function updateCommunityLesson(input: TUpdateLessonInput) {
	const response = await axios.put<TUpdateLessonOutput>("/api/admin/community/lessons", input);
	return response.data;
}

export async function deleteCommunityLesson(id: string) {
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
