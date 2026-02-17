import type { TGetAdminCoursesOutput } from "@/app/api/admin/community/courses/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

async function fetchAdminCourses() {
	const response = await axios.get<TGetAdminCoursesOutput>("/api/admin/community/courses");
	return response.data;
}

export function useAdminCourses() {
	return useQuery({
		queryKey: ["admin-community-courses"],
		queryFn: fetchAdminCourses,
	});
}
