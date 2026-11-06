import type { TGetInteractionsOutput } from "@/app/api/interactions/route";
import type { TGetAgendaOutput } from "@/app/api/client-portfolios/agenda/route";
import type { TGetClientPortfolioOutput } from "@/app/api/client-portfolios/route";
import type { TGetPortfolioOutput } from "@/app/api/client-portfolios/portfolio/route";
import type { TGetClientPortfolioStatsOutput } from "@/app/api/client-portfolios/stats/route";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import dayjs from "dayjs";
import { useState } from "react";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchClientPortfolio(vendedorId: string | null) {
	const searchParams = new URLSearchParams();
	if (vendedorId) searchParams.set("vendedorId", vendedorId);
	const { data } = await axios.get<TGetClientPortfolioOutput>(`/api/client-portfolios?${searchParams.toString()}`);
	return data.data;
}

export function useClientPortfolio({ vendedorId }: { vendedorId: string | null }) {
	const queryKey = ["client-portfolios", vendedorId];
	return {
		...useQuery({ queryKey, queryFn: () => fetchClientPortfolio(vendedorId) }),
		queryKey,
	};
}

async function fetchClientPortfolioStats(vendedorId: string | null) {
	const searchParams = new URLSearchParams();
	if (vendedorId) searchParams.set("vendedorId", vendedorId);
	const { data } = await axios.get<TGetClientPortfolioStatsOutput>(`/api/client-portfolios/stats?${searchParams.toString()}`);
	return data.data;
}

export function useClientPortfolioStats({ vendedorId }: { vendedorId: string | null }) {
	const queryKey = ["client-portfolios-stats", vendedorId];
	return {
		...useQuery({ queryKey, queryFn: () => fetchClientPortfolioStats(vendedorId) }),
		queryKey,
	};
}

type TPortfolioFilters = {
	segmento: string | null;
	page: number;
	pageSize: number;
};

async function fetchPortfolio({ vendedorId, filters }: { vendedorId: string | null; filters: TPortfolioFilters }) {
	const searchParams = new URLSearchParams();
	if (vendedorId) searchParams.set("vendedorId", vendedorId);
	if (filters.segmento) searchParams.set("segmento", filters.segmento);
	if (filters.page) searchParams.set("page", filters.page.toString());
	if (filters.pageSize) searchParams.set("pageSize", filters.pageSize.toString());
	const { data } = await axios.get<TGetPortfolioOutput>(`/api/client-portfolios/portfolio?${searchParams.toString()}`);
	return data.data;
}

export function usePortfolio({ vendedorId }: { vendedorId: string | null }) {
	const [filters, setFilters] = useState<TPortfolioFilters>({ segmento: null, page: 1, pageSize: DEFAULT_PAGE_SIZE });
	function updateFilters(newFilters: Partial<TPortfolioFilters>) {
		setFilters((prevFilters) => ({ ...prevFilters, ...newFilters }));
	}
	const debouncedFilters = useDebounceMemo(filters, 300);
	const queryKey = ["client-portfolios-portfolio", vendedorId, debouncedFilters];
	return {
		...useQuery({ queryKey, queryFn: () => fetchPortfolio({ vendedorId, filters: debouncedFilters }) }),
		queryKey,
		filters,
		updateFilters,
	};
}

async function fetchAgendaDay({ vendedorId, dateKey }: { vendedorId: string | null; dateKey: string }) {
	const searchParams = new URLSearchParams();
	if (vendedorId) searchParams.set("vendedorId", vendedorId);
	searchParams.set("date", dateKey);
	const { data } = await axios.get<TGetAgendaOutput>(`/api/client-portfolios/agenda?${searchParams.toString()}`);
	const result = data.data.day;
	if (!result) throw new Error("Agenda do dia não encontrada.");
	return result;
}

export function useClientPortfolioAgendaDay({ vendedorId, dateKey }: { vendedorId: string | null; dateKey: string }) {
	const queryKey = ["client-portfolios-agenda-day", vendedorId, dateKey];
	return {
		...useQuery({ queryKey, queryFn: () => fetchAgendaDay({ vendedorId, dateKey }) }),
		queryKey,
	};
}

async function fetchAgendaCalendar({ vendedorId, monthKey }: { vendedorId: string | null; monthKey: string }) {
	const month = dayjs(`${monthKey}-01`);
	const searchParams = new URLSearchParams();
	if (vendedorId) searchParams.set("vendedorId", vendedorId);
	searchParams.set("monthStart", month.startOf("month").toISOString());
	searchParams.set("monthEnd", month.endOf("month").toISOString());
	const { data } = await axios.get<TGetAgendaOutput>(`/api/client-portfolios/agenda?${searchParams.toString()}`);
	const result = data.data.calendar;
	if (!result) throw new Error("Calendário da agenda não encontrado.");
	return result;
}

export function useClientPortfolioAgendaCalendar({ vendedorId, monthKey }: { vendedorId: string | null; monthKey: string }) {
	const queryKey = ["client-portfolios-agenda-calendar", vendedorId, monthKey];
	return {
		...useQuery({ queryKey, queryFn: () => fetchAgendaCalendar({ vendedorId, monthKey }) }),
		queryKey,
	};
}

async function fetchClientInteractions({ clienteId, limit }: { clienteId: string; limit?: number }) {
	const searchParams = new URLSearchParams();
	searchParams.set("clienteId", clienteId);
	if (limit) searchParams.set("limit", limit.toString());
	const { data } = await axios.get<TGetInteractionsOutput>(`/api/interactions?${searchParams.toString()}`);
	return data.data;
}

export function useClientInteractions({ clienteId, limit, enabled = true }: { clienteId: string; limit?: number; enabled?: boolean }) {
	const queryKey = ["client-interactions", clienteId, limit];
	return {
		...useQuery({ queryKey, queryFn: () => fetchClientInteractions({ clienteId, limit }), enabled }),
		queryKey,
	};
}
