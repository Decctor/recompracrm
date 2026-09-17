import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { uploadFile } from "@/lib/files-storage";
import { updateOrganizationMembership } from "@/lib/mutations/organizations";
import { useUserById } from "@/lib/queries/users";
import { type TUseUserState, useUserState } from "@/state-hooks/use-user-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import UsersCredentialsBlock from "./Blocks/Credentials";
import UsersGeneralBlock from "./Blocks/General";
import UsersPermissionsBlock from "./Blocks/Permissions";
import RemoveOrganizationMember from "./Blocks/RemoveOrganizationMember";
import UsersSellerBlock from "./Blocks/Seller";
type EditUserProps = {
	userId: string;
	session: TAuthUserSession["user"];
	sessionUserMembership: NonNullable<TAuthUserSession["membership"]>;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};
function EditUser({ userId, session, sessionUserMembership, closeModal, callbacks }: EditUserProps) {
	const organizationHasERPAccess = !!sessionUserMembership.organizacao.configuracao.recursos.erp.acesso;
	const queryClient = useQueryClient();
	const { state, updateUser, updateAvatarHolder, updateMembership, updateMembershipPermissions, redefineState } = useUserState();
	const { data: user, queryKey, isLoading, isError, isSuccess, error } = useUserById(userId);

	async function handleUpdateOrganizationMembershipMutation(state: TUseUserState["state"]) {
		let userAvatarUrl = state.user.avatarUrl;
		if (state.avatarHolder.file) {
			const { url, format, size } = await uploadFile({ file: state.avatarHolder.file, fileName: state.user.nome, prefix: "avatars" });
			userAvatarUrl = url;
		}
		return await updateOrganizationMembership({ id: userId, user: { ...state.user, avatarUrl: userAvatarUrl }, membership: state.membership });
	}
	const { mutate, isPending } = useMutation({
		mutationKey: ["update-organization-membership", userId],
		mutationFn: handleUpdateOrganizationMembershipMutation,
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey });
			if (callbacks?.onMutate) callbacks.onMutate();
			return;
		},
		onSuccess: async (data) => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
			return toast.success(data.message);
		},
		onError: async (error) => {
			if (callbacks?.onError) callbacks.onError();
			return toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) callbacks.onSettled();
			await queryClient.invalidateQueries({ queryKey });
			return;
		},
	});

	useEffect(() => {
		if (user) redefineState({ user: user, membership: user.associacao, avatarHolder: { file: null, previewUrl: null } });
	}, [user, redefineState]);

	const sessionUserCanRemoveMembers = sessionUserMembership.permissoes.usuarios.excluir;

	const removeMemberCallbacks = {
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey });
			if (callbacks?.onMutate) callbacks.onMutate();
		},
		onSuccess: () => {
			if (callbacks?.onSuccess) callbacks.onSuccess();
		},
		onError: () => {
			if (callbacks?.onError) callbacks.onError();
		},
		onSettled: async () => {
			if (callbacks?.onSettled) await callbacks.onSettled();
			await queryClient.invalidateQueries({ queryKey });
		},
	};

	return (
		<ResponsiveMenu
			menuTitle="EDITAR USUÁRIO"
			menuDescription="Preencha os campos abaixo para atualizar o usuário"
			menuActionButtonText="ATUALIZAR USUÁRIO"
			menuCancelButtonText="CANCELAR"
			dialogVariant="lg"
			drawerVariant="lg"
			actionFunction={() => mutate(state)}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={error ? getErrorMessage(error) : null}
			closeMenu={closeModal}
		>
			<UsersGeneralBlock
				infoHolder={state.user}
				updateInfoHolder={updateUser}
				avatarHolder={state.avatarHolder}
				updateAvatarHolder={updateAvatarHolder}
			/>
			<UsersSellerBlock membershipHolder={state.membership} updateMembership={updateMembership} />
			<UsersPermissionsBlock
				userId={userId}
				permissionsHolder={state.membership.permissoes}
				updateUserPermissions={updateMembershipPermissions}
				organizationHasERPAccess={organizationHasERPAccess}
			/>
			<RemoveOrganizationMember
				userId={userId}
				userName={state.user.nome || user?.nome || "Usuário"}
				sessionUserId={session.id}
				sessionUserCanRemove={sessionUserCanRemoveMembers}
				closeModal={closeModal}
				callbacks={removeMemberCallbacks}
			/>
		</ResponsiveMenu>
	);
}

export default EditUser;
