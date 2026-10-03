import type { TGetFiscalDocumentsOutput } from "@/app/api/fiscal/documents/route";
import type { TGetFiscalOperationProfilesOutput } from "@/app/api/fiscal/operation-profiles/route";
import type { TGetFiscalSeriesOutput } from "@/app/api/fiscal/series/route";
import type { TGetFiscalSettingsOutput } from "@/app/api/fiscal/settings/route";
import type { TGetInboundDocumentsOutput } from "@/app/api/fiscal/inbound/route";
import type { TGetFiscalPendingOutput } from "@/app/api/fiscal/pending/route";
import type { TGetFiscalTaxGroupsOutput } from "@/app/api/fiscal/tax-groups/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { buildFiscalDocumentsSearchParams, type TFiscalDocumentsFiltersState } from "../fiscal/document-filters";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchFiscalSettings() {
	const { data } = await axios.get<TGetFiscalSettingsOutput>("/api/fiscal/settings");
	return data.data;
}

export function useFiscalSettings({ enabled = true }: { enabled?: boolean } = {}) {
	const queryKey = ["fiscal-settings"];
	return {
		...useQuery({
			queryKey,
			queryFn: fetchFiscalSettings,
			enabled,
		}),
		queryKey,
	};
}

type FiscalDocumentsFilters = TFiscalDocumentsFiltersState & {
	page: number;
};

async function fetchFiscalDocuments({ page, ...filters }: FiscalDocumentsFilters) {
	const searchParams = buildFiscalDocumentsSearchParams(filters);
	if (page) searchParams.set("page", page.toString());
	const { data } = await axios.get<TGetFiscalDocumentsOutput>(`/api/fiscal/documents?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Oops, houve um erro ao buscar os documentos fiscais.");
	return result;
}
async function fetchFiscalDocumentById({ documentId }: { documentId: string }) {
	const searchParams = new URLSearchParams();
	searchParams.set("documentId", documentId);
	const { data } = await axios.get<TGetFiscalDocumentsOutput>(`/api/fiscal/documents?${searchParams.toString()}`);
	const result = data.data.byId;
	if (!result) throw new Error("Oops, houve um erro ao buscar o documento fiscal.");
	return result;
}

export function useFiscalDocuments() {
	const [filters, setFilters] = useState<FiscalDocumentsFilters>({
		page: 1,
		search: "",
		statusInterno: [],
		tipos: [],
		ambiente: null,
		periodAfter: null,
		periodBefore: null,
	});
	function updateFilters(next: Partial<FiscalDocumentsFilters>) {
		setFilters((prev) => ({ ...prev, ...next }));
	}

	const debounced = useDebounceMemo({ search: filters.search }, 500);
	const finalFilters = { ...filters, ...debounced };
	const queryKey = ["fiscal-documents", finalFilters];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchFiscalDocuments({ ...finalFilters }),
		}),
		queryKey,
		filters,
		updateFilters,
	};
}

async function fetchFiscalPending() {
	const { data } = await axios.get<TGetFiscalPendingOutput>("/api/fiscal/pending");
	return data.data;
}

export const FISCAL_PENDING_QUERY_KEY = ["fiscal-pending"];

// Pendencias agrupadas por causa + prazos expirando + produtos sem perfil. Alimenta a aba
// Pendencias e o badge da sidebar; refetch curto porque prazos de cancelamento correm em minutos.
export function useFiscalPending({ enabled = true, refetchInterval = 60_000 }: { enabled?: boolean; refetchInterval?: number | false } = {}) {
	return {
		...useQuery({
			queryKey: FISCAL_PENDING_QUERY_KEY,
			queryFn: fetchFiscalPending,
			enabled,
			refetchInterval,
			// 403 (sem permissao fiscal) nao deve ficar retentando em loop na sidebar.
			retry: false,
		}),
		queryKey: FISCAL_PENDING_QUERY_KEY,
	};
}

export function useFiscalDocumentById(documentId: string) {
	const queryKey = ["fiscal-document-by-id", documentId];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchFiscalDocumentById({ documentId: documentId }),
		}),
		queryKey,
	};
}

async function fetchFiscalSeriesById({ id }: { id: string }) {
	const { data } = await axios.get<TGetFiscalSeriesOutput>(`/api/fiscal/series?id=${id}`);
	const byIdData = data.data.byId;
	if (!byIdData) throw new Error("Oops, houve um erro ao buscar a serie fiscal.");
	return byIdData;
}

export function useFiscalSeriesById({ id }: { id: string }) {
	const queryKey = ["fiscal-series-by-id", id];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchFiscalSeriesById({ id }),
		}),
		queryKey,
	};
}

async function fetchFiscalSeries() {
	const { data } = await axios.get<TGetFiscalSeriesOutput>("/api/fiscal/series");
	const defaultData = data.data.default;
	if (!defaultData) throw new Error("Oops, houve um erro ao buscar as series fiscais.");
	return defaultData;
}

export function useFiscalSeries() {
	const queryKey = ["fiscal-series"];
	return {
		...useQuery({
			queryKey,
			queryFn: fetchFiscalSeries,
		}),
		queryKey,
	};
}

async function fetchFiscalOperationProfileById({ id }: { id: string }) {
	const { data } = await axios.get<TGetFiscalOperationProfilesOutput>(`/api/fiscal/operation-profiles?id=${id}`);
	return data.data.byId;
}
export function useFiscalOperationProfileById({ id }: { id: string }) {
	const queryKey = ["fiscal-operation-profile-by-id", id];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchFiscalOperationProfileById({ id }),
		}),
		queryKey,
	};
}
async function fetchFiscalOperationProfiles() {
	const { data } = await axios.get<TGetFiscalOperationProfilesOutput>("/api/fiscal/operation-profiles");
	const defaultData = data.data.default;
	if (!defaultData) throw new Error("Oops, houve um erro ao buscar os perfis de operação fiscal.");
	return defaultData;
}

export function useFiscalOperationProfiles() {
	const queryKey = ["fiscal-operation-profiles"];
	return {
		...useQuery({
			queryKey,
			queryFn: fetchFiscalOperationProfiles,
		}),
		queryKey,
	};
}

async function fetchFiscalTaxGroups() {
	const { data } = await axios.get<TGetFiscalTaxGroupsOutput>("/api/fiscal/tax-groups");
	const defaultData = data.data.default;
	if (!defaultData) throw new Error("Oops, houve um erro ao buscar os grupos tributarios.");
	return defaultData;
}
export function useFiscalTaxGroups() {
	const queryKey = ["fiscal-tax-groups"];
	return {
		...useQuery({
			queryKey,
			queryFn: fetchFiscalTaxGroups,
		}),
		queryKey,
	};
}

async function fetchFiscalTaxGroupById({ id }: { id: string }) {
	const searchParams = new URLSearchParams();
	searchParams.set("id", id);
	const { data } = await axios.get<TGetFiscalTaxGroupsOutput>(`/api/fiscal/tax-groups?${searchParams.toString()}`);
	const result = data.data.byId;
	if (!result) throw new Error("Oops, houve um erro ao buscar o grupo tributario.");
	return result;
}
export function useFiscalTaxGroupById({ id }: { id: string }) {
	const queryKey = ["fiscal-tax-group-by-id", id];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchFiscalTaxGroupById({ id }),
		}),
		queryKey,
	};
}

async function fetchFiscalInboundDocuments({ page }: { page: number }) {
	const searchParams = new URLSearchParams();
	searchParams.set("page", page.toString());
	const { data } = await axios.get<TGetInboundDocumentsOutput>(`/api/fiscal/inbound?${searchParams.toString()}`);
	const result = data.data.default;
	if (!result) throw new Error("Oops, houve um erro ao buscar as notas recebidas.");
	return result;
}
export function useFiscalInboundDocuments() {
	const [page, setPage] = useState(1);
	const queryKey = ["fiscal-inbound-documents", page];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchFiscalInboundDocuments({ page }),
		}),
		queryKey,
		page,
		setPage,
	};
}
