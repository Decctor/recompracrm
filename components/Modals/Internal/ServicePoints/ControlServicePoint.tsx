import type { TGetServicePointsOutput, TUpdateServicePointInput } from "@/app/api/service-points/route";
import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { updateServicePoint } from "@/lib/mutations/tabs";
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

type TServicePointRow = NonNullable<TGetServicePointsOutput["data"]["default"]>[number];

type ControlServicePointProps = {
	servicePoint: TServicePointRow;
	closeModal: () => void;
	callbacks?: {
		onSuccess?: () => void;
	};
};

export function ControlServicePoint({ servicePoint, closeModal, callbacks }: ControlServicePointProps) {
	const [state, setState] = useState<TUpdateServicePointInput>({
		id: servicePoint.id,
		rotulo: servicePoint.rotulo,
		grupo: servicePoint.grupo,
		tipo: servicePoint.tipo,
		capacidade: servicePoint.capacidade,
		ativo: servicePoint.ativo,
	});

	// QR fixo do ponto. Muda apenas quando o operador regenera (invalida o impresso).
	const [tokenPublico, setTokenPublico] = useState(servicePoint.tokenPublico);

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-service-point", servicePoint.id],
		mutationFn: updateServicePoint,
		onSuccess: (data, variables) => {
			callbacks?.onSuccess?.();
			if (variables.regenerarToken) {
				setTokenPublico(data.data.servicePoint.tokenPublico);
				toast.success("QR regenerado. O QR impresso anterior não funciona mais — imprima o novo.");
				return;
			}
			toast.success(data.message);
			closeModal();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	return (
		<ResponsiveMenu
			menuTitle="EDITAR PONTO DE ATENDIMENTO"
			menuDescription="Atualize os dados do ponto de atendimento."
			menuActionButtonText="SALVAR"
			menuSecondaryActionButtonText="REGENERAR QR"
			secondaryActionFunction={() => {
				if (!window.confirm("Regenerar o QR invalida o QR impresso atual. Continuar?")) return;
				mutate({ ...state, regenerarToken: true });
			}}
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate(state)}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
		>
			<div className="flex flex-col gap-3 p-1">
				<ServicePointQrDisplay tokenPublico={tokenPublico} rotulo={state.rotulo || servicePoint.rotulo} />
				<TextInput
					label="RÓTULO"
					value={state.rotulo ?? ""}
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
					value={state.tipo ?? "MESA"}
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
				<CheckboxInput
					labelTrue="PONTO ATIVO"
					labelFalse="PONTO INATIVO"
					checked={state.ativo ?? true}
					handleChange={(value) => setState((prev) => ({ ...prev, ativo: value }))}
				/>
			</div>
		</ResponsiveMenu>
	);
}
