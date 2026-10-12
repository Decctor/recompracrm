import type { TGetServiceCardsOutput, TUpdateServiceCardInput } from "@/app/api/service-cards/route";
import CheckboxInput from "@/components/Inputs/CheckboxInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { deleteServiceCard, updateServiceCard } from "@/lib/mutations/tabs";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ServiceCardFileActions } from "./ServiceCardFileActions";

type TServiceCardRow = NonNullable<TGetServiceCardsOutput["data"]["default"]>[number];

type ControlServiceCardProps = {
	serviceCard: TServiceCardRow;
	logoUrl?: string | null;
	closeModal: () => void;
	callbacks?: {
		onSuccess?: () => void;
	};
};

export function ControlServiceCard({ serviceCard, logoUrl, closeModal, callbacks }: ControlServiceCardProps) {
	const [state, setState] = useState<TUpdateServiceCardInput>({
		id: serviceCard.id,
		codigo: serviceCard.codigo,
		ativo: serviceCard.ativo,
	});
	// Muda apenas quando o operador regenera (invalida o cartao impresso).
	const [tokenPublico, setTokenPublico] = useState(serviceCard.tokenPublico);
	const emUso = !!serviceCard.tabAbertaId;

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-service-card", serviceCard.id],
		mutationFn: updateServiceCard,
		onSuccess: (data, variables) => {
			callbacks?.onSuccess?.();
			if (variables.regenerarToken) {
				setTokenPublico(data.data.serviceCard.tokenPublico);
				toast.success("QR regenerado. O cartão impresso anterior não funciona mais — encomende um novo.");
				return;
			}
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const { mutate: remove, isPending: isRemoving } = useMutation({
		mutationKey: ["delete-service-card", serviceCard.id],
		mutationFn: deleteServiceCard,
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	return (
		<ResponsiveMenu
			menuTitle={`COMANDA ${serviceCard.codigo}`}
			menuDescription={emUso ? "Esta comanda está em uso por uma conta aberta." : "Atualize os dados da comanda."}
			menuActionButtonText="SALVAR"
			menuSecondaryActionButtonText="REGENERAR QR"
			secondaryActionFunction={() => {
				if (!window.confirm("Regenerar o QR invalida o cartão impresso desta comanda. Continuar?")) return;
				mutate({ id: serviceCard.id, regenerarToken: true });
			}}
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate(state)}
			actionIsLoading={isPending || isRemoving}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<div className="flex flex-col gap-3 p-1">
				<TextInput
					label="NÚMERO"
					value={state.codigo ?? ""}
					placeholder="Ex: 007"
					editable={!emUso}
					handleChange={(value) => setState((prev) => ({ ...prev, codigo: value.toUpperCase() }))}
				/>
				<CheckboxInput
					labelTrue="COMANDA ATIVA"
					labelFalse="COMANDA DESATIVADA (QR INVÁLIDO)"
					checked={state.ativo ?? true}
					handleChange={(value) => setState((prev) => ({ ...prev, ativo: value }))}
				/>
				<div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3">
					<span className="text-xs font-bold uppercase tracking-tight">Arquivo desta comanda</span>
					<ServiceCardFileActions cards={[{ codigo: serviceCard.codigo, tokenPublico }]} logoUrl={logoUrl} />
				</div>
				{!emUso ? (
					<Button
						variant="ghost"
						size="sm"
						className="flex w-fit items-center gap-1.5 text-destructive hover:text-destructive"
						disabled={isRemoving}
						onClick={() => {
							if (!window.confirm(`Excluir a comanda ${serviceCard.codigo}? Para um cartão perdido, prefira desativar.`)) return;
							remove({ id: serviceCard.id });
						}}
					>
						<Trash2 className="h-3.5 w-3.5" />
						EXCLUIR COMANDA
					</Button>
				) : null}
			</div>
		</ResponsiveMenu>
	);
}
