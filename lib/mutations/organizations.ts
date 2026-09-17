import type {
	TCreateOrganizationMembershipInvitationInput,
	TCreateOrganizationMembershipInvitationOutput,
} from "@/app/api/organizations/memberships/invitations/route";
import type {
	TDeleteOrganizationMembershipInput,
	TDeleteOrganizationMembershipOutput,
	TUpdateOrganizationMembershipInput,
	TUpdateOrganizationMembershipOutput,
} from "@/app/api/organizations/memberships/route";
import type {
	TCreateOrganizationInputSchema,
	TCreateOrganizationOutput,
	TUpdateOrganizationInput,
	TUpdateOrganizationOutput,
} from "@/app/api/organizations/route";
import type { TSwitchOrganizationInput, TSwitchOrganizationOutput } from "@/app/auth/switch-organization/route";
import axios from "axios";
export async function createOrganization(input: TCreateOrganizationInputSchema) {
	const { data } = await axios.post<TCreateOrganizationOutput>("/api/organizations", input);
	return data;
}

export async function switchOrganization(input: TSwitchOrganizationInput) {
	const { data } = await axios.put<TSwitchOrganizationOutput>("/auth/switch-organization", input);
	return data;
}

export async function updateOrganization(input: TUpdateOrganizationInput) {
	const { data } = await axios.put<TUpdateOrganizationOutput>("/api/organizations", input);
	return data;
}

export async function createOrganizationMembershipInvitation(input: TCreateOrganizationMembershipInvitationInput) {
	const { data } = await axios.post<TCreateOrganizationMembershipInvitationOutput>("/api/organizations/memberships/invitations", input);
	return data;
}

export async function updateOrganizationMembership(input: TUpdateOrganizationMembershipInput) {
	const { data } = await axios.put<TUpdateOrganizationMembershipOutput>("/api/organizations/memberships", input);
	return data;
}

export async function deleteOrganizationMembership(input: TDeleteOrganizationMembershipInput) {
	const { data } = await axios.delete<TDeleteOrganizationMembershipOutput>("/api/organizations/memberships", { data: input });
	return data;
}
