import type {
	TCreateCommunityCourseInput,
	TCreateCommunityCourseOutput,
	TUpdateCommunityCourseInput,
	TUpdateCommunityCourseOutput,
} from "@/app/api/admin/community/courses/route";
import type {
	TCreateCommunityLessonInput,
	TCreateCommunityLessonOutput,
	TDeleteCommunityLessonOutput,
	TUpdateCommunityLessonInput,
	TUpdateCommunityLessonOutput,
} from "@/app/api/admin/community/lessons/route";
import type { TCreateMuxUploadUrlOutput } from "@/app/api/admin/community/mux/upload-url/route";
import type { TReorderCommunityInput, TReorderCommunityOutput } from "@/app/api/admin/community/reorder/route";
import type {
	TCreateCommunityCourseSectionInput,
	TCreateCommunityCourseSectionOutput,
	TDeleteCommunityCourseSectionOutput,
	TUpdateCommunityCourseSectionInput,
	TUpdateCommunityCourseSectionOutput,
} from "@/app/api/admin/community/sections/route";
import axios from "axios";

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

export async function createCommunityCourseSection(input: TCreateCommunityCourseSectionInput) {
	const response = await axios.post<TCreateCommunityCourseSectionOutput>("/api/admin/community/sections", input);
	return response.data;
}

export async function updateCommunityCourseSection(input: TUpdateCommunityCourseSectionInput) {
	const response = await axios.put<TUpdateCommunityCourseSectionOutput>("/api/admin/community/sections", input);
	return response.data;
}

export async function deleteCommunityCourseSection(id: string) {
	const response = await axios.delete<TDeleteCommunityCourseSectionOutput>(`/api/admin/community/sections?id=${id}`);
	return response.data;
}

export async function createCommunityLesson(input: TCreateCommunityLessonInput) {
	const response = await axios.post<TCreateCommunityLessonOutput>("/api/admin/community/lessons", input);
	return response.data;
}

export async function updateCommunityLesson(input: TUpdateCommunityLessonInput) {
	const response = await axios.put<TUpdateCommunityLessonOutput>("/api/admin/community/lessons", input);
	return response.data;
}

export async function deleteCommunityLesson(id: string) {
	const response = await axios.delete<TDeleteCommunityLessonOutput>(`/api/admin/community/lessons?id=${id}`);
	return response.data;
}

export async function reorderCommunityItems(input: TReorderCommunityInput) {
	const response = await axios.put<TReorderCommunityOutput>("/api/admin/community/reorder", input);
	return response.data;
}

export async function requestMuxUploadUrl() {
	const response = await axios.post<TCreateMuxUploadUrlOutput>("/api/admin/community/mux/upload-url");
	return response.data;
}
