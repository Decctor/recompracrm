import type { TGetOrganizationInput, TGetOrganizationsAdminOutput } from "@/app/api/admin/organizations/route";
import type { TGetOrganizationDeletionSummaryOutput } from "@/app/api/admin/organizations/deletion-summary/route";
import type { TGetAdminStatsOutput } from "@/app/api/admin/stats/route";
import type { TGetUsersAdminInput, TGetUsersAdminOutput } from "@/app/api/admin/users/route";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchAdminStats() {
	const response = await axios.get<TGetAdminStatsOutput>("/api/admin/stats");
	return response.data;
}

async function fetchOrganizations(input: TGetOrganizationInput) {
	const searchParams = new URLSearchParams();
	if (input.id) searchParams.set("id", input.id);
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());
	if (input.search) searchParams.set("search", input.search);

	const queryString = searchParams.toString();
	const response = await axios.get<TGetOrganizationsAdminOutput>(`/api/admin/organizations?${queryString}`);
	const defaultResult = response.data.data.default;
	if (!defaultResult) throw new Error("Organizações não encontradas.");
	return defaultResult;
}

async function fetchOrganizationById(id: string) {
	const response = await axios.get<TGetOrganizationsAdminOutput>(`/api/admin/organizations?id=${id}`);
	const byIdResult = response.data.data.byId;
	if (!byIdResult) throw new Error("Organização não encontrada.");
	return byIdResult;
}

export function useAdminStats() {
	return useQuery({
		queryKey: ["admin-stats"],
		queryFn: fetchAdminStats,
	});
}

export function useOrganizations() {
	const [params, setParams] = useState<TGetOrganizationInput>({
		page: 1,
		pageSize: DEFAULT_PAGE_SIZE,
		search: null,
	});

	function updateParams(newParams: Partial<TGetOrganizationInput>) {
		setParams((prevParams) => ({ ...prevParams, ...newParams }));
	}
	const debouncedSearch = useDebounceMemo({ search: params.search }, 1000);
	const finalParams = { ...params, ...debouncedSearch };
	return {
		...useQuery({
			queryKey: ["admin-organizations", finalParams],
			queryFn: () => fetchOrganizations(finalParams),
		}),
		queryKey: ["admin-organizations", finalParams],
		params,
		updateParams,
	};
}

export function useOrganizationById({ id }: { id: string }) {
	return useQuery({
		queryKey: ["admin-organization-by-id", id],
		queryFn: () => fetchOrganizationById(id),
	});
}

async function fetchOrganizationDeletionSummary(id: string) {
	const response = await axios.get<TGetOrganizationDeletionSummaryOutput>(`/api/admin/organizations/deletion-summary?id=${id}`);
	return response.data.data;
}

export function useOrganizationDeletionSummary({ id }: { id: string }) {
	return {
		...useQuery({
			queryKey: ["admin-organization-deletion-summary", id],
			queryFn: () => fetchOrganizationDeletionSummary(id),
		}),
		queryKey: ["admin-organization-deletion-summary", id],
	};
}

async function fetchAdminUsers(input: TGetUsersAdminInput) {
	const searchParams = new URLSearchParams();
	if (input.id) searchParams.set("id", input.id);
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());
	if (input.search) searchParams.set("search", input.search);

	const queryString = searchParams.toString();
	const response = await axios.get<TGetUsersAdminOutput>(`/api/admin/users?${queryString}`);
	const defaultResult = response.data.data.default;
	if (!defaultResult) throw new Error("Usuários não encontrados.");
	return defaultResult;
}

async function fetchAdminUserById(id: string) {
	const response = await axios.get<TGetUsersAdminOutput>(`/api/admin/users?id=${id}`);
	const byIdResult = response.data.data.byId;
	if (!byIdResult) throw new Error("Usuário não encontrado.");
	return byIdResult;
}

export function useAdminUsers() {
	const [params, setParams] = useState<TGetUsersAdminInput>({
		page: 1,
		pageSize: DEFAULT_PAGE_SIZE,
		search: null,
	});

	function updateParams(newParams: Partial<TGetUsersAdminInput>) {
		setParams((prevParams) => ({ ...prevParams, ...newParams }));
	}
	const debouncedSearch = useDebounceMemo({ search: params.search }, 1000);
	const finalParams = { ...params, ...debouncedSearch };
	return {
		...useQuery({
			queryKey: ["admin-users", finalParams],
			queryFn: () => fetchAdminUsers(finalParams),
		}),
		queryKey: ["admin-users", finalParams],
		params,
		updateParams,
	};
}

export function useAdminUserById({ id }: { id: string }) {
	return {
		...useQuery({
			queryKey: ["admin-user-by-id", id],
			queryFn: () => fetchAdminUserById(id),
		}),
		queryKey: ["admin-user-by-id", id],
	};
}
