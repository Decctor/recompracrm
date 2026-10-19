import type { TGetStockReportAbcOutput } from "@/app/api/inventory/reports/abc/route";
import type { TGetStockReportCostChangesOutput } from "@/app/api/inventory/reports/cost-changes/route";
import type { TGetStockReportCoverageOutput } from "@/app/api/inventory/reports/coverage/route";
import type { TGetStockReportExpirationsOutput } from "@/app/api/inventory/reports/expirations/route";
import type { TGetStockReportIdleOutput } from "@/app/api/inventory/reports/idle/route";
import type { TGetStockReportLossesOutput } from "@/app/api/inventory/reports/losses/route";
import type { TGetStockReportReorderOutput } from "@/app/api/inventory/reports/reorder/route";
import type { TGetStockReportValueOutput } from "@/app/api/inventory/reports/stock-value/route";
import type { TGetStockReportSummaryOutput } from "@/app/api/inventory/reports/summary/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

// Relatórios de estoque (Estoque › Relatórios). Cada seção tem a sua consulta: uma rota que falha
// apaga só a sua seção.

export type TStockReportPeriod = { periodAfter: Date; periodBefore: Date };

function buildSearchParams(params: Record<string, string | number | Date | null | undefined>) {
	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value == null || value === "") continue;
		searchParams.set(key, value instanceof Date ? value.toISOString() : String(value));
	}
	return searchParams.toString();
}

function periodKey(period: TStockReportPeriod) {
	return [period.periodAfter.toISOString(), period.periodBefore.toISOString()];
}

async function fetchStockReportSummary(period: TStockReportPeriod) {
	const { data } = await axios.get<TGetStockReportSummaryOutput>(`/api/inventory/reports/summary?${buildSearchParams(period)}`);
	return data.data;
}
export function useStockReportSummary({ period }: { period: TStockReportPeriod }) {
	const queryKey = ["stock-report-summary", ...periodKey(period)];
	return { ...useQuery({ queryKey, queryFn: () => fetchStockReportSummary(period) }), queryKey };
}

async function fetchStockReportValue(period: TStockReportPeriod) {
	const { data } = await axios.get<TGetStockReportValueOutput>(`/api/inventory/reports/stock-value?${buildSearchParams(period)}`);
	return data.data;
}
export function useStockReportValue({ period }: { period: TStockReportPeriod }) {
	const queryKey = ["stock-report-value", ...periodKey(period)];
	return { ...useQuery({ queryKey, queryFn: () => fetchStockReportValue(period) }), queryKey };
}

export type TStockReportAbcMetric = "FATURAMENTO" | "VOLUME";
async function fetchStockReportAbc(period: TStockReportPeriod, metric: TStockReportAbcMetric) {
	const { data } = await axios.get<TGetStockReportAbcOutput>(`/api/inventory/reports/abc?${buildSearchParams({ ...period, metric })}`);
	return data.data;
}
export function useStockReportAbc({ period, metric }: { period: TStockReportPeriod; metric: TStockReportAbcMetric }) {
	const queryKey = ["stock-report-abc", metric, ...periodKey(period)];
	return { ...useQuery({ queryKey, queryFn: () => fetchStockReportAbc(period, metric) }), queryKey };
}

async function fetchStockReportCoverage(period: TStockReportPeriod, limit: number) {
	const { data } = await axios.get<TGetStockReportCoverageOutput>(`/api/inventory/reports/coverage?${buildSearchParams({ ...period, limit })}`);
	return data.data;
}
export function useStockReportCoverage({ period, limit }: { period: TStockReportPeriod; limit: number }) {
	const queryKey = ["stock-report-coverage", limit, ...periodKey(period)];
	return { ...useQuery({ queryKey, queryFn: () => fetchStockReportCoverage(period, limit) }), queryKey };
}

async function fetchStockReportReorder(period: TStockReportPeriod) {
	const { data } = await axios.get<TGetStockReportReorderOutput>(`/api/inventory/reports/reorder?${buildSearchParams(period)}`);
	return data.data;
}
export function useStockReportReorder({ period }: { period: TStockReportPeriod }) {
	const queryKey = ["stock-report-reorder", ...periodKey(period)];
	return { ...useQuery({ queryKey, queryFn: () => fetchStockReportReorder(period) }), queryKey };
}

async function fetchStockReportIdle(limit: number) {
	const { data } = await axios.get<TGetStockReportIdleOutput>(`/api/inventory/reports/idle?${buildSearchParams({ limit })}`);
	return data.data;
}
export function useStockReportIdle({ limit }: { limit: number }) {
	const queryKey = ["stock-report-idle", limit];
	return { ...useQuery({ queryKey, queryFn: () => fetchStockReportIdle(limit) }), queryKey };
}

async function fetchStockReportCostChanges(period: TStockReportPeriod) {
	const { data } = await axios.get<TGetStockReportCostChangesOutput>(`/api/inventory/reports/cost-changes?${buildSearchParams(period)}`);
	return data.data;
}
export function useStockReportCostChanges({ period }: { period: TStockReportPeriod }) {
	const queryKey = ["stock-report-cost-changes", ...periodKey(period)];
	return { ...useQuery({ queryKey, queryFn: () => fetchStockReportCostChanges(period) }), queryKey };
}

async function fetchStockReportLosses(period: TStockReportPeriod) {
	const { data } = await axios.get<TGetStockReportLossesOutput>(`/api/inventory/reports/losses?${buildSearchParams(period)}`);
	return data.data;
}
export function useStockReportLosses({ period }: { period: TStockReportPeriod }) {
	const queryKey = ["stock-report-losses", ...periodKey(period)];
	return { ...useQuery({ queryKey, queryFn: () => fetchStockReportLosses(period) }), queryKey };
}

async function fetchStockReportExpirations(limit: number) {
	const { data } = await axios.get<TGetStockReportExpirationsOutput>(`/api/inventory/reports/expirations?${buildSearchParams({ limit })}`);
	return data.data;
}
export function useStockReportExpirations({ limit }: { limit: number }) {
	const queryKey = ["stock-report-expirations", limit];
	return { ...useQuery({ queryKey, queryFn: () => fetchStockReportExpirations(limit) }), queryKey };
}
