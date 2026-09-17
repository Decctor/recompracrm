"use client";

import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/errors";
import { deleteOrganizationMembership } from "@/lib/mutations/organizations";
import { useMutation } from "@tanstack/react-query";
import { UserMinus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type RemoveOrganizationMemberProps = {
	userId: string;
	userName: string;
	sessionUserId: string;
	sessionUserCanRemove: boolean;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

export function RemoveOrganizationMember({
	userId,
	userName,
	sessionUserId,
	sessionUserCanRemove,
	closeModal,
	callbacks,
}: RemoveOrganizationMemberProps) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const isSelf = userId === sessionUserId;

	const { mutate, isPending } = useMutation({
		mutationKey: ["delete-organization-membership", userId],
		mutationFn: deleteOrganizationMembership,
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate();
		},
		onSuccess: (data) => {
			setConfirmOpen(false);
			if (callbacks?.onSuccess) callbacks.onSuccess();
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => {
			if (callbacks?.onError) callbacks.onError();
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			if (callbacks?.onSettled) await callbacks.onSettled();
		},
	});

	if (!sessionUserCanRemove || isSelf) return null;

	return (
		<>
			<ResponsiveMenuSection title="REMOVER DA ORGANIZAÇÃO" icon={<UserMinus className="h-4 min-h-4 w-4 min-w-4" />}>
				<div className="flex w-full flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
					<p className="text-xs text-muted-foreground">
						Remove o acesso de <span className="font-semibold text-foreground">{userName}</span> a esta organização. O usuário continuará existindo na
						plataforma, mas perderá permissões e vínculos com esta empresa.
					</p>
					<Button type="button" variant="destructive" size="sm" className="w-fit" onClick={() => setConfirmOpen(true)}>
						REMOVER MEMBRO
					</Button>
				</div>
			</ResponsiveMenuSection>

			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Remover membro da organização?</DialogTitle>
						<DialogDescription>
							{userName} perderá imediatamente o acesso a esta organização. Esta ação não exclui a conta do usuário na plataforma.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose render={<Button variant="outline" />}>CANCELAR</DialogClose>
						<LoadingButton loading={isPending} variant="destructive" onClick={() => mutate({ id: userId })}>
							REMOVER MEMBRO
						</LoadingButton>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

export default RemoveOrganizationMember;
