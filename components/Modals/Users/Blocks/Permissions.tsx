import { MembershipPermissionsEditor } from "@/components/permissions/MembershipPermissionsEditor";
import type { TUseUserState } from "@/state-hooks/use-user-state";

type UsersPermissionsBlockProps = {
	userId?: string;
	permissionsHolder: TUseUserState["state"]["membership"]["permissoes"];
	updateUserPermissions: TUseUserState["updateMembershipPermissions"];
	organizationHasERPAccess: boolean;
};

export default function UsersPermissionsBlock({
	userId,
	permissionsHolder,
	updateUserPermissions,
	organizationHasERPAccess,
}: UsersPermissionsBlockProps) {
	return (
		<MembershipPermissionsEditor
			userId={userId}
			permissions={permissionsHolder}
			updatePermissions={(permissoes) => updateUserPermissions(permissoes)}
			organizationHasERPAccess={organizationHasERPAccess}
		/>
	);
}
