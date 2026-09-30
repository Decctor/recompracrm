import type {
	TGetOrganizationMembershipInvitationsInput,
	TGetOrganizationMembershipInvitationsOutput,
} from "@/app/api/organizations/memberships/invitations/route";
import type { TGetUserMembershipsOutput } from "@/app/api/organizations/memberships/route";
import type { TGetOrganizationOutput } from "@/app/api/organizations/route";
import type { TGetOrganizationSlugAvailabilityOutput } from "@/app/api/organizations/slug-availability/route";
import type { TGetSubscriptionStatusOutput } from "@/app/api/organizations/subscription-status/route";
import type { TAddressRegion } from "@/lib/geo/address-parsing";
import { isKnownCityForUf, normalizeLocation } from "@/lib/geo/brazilian-locations";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useDebounceMemo } from "../hooks/use-debounce";

async function fetchOrganization() {
	const { data } = await axios.get<TGetOrganizationOutput>("/api/organizations");
	return data.data;
}
export function useOrganization() {
	return {
		...useQuery({
			queryKey: ["organization"],
			queryFn: fetchOrganization,
		}),
		queryKey: ["organization"],
	};
}

function selectOrganizationRegion(organization: TGetOrganizationOutput["data"]): TAddressRegion | null {
	const { estado, cidade } = normalizeLocation({ estado: organization.localizacaoEstado, cidade: organization.localizacaoCidade });
	if (!estado) return null;
	return { localizacaoEstado: estado, localizacaoCidade: cidade && isKnownCityForUf(cidade, estado) ? cidade : null };
}

/**
 * Estado e cidade da organização, normalizados. É o ponto de partida dos formulários de endereço
 * de cliente: a maior parte da clientela de uma loja mora na cidade dela. Compartilha o cache de
 * `useOrganization`.
 */
export function useOrganizationRegion() {
	return {
		...useQuery({
			queryKey: ["organization"],
			queryFn: fetchOrganization,
			select: selectOrganizationRegion,
		}),
		queryKey: ["organization"],
	};
}

async function fetchUserMemberships() {
	const { data } = await axios.get<TGetUserMembershipsOutput>("/api/organizations/memberships");
	return data.data;
}

export function useUserMemberships() {
	return {
		...useQuery({
			queryKey: ["user-memberships"],
			queryFn: fetchUserMemberships,
		}),
		queryKey: ["user-memberships"],
	};
}

async function fetchOrganizationMembershipInvitations(input: TGetOrganizationMembershipInvitationsInput) {
	const searchParams = new URLSearchParams();
	if (input.pendingOnly) searchParams.set("pendingOnly", "true");
	const { data } = await axios.get<TGetOrganizationMembershipInvitationsOutput>(
		`/api/organizations/memberships/invitations?${searchParams.toString()}`,
	);
	return data.data.default;
}

export function useOrganizationMembershipInvitations(input: TGetOrganizationMembershipInvitationsInput) {
	return useQuery({
		queryKey: ["organization-membership-invitations", input],
		queryFn: () => fetchOrganizationMembershipInvitations(input),
	});
}

async function fetchSubscriptionStatus() {
	const { data } = await axios.get<TGetSubscriptionStatusOutput>("/api/organizations/subscription-status");
	return data.data;
}

export function useOrganizationSubscriptionStatus() {
	const queryKey = ["organization-subscription-status"];
	return {
		...useQuery({
			queryKey,
			queryFn: fetchSubscriptionStatus,
			staleTime: 5 * 60 * 1000,
			refetchOnWindowFocus: true,
		}),
		queryKey,
	};
}

async function fetchOrganizationSlugAvailability(slug: string) {
	const { data } = await axios.get<TGetOrganizationSlugAvailabilityOutput>(`/api/organizations/slug-availability?slug=${encodeURIComponent(slug)}`);
	return data.data;
}

export function useOrganizationSlugAvailability({ slug, enabled = true }: { slug: string; enabled?: boolean }) {
	const debounced = useDebounceMemo({ slug }, 500);
	const queryKey = ["organization-slug-availability", debounced.slug];
	return {
		...useQuery({
			queryKey,
			queryFn: () => fetchOrganizationSlugAvailability(debounced.slug),
			enabled: enabled && debounced.slug.trim().length > 0,
		}),
		queryKey,
		debouncedSlug: debounced.slug,
	};
}
