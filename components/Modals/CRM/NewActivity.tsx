"use client";
import type { TCreateActivityInput } from "@/app/api/admin/crm/activities/route";
import DateTimeInput from "@/components/Inputs/DateTimeInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { formatDateForInputValue, formatDateOnInputChange } from "@/lib/formatting";
import { createActivity } from "@/lib/mutations/crm";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type NewActivityProps = {
	leadId: string;
	closeMenu: () => void;
	callbacks?: {
		onMutate?: (variables: TCreateActivityInput) => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

const TIPO_OPTIONS = [
	{ id: "LIGACAO", value: "LIGACAO", label: "Ligação" },
	{ id: "EMAIL", value: "EMAIL", label: "E-mail" },
	{ id: "REUNIAO", value: "REUNIAO", label: "Reunião" },
	{ id: "TAREFA", value: "TAREFA", label: "Tarefa" },
	{ id: "WHATSAPP", value: "WHATSAPP", label: "WhatsApp" },
];

export default function NewActivity({ leadId, closeMenu, callbacks }: NewActivityProps) {
	const queryClient = useQueryClient();

	const [activity, setActivity] = useState<TCreateActivityInput["activity"]>({
		leadId,
		tipo: "TAREFA",
		titulo: "",
		descricao: null,
		status: "PENDENTE",
		dataAgendada: new Date(),
		duracaoMinutos: null,
	});
	function updateActivity(activity: Partial<TCreateActivityInput["activity"]>) {
		setActivity((prev) => ({ ...prev, ...activity }));
	}
	const { mutate, isPending } = useMutation({
		mutationKey: ["create-activity"],
		mutationFn: () =>
			createActivity({
				activity,
			}),
		onMutate: async () => {
			if (callbacks?.onMutate) callbacks.onMutate({ activity });
		},
		onSuccess: (data) => {
			toast.success(data.message);
			if (callbacks?.onSuccess) callbacks.onSuccess();
			closeMenu();
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
			if (callbacks?.onError) callbacks.onError();
		},
		onSettled: () => {
			if (callbacks?.onSettled) callbacks.onSettled();
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVA ATIVIDADE"
			menuDescription="Agende uma nova atividade para este lead"
			menuActionButtonText="CRIAR ATIVIDADE"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate()}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
			dialogVariant="sm"
		>
			<ResponsiveMenuSection title="DETALHES" icon={<Calendar className="w-3.5 h-3.5" />}>
				<SelectInput
					label="TIPI"
					value={activity.tipo}
					options={TIPO_OPTIONS}
					resetOptionLabel="NÃO DEFINIDO"
					handleChange={(v) => updateActivity({ tipo: v as TCreateActivityInput["activity"]["tipo"] })}
					onReset={() => updateActivity({ tipo: "TAREFA" })}
					required
				/>
				<TextInput
					label="TÍTULO"
					placeholder="Preencha aqui o título da atividade"
					value={activity.titulo}
					handleChange={(v) => updateActivity({ titulo: v })}
					required
				/>
				<TextareaInput
					label="DESCRIÇÃO"
					placeholder="Preencha aqui a descrição da atividade"
					value={activity.descricao || ""}
					handleChange={(v) => updateActivity({ descricao: v })}
				/>
			</ResponsiveMenuSection>

			<ResponsiveMenuSection title="AGENDAMENTO" icon={<Clock className="w-3.5 h-3.5" />}>
				<DateTimeInput
					label="DATA E HORA"
					value={formatDateForInputValue(activity.dataAgendada, "datetime")}
					handleChange={(v) => updateActivity({ dataAgendada: formatDateOnInputChange(v, "date") || activity.dataAgendada })}
					required
				/>
				<NumberInput
					label="DURAÇÃO (MIN)"
					placeholder="Ex: 30"
					value={activity.duracaoMinutos}
					handleChange={(v) => updateActivity({ duracaoMinutos: v })}
				/>
			</ResponsiveMenuSection>
		</ResponsiveMenu>
	);
}
