import type { TGetActivitiesInput, TGetActivitiesOutput } from "@/app/api/admin/crm/activities/route";
import type { TGetTemplatesOutput } from "@/app/api/admin/crm/activity-templates/route";
import type { TGetKanbanLeadsOutput } from "@/app/api/admin/crm/leads/kanban/route";
import type { TGetLeadsInput, TGetLeadsOutput } from "@/app/api/admin/crm/leads/route";
import type { TGetTimelineOutput } from "@/app/api/admin/crm/leads/timeline/route";
import type { TGetNotesOutput } from "@/app/api/admin/crm/notes/route";
import type { TGetCrmStatsOutput, TGetStatsInput } from "@/app/api/admin/crm/stats/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

// ==================== Leads ====================

async function fetchLeads(input: TGetLeadsInput) {
	const searchParams = new URLSearchParams();
	if (input.search) searchParams.set("search", input.search);
	if (input.statusCRM) searchParams.set("statusCRM", input.statusCRM);
	if (input.responsavelId) searchParams.set("responsavelId", input.responsavelId);
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());
	const { data } = await axios.get<TGetLeadsOutput>(`/api/admin/crm/leads?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Leads não encontrados.");
	return result;
}

type UseInternalLeadsParams = {
	initialParams?: Partial<TGetLeadsInput>;
};

export function useInternalLeads({ initialParams }: UseInternalLeadsParams = {}) {
	const [queryParams, setQueryParams] = useState<TGetLeadsInput>({
		page: initialParams?.page || 1,
		pageSize: initialParams?.pageSize || 25,
		search: initialParams?.search || "",
		statusCRM: initialParams?.statusCRM,
		responsavelId: initialParams?.responsavelId,
	});

	function updateQueryParams(newParams: Partial<TGetLeadsInput>) {
		setQueryParams((prev) => ({ ...prev, ...newParams }));
	}

	const debouncedQueryParams = useDebounceMemo(queryParams, 500);

	return {
		...useQuery({
			queryKey: ["internal-leads", debouncedQueryParams],
			queryFn: () => fetchLeads(debouncedQueryParams),
		}),
		queryKey: ["internal-leads", debouncedQueryParams],
		queryParams,
		updateQueryParams,
	};
}

// ==================== Lead by ID ====================

async function fetchLeadById(id: string) {
	const { data } = await axios.get<TGetLeadsOutput>(`/api/admin/crm/leads?id=${id}`);
	const result = data.data.byId;
	if (!result) throw new Error("Lead não encontrado.");
	return result;
}

export function useInternalLeadById({ id }: { id: string }) {
	return {
		...useQuery({
			queryKey: ["internal-lead-by-id", id],
			queryFn: () => fetchLeadById(id),
			enabled: !!id,
		}),
		queryKey: ["internal-lead-by-id", id],
	};
}

// ==================== Kanban ====================

async function fetchKanbanLeads() {
	const { data } = await axios.get<TGetKanbanLeadsOutput>("/api/admin/crm/leads/kanban");
	return data.data;
}

export function useInternalLeadsKanban() {
	return {
		...useQuery({
			queryKey: ["internal-leads-kanban"],
			queryFn: fetchKanbanLeads,
		}),
		queryKey: ["internal-leads-kanban"],
	};
}

// ==================== Activities ====================

async function fetchActivities(input: TGetActivitiesInput) {
	const searchParams = new URLSearchParams();
	if (input.leadId) searchParams.set("leadId", input.leadId);
	if (input.tipo) searchParams.set("tipo", input.tipo);
	if (input.status) searchParams.set("status", input.status);
	if (input.dataAfter) searchParams.set("dataAfter", input.dataAfter);
	if (input.dataBefore) searchParams.set("dataBefore", input.dataBefore);
	if (input.page) searchParams.set("page", input.page.toString());
	if (input.pageSize) searchParams.set("pageSize", input.pageSize.toString());
	const { data } = await axios.get<TGetActivitiesOutput>(`/api/admin/crm/activities?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Atividades não encontradas.");
	return result;
}

type UseActivitiesParams = {
	initialParams?: Partial<TGetActivitiesInput>;
};

export function useInternalLeadActivities({ initialParams }: UseActivitiesParams = {}) {
	const [queryParams, setQueryParams] = useState<TGetActivitiesInput>({
		page: initialParams?.page || 1,
		pageSize: initialParams?.pageSize || 25,
		leadId: initialParams?.leadId,
		tipo: initialParams?.tipo,
		status: initialParams?.status,
		dataAfter: initialParams?.dataAfter,
		dataBefore: initialParams?.dataBefore,
	});

	function updateQueryParams(newParams: Partial<TGetActivitiesInput>) {
		setQueryParams((prev) => ({ ...prev, ...newParams }));
	}

	const debouncedQueryParams = useDebounceMemo(queryParams, 500);

	return {
		...useQuery({
			queryKey: ["internal-lead-activities", debouncedQueryParams],
			queryFn: () => fetchActivities(debouncedQueryParams),
		}),
		queryKey: ["internal-lead-activities", debouncedQueryParams],
		queryParams,
		updateQueryParams,
	};
}

// ==================== Notes ====================

async function fetchNotesByLeadId(leadId: string) {
	const { data } = await axios.get<TGetNotesOutput>(`/api/admin/crm/notes?leadId=${leadId}`);
	const result = data.data.byLeadId;
	if (!result) throw new Error("Notas não encontradas.");
	return result;
}

export function useInternalLeadNotes({ leadId }: { leadId: string }) {
	return {
		...useQuery({
			queryKey: ["internal-lead-notes", leadId],
			queryFn: () => fetchNotesByLeadId(leadId),
			enabled: !!leadId,
		}),
		queryKey: ["internal-lead-notes", leadId],
	};
}

// ==================== Timeline ====================

async function fetchTimeline(leadId: string) {
	const { data } = await axios.get<TGetTimelineOutput>(`/api/admin/crm/leads/timeline?leadId=${leadId}`);
	return data.data.events;
}

export function useInternalLeadTimeline({ leadId }: { leadId: string }) {
	return {
		...useQuery({
			queryKey: ["internal-lead-timeline", leadId],
			queryFn: () => fetchTimeline(leadId),
			enabled: !!leadId,
		}),
		queryKey: ["internal-lead-timeline", leadId],
	};
}

// ==================== Stats ====================

async function fetchCrmStats(input: TGetStatsInput) {
	const searchParams = new URLSearchParams();
	if (input.periodAfter) searchParams.set("periodAfter", input.periodAfter);
	if (input.periodBefore) searchParams.set("periodBefore", input.periodBefore);
	const { data } = await axios.get<TGetCrmStatsOutput>(`/api/admin/crm/stats?${searchParams.toString()}`);
	return data.data;
}

export function useCrmStats(input: TGetStatsInput = {}) {
	return useQuery({
		queryKey: ["crm-stats", input],
		queryFn: () => fetchCrmStats(input),
	});
}

// ==================== Activity Templates ====================

async function fetchActivityTemplates() {
	const { data } = await axios.get<TGetTemplatesOutput>("/api/admin/crm/activity-templates");
	return data.data.templates;
}

export function useActivityTemplates() {
	return useQuery({
		queryKey: ["crm-activity-templates"],
		queryFn: fetchActivityTemplates,
	});
}
