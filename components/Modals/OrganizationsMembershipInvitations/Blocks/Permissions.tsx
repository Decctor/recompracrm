import { MembershipPermissionsEditor } from "@/components/permissions/MembershipPermissionsEditor";
import type { TUseOrganizationMembershipInvitationState } from "@/state-hooks/use-organization-membership-invitation-state";

type OrganizationsMembershipInvitationsPermissionsBlockProps = {
	permissions: TUseOrganizationMembershipInvitationState["state"]["invitation"]["permissoes"];
	updateInvitationPermissions: TUseOrganizationMembershipInvitationState["updateInvitationPermissions"];
	organizationHasERPAccess: boolean;
};

export default function OrganizationsMembershipInvitationsPermissionsBlock({
	permissions,
	updateInvitationPermissions,
	organizationHasERPAccess,
}: OrganizationsMembershipInvitationsPermissionsBlockProps) {
	return (
		<MembershipPermissionsEditor
			permissions={permissions}
			updatePermissions={(permissoes) => updateInvitationPermissions(permissoes)}
			organizationHasERPAccess={organizationHasERPAccess}
		/>
	);
}
