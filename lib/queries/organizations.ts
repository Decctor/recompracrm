import type {
	TGetOrganizationMembershipInvitationsInput,
	TGetOrganizationMembershipInvitationsOutput,
} from "@/app/api/organizations/memberships/invitations/route";
import type { TGetUserMembershipsOutput } from "@/app/api/organizations/memberships/route";
import type { TGetOrganizationOutput } from "@/app/api/organizations/route";
import type { TGetSubscriptionStatusOutput } from "@/app/api/organizations/subscription-status/route";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

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
