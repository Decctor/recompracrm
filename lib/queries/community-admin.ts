import type { TGetCommunityCoursesInput, TGetCommunityCoursesOutput } from "@/app/api/admin/community/courses/route";
import type { TGetCommunityLessonsOutput } from "@/app/api/admin/community/lessons/route";
import type { TGetCommunityMaterialsInput, TGetCommunityMaterialsOutput } from "@/app/api/admin/community/materials/route";
import type { TGetCommunityCourseSectionsOutput } from "@/app/api/admin/community/sections/route";
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

async function fetchAdminCommunityCourseSectionById(sectionId: string) {
	const { data } = await axios.get<TGetCommunityCourseSectionsOutput>(`/api/admin/community/sections?id=${sectionId}`);
	const result = data.data.byId;
	if (!result) throw new Error("Seção não encontrada.");
	return result;
}

export function useAdminCommunityCourseSectionById({ sectionId }: { sectionId: string }) {
	return {
		...useQuery({
			queryKey: ["admin-community-course-section-by-id", sectionId],
			queryFn: () => fetchAdminCommunityCourseSectionById(sectionId),
		}),
		queryKey: ["admin-community-course-section-by-id", sectionId],
	};
}

async function fetchAdminCommunityLessonById(lessonId: string) {
	const { data } = await axios.get<TGetCommunityLessonsOutput>(`/api/admin/community/lessons?id=${lessonId}`);
	const result = data.data.byId;
	if (!result) throw new Error("Aula não encontrada.");
	return result;
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
	const searchParams = new URLSearchParams();
	searchParams.set("page", String(input.page));
	if (input.search?.trim()) searchParams.set("search", input.search.trim());
	if (input.status && input.status.length > 0) searchParams.set("status", input.status.join(","));
	if (input.periodFilter) searchParams.set("periodFilter", input.periodFilter);
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());

	const response = await axios.get<TGetCommunityCoursesOutput>(`/api/admin/community/courses?${searchParams.toString()}`);
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

async function fetchAdminCommunityMaterialById(materialId: string) {
	const { data } = await axios.get<TGetCommunityMaterialsOutput>(`/api/admin/community/materials?id=${materialId}`);
	const result = data.data.byId;
	if (!result) throw new Error("Material não encontrado.");
	return result;
}

export function useAdminCommunityMaterialById({ materialId }: { materialId: string }) {
	return {
		...useQuery({
			queryKey: ["admin-community-material-by-id", materialId],
			queryFn: () => fetchAdminCommunityMaterialById(materialId),
			enabled: !!materialId,
		}),
		queryKey: ["admin-community-material-by-id", materialId],
	};
}

async function fetchAdminCommunityMaterials(input: TGetCommunityMaterialsInput) {
	const searchParams = new URLSearchParams();
	searchParams.set("page", String(input.page));
	if (input.search?.trim()) searchParams.set("search", input.search.trim());
	if (input.status && input.status.length > 0) searchParams.set("status", input.status.join(","));
	if (input.tipo && input.tipo.length > 0) searchParams.set("tipo", input.tipo.join(","));
	if (input.periodFilter) searchParams.set("periodFilter", input.periodFilter);
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter.toISOString());
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore.toISOString());

	const response = await axios.get<TGetCommunityMaterialsOutput>(`/api/admin/community/materials?${searchParams.toString()}`);
	const defaultResult = response.data.data.default;
	if (!defaultResult) throw new Error("Materiais não encontrados.");
	return defaultResult;
}

type TUseAdminCommunityMaterialsParams = {
	initialParams?: Partial<TGetCommunityMaterialsInput>;
};
export function useAdminCommunityMaterials({ initialParams }: TUseAdminCommunityMaterialsParams) {
	const [params, setParams] = useState<TGetCommunityMaterialsInput>({
		page: initialParams?.page || 1,
		search: initialParams?.search || "",
		status: initialParams?.status || [],
		tipo: initialParams?.tipo || [],
		periodFilter: initialParams?.periodFilter || null,
		periodAfter: initialParams?.periodAfter || null,
		periodBefore: initialParams?.periodBefore || null,
	});
	function updateParams(newParams: Partial<TGetCommunityMaterialsInput>) {
		setParams((prevParams) => ({ ...prevParams, ...newParams }));
	}
	const debouncedParams = useDebounceMemo(params, 500);
	return {
		...useQuery({
			queryKey: ["admin-community-materials", debouncedParams],
			queryFn: () => fetchAdminCommunityMaterials(debouncedParams),
		}),
		queryKey: ["admin-community-materials", debouncedParams],
		params,
		updateParams,
	};
}
