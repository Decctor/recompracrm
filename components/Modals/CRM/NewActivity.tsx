"use client";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { createActivity } from "@/lib/mutations/crm";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type NewActivityProps = {
	leadId: string;
	closeMenu: () => void;
};

const TIPO_OPTIONS = [
	{ id: "LIGACAO", value: "LIGACAO", label: "Ligação" },
	{ id: "EMAIL", value: "EMAIL", label: "E-mail" },
	{ id: "REUNIAO", value: "REUNIAO", label: "Reunião" },
	{ id: "TAREFA", value: "TAREFA", label: "Tarefa" },
	{ id: "WHATSAPP", value: "WHATSAPP", label: "WhatsApp" },
];

export default function NewActivity({ leadId, closeMenu }: NewActivityProps) {
	const queryClient = useQueryClient();
	const [titulo, setTitulo] = useState("");
	const [descricao, setDescricao] = useState("");
	const [tipo, setTipo] = useState("TAREFA");
	const [dataAgendada, setDataAgendada] = useState("");
	const [duracaoMinutos, setDuracaoMinutos] = useState<number | null>(null);

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-activity"],
		mutationFn: () =>
			createActivity({
				activity: {
					leadId,
					tipo: tipo as any,
					titulo,
					descricao: descricao || null,
					status: "PENDENTE",
					dataAgendada: dataAgendada || new Date().toISOString(),
					duracaoMinutos,
				},
			}),
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: ["internal-lead-activities"] });
			queryClient.invalidateQueries({ queryKey: ["internal-lead-timeline", leadId] });
			closeMenu();
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
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
					label="Tipo"
					value={tipo}
					options={TIPO_OPTIONS}
					resetOptionLabel="Selecione"
					handleChange={setTipo}
					onReset={() => setTipo("TAREFA")}
					required
				/>
				<TextInput
					label="Título"
					placeholder="Título da atividade"
					value={titulo}
					handleChange={setTitulo}
					required
				/>
				<TextareaInput
					label="Descrição"
					placeholder="Detalhes da atividade..."
					value={descricao}
					handleChange={setDescricao}
				/>
			</ResponsiveMenuSection>

			<ResponsiveMenuSection title="AGENDAMENTO" icon={<Clock className="w-3.5 h-3.5" />}>
				<TextInput
					label="Data e Hora"
					placeholder="AAAA-MM-DD HH:MM"
					value={dataAgendada}
					handleChange={setDataAgendada}
					required
				/>
				<NumberInput
					label="Duração (min)"
					placeholder="Ex: 30"
					value={duracaoMinutos}
					handleChange={setDuracaoMinutos}
				/>
			</ResponsiveMenuSection>
		</ResponsiveMenu>
	);
}
