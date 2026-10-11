import type { TCreateServicePointInput } from "@/app/api/service-points/route";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { createServicePoint } from "@/lib/mutations/tabs";
import type { TServicePointTypeEnum } from "@/schemas/enums";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ServicePointQrDisplay } from "./ServicePointQrDisplay";

const SERVICE_POINT_TYPE_OPTIONS = [
	{ id: "MESA", value: "MESA", label: "MESA" },
	{ id: "BALCAO", value: "BALCAO", label: "BALCÃO" },
	{ id: "QUIOSQUE", value: "QUIOSQUE", label: "QUIOSQUE" },
	{ id: "OUTRO", value: "OUTRO", label: "OUTRO" },
];

type NewServicePointProps = {
	closeModal: () => void;
	callbacks?: {
		onSuccess?: () => void;
	};
};

export function NewServicePoint({ closeModal, callbacks }: NewServicePointProps) {
	const [state, setState] = useState<TCreateServicePointInput>({
		rotulo: "",
		grupo: null,
		tipo: "MESA",
		capacidade: null,
	});

	// Apos criar, mostra o QR fixo do ponto ja pronto para imprimir.
	const [createdToken, setCreatedToken] = useState<string | null>(null);

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-service-point"],
		mutationFn: createServicePoint,
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			setCreatedToken(data.data.servicePoint.tokenPublico);
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	if (createdToken) {
		return (
			<ResponsiveMenu
				menuTitle="PONTO CRIADO"
				menuDescription="Imprima o QR do ponto. Você pode reabri-lo depois em Editar ponto."
				menuActionButtonText="CONCLUIR"
				menuCancelButtonText="FECHAR"
				actionFunction={closeModal}
				actionIsLoading={false}
				stateIsLoading={false}
				stateError={null}
				closeMenu={closeModal}
			>
				<div className="p-1">
					<ServicePointQrDisplay tokenPublico={createdToken} rotulo={state.rotulo} />
				</div>
			</ResponsiveMenu>
		);
	}

	return (
		<ResponsiveMenu
			menuTitle="NOVO PONTO DE ATENDIMENTO"
			menuDescription="Cadastre uma mesa, balcão ou outro ponto durável de atendimento."
			menuActionButtonText="CRIAR"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate(state)}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<div className="flex flex-col gap-3 p-1">
				<TextInput
					label="RÓTULO"
					value={state.rotulo}
					placeholder="Ex: Mesa 12"
					handleChange={(value) => setState((prev) => ({ ...prev, rotulo: value }))}
				/>
				<TextInput
					label="GRUPO"
					value={state.grupo ?? ""}
					placeholder="Ex: Salão, Varanda (opcional)"
					handleChange={(value) => setState((prev) => ({ ...prev, grupo: value || null }))}
				/>
				<SelectInput
					label="TIPO"
					value={state.tipo}
					options={SERVICE_POINT_TYPE_OPTIONS}
					resetOptionLabel="MESA"
					handleChange={(value) => setState((prev) => ({ ...prev, tipo: value as TServicePointTypeEnum }))}
					onReset={() => setState((prev) => ({ ...prev, tipo: "MESA" }))}
				/>
				<NumberInput
					label="CAPACIDADE (LUGARES)"
					value={state.capacidade ?? 0}
					placeholder="Ex: 4"
					handleChange={(value) => setState((prev) => ({ ...prev, capacidade: value > 0 ? value : null }))}
				/>
			</div>
		</ResponsiveMenu>
	);
}
