import type { TGetCampaignsHealthOutput } from "@/app/api/campaigns/health/route";
import type { TGetCirculatingCashbackOutput } from "@/app/api/cashback-programs/circulating/route";
import type { TGetExpiringCashbackOutput } from "@/app/api/cashback-programs/expiring/route";
import type { TGetTeamRoutineOutput } from "@/app/api/client-portfolios/team-routine/route";
import type { TGetClientBirthdaysOutput } from "@/app/api/clients/birthdays/route";
import type { TGetRelationshipPulseOutput } from "@/app/api/clients/stats/relationship-pulse/route";
import type { TGetSegmentDistributionOutput } from "@/app/api/segmentations/distribution/route";
import type { TGetRecentSegmentChangesOutput } from "@/app/api/segmentations/recent-changes/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

/** Consultas dos blocos do dashboard. Cada uma responde a um único bloco de uma aba. */

async function fetchExpiringCashback(days: number) {
	const { data } = await axios.get<TGetExpiringCashbackOutput>(`/api/cashback-programs/expiring?days=${days}`);
	return data.data;
}

export function useExpiringCashback({ days = 30 }: { days?: number } = {}) {
	const queryKey = ["cashback-expiring", days];
	return { ...useQuery({ queryKey, queryFn: () => fetchExpiringCashback(days) }), queryKey };
}

async function fetchRecentSegmentChanges(days: number) {
	const { data } = await axios.get<TGetRecentSegmentChangesOutput>(`/api/segmentations/recent-changes?days=${days}`);
	return data.data;
}

export function useRecentSegmentChanges({ days = 7 }: { days?: number } = {}) {
	const queryKey = ["segmentations-recent-changes", days];
	return { ...useQuery({ queryKey, queryFn: () => fetchRecentSegmentChanges(days) }), queryKey };
}

async function fetchClientBirthdays(days: number) {
	const { data } = await axios.get<TGetClientBirthdaysOutput>(`/api/clients/birthdays?days=${days}`);
	return data.data;
}

export function useClientBirthdays({ days = 7 }: { days?: number } = {}) {
	const queryKey = ["clients-birthdays", days];
	return { ...useQuery({ queryKey, queryFn: () => fetchClientBirthdays(days) }), queryKey };
}

async function fetchCampaignsHealth(dayStart: Date) {
	const searchParams = new URLSearchParams({ dayStart: dayStart.toISOString() });
	const { data } = await axios.get<TGetCampaignsHealthOutput>(`/api/campaigns/health?${searchParams.toString()}`);
	return data.data;
}

export function useCampaignsHealth({ dayStart }: { dayStart: Date }) {
	const queryKey = ["campaigns-health", dayStart.toISOString()];
	return { ...useQuery({ queryKey, queryFn: () => fetchCampaignsHealth(dayStart), refetchInterval: 120_000 }), queryKey };
}

async function fetchRelationshipPulse(days: number) {
	const { data } = await axios.get<TGetRelationshipPulseOutput>(`/api/clients/stats/relationship-pulse?days=${days}`);
	return data.data;
}

export function useRelationshipPulse({ days = 30 }: { days?: number } = {}) {
	const queryKey = ["clients-relationship-pulse", days];
	return { ...useQuery({ queryKey, queryFn: () => fetchRelationshipPulse(days) }), queryKey };
}

async function fetchCirculatingCashback(days: number) {
	const { data } = await axios.get<TGetCirculatingCashbackOutput>(`/api/cashback-programs/circulating?days=${days}`);
	return data.data;
}

export function useCirculatingCashback({ days = 30 }: { days?: number } = {}) {
	const queryKey = ["cashback-circulating", days];
	return { ...useQuery({ queryKey, queryFn: () => fetchCirculatingCashback(days) }), queryKey };
}

async function fetchSegmentDistribution(days: number) {
	const { data } = await axios.get<TGetSegmentDistributionOutput>(`/api/segmentations/distribution?days=${days}`);
	return data.data;
}

export function useSegmentDistribution({ days = 30 }: { days?: number } = {}) {
	const queryKey = ["segmentations-distribution", days];
	return { ...useQuery({ queryKey, queryFn: () => fetchSegmentDistribution(days) }), queryKey };
}

async function fetchTeamRoutine(dayStart: Date) {
	const searchParams = new URLSearchParams({ dayStart: dayStart.toISOString() });
	const { data } = await axios.get<TGetTeamRoutineOutput>(`/api/client-portfolios/team-routine?${searchParams.toString()}`);
	return data.data;
}

export function useTeamRoutine({ dayStart, enabled = true }: { dayStart: Date; enabled?: boolean }) {
	const queryKey = ["client-portfolios-team-routine", dayStart.toISOString()];
	return { ...useQuery({ queryKey, queryFn: () => fetchTeamRoutine(dayStart), enabled }), queryKey };
}
