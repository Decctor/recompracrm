import SelectClientInput, { type TSelectClientValue } from "@/components/Inputs/SelectClient";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { updateTabClient } from "@/lib/mutations/tabs";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

type LinkTabClientProps = {
	tabId: string;
	cliente: { id: string; nome: string; telefone: string | null } | null;
	closeModal: () => void;
	callbacks?: {
		onSuccess?: () => void;
	};
};

export function LinkTabClient({ tabId, cliente, closeModal, callbacks }: LinkTabClientProps) {
	const [client, setClient] = useState<TSelectClientValue>(cliente ? { id: cliente.id, nome: cliente.nome, telefone: cliente.telefone ?? "" } : null);

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-tab-client", tabId],
		mutationFn: updateTabClient,
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			closeModal();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	const unchanged = (client?.id ?? null) === (cliente?.id ?? null);

	return (
		<ResponsiveMenu
			menuTitle={cliente ? "TROCAR CLIENTE" : "VINCULAR CLIENTE"}
			menuDescription="O consumo da conta passa a contar no histórico do cliente escolhido quando a conta for fechada."
			menuActionButtonText={client || !cliente ? "VINCULAR" : "DESVINCULAR"}
			menuActionButtonDisabled={unchanged}
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate({ tabId, clienteId: client?.id ?? null })}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<div className="flex flex-col gap-3 p-1">
				<SelectClientInput
					label="CLIENTE"
					value={client}
					resetOptionLabel="SEM CLIENTE"
					handleChange={(selected) => setClient({ id: selected.id, nome: selected.nome, telefone: selected.telefone ?? "" })}
					onReset={() => setClient(null)}
				/>
			</div>
		</ResponsiveMenu>
	);
}
