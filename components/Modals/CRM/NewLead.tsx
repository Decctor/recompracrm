"use client";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { createInternalLead } from "@/lib/mutations/crm";
import type { TInternalLead } from "@/schemas/internal-leads";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, DollarSign, User } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type NewLeadProps = {
	closeMenu: () => void;
};

const ORIGEM_OPTIONS = [
	{ id: "INDICACAO", value: "INDICACAO", label: "Indicação" },
	{ id: "SITE", value: "SITE", label: "Site" },
	{ id: "COLD_CALL", value: "COLD_CALL", label: "Cold Call" },
	{ id: "COLD_EMAIL", value: "COLD_EMAIL", label: "Cold Email" },
	{ id: "LINKEDIN", value: "LINKEDIN", label: "LinkedIn" },
	{ id: "EVENTO", value: "EVENTO", label: "Evento" },
	{ id: "INBOUND", value: "INBOUND", label: "Inbound" },
	{ id: "OUTRO", value: "OUTRO", label: "Outro" },
];

export default function NewLead({ closeMenu }: NewLeadProps) {
	const queryClient = useQueryClient();
	const [lead, setLead] = useState<Partial<TInternalLead>>({
		statusCRM: "NOVO",
		organizacaoNome: "",
		organizacaoCnpj: "",
		contatoNome: "",
		contatoEmail: "",
	});

	const updateField = useCallback(<K extends keyof TInternalLead>(key: K, value: TInternalLead[K]) => {
		setLead((prev) => ({ ...prev, [key]: value }));
	}, []);

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-internal-lead"],
		mutationFn: () =>
			createInternalLead({
				lead: lead as TInternalLead,
			}),
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: ["internal-leads"] });
			queryClient.invalidateQueries({ queryKey: ["internal-leads-kanban"] });
			closeMenu();
		},
		onError: (error) => {
			toast.error(getErrorMessage(error));
		},
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVO LEAD"
			menuDescription="Preencha os campos para criar um novo lead no pipeline"
			menuActionButtonText="CRIAR LEAD"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate()}
			actionIsLoading={isPending}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeMenu}
			dialogVariant="md"
		>
			<ResponsiveMenuSection title="ORGANIZAÇÃO" icon={<Building2 className="w-3.5 h-3.5" />}>
				<TextInput
					label="Nome da Organização"
					placeholder="Nome da empresa"
					value={lead.organizacaoNome ?? ""}
					handleChange={(v) => updateField("organizacaoNome", v)}
					required
				/>
				<TextInput
					label="CNPJ"
					placeholder="00.000.000/0000-00"
					value={lead.organizacaoCnpj ?? ""}
					handleChange={(v) => updateField("organizacaoCnpj", v)}
					required
				/>
				<TextInput
					label="Telefone"
					placeholder="(00) 00000-0000"
					value={lead.organizacaoTelefone ?? ""}
					handleChange={(v) => updateField("organizacaoTelefone", v)}
				/>
				<TextInput
					label="E-mail"
					placeholder="contato@empresa.com"
					value={lead.organizacaoEmail ?? ""}
					handleChange={(v) => updateField("organizacaoEmail", v)}
				/>
				<TextInput
					label="Site"
					placeholder="https://www.empresa.com"
					value={lead.organizacaoSite ?? ""}
					handleChange={(v) => updateField("organizacaoSite", v)}
				/>
			</ResponsiveMenuSection>

			<ResponsiveMenuSection title="CONTATO" icon={<User className="w-3.5 h-3.5" />}>
				<TextInput
					label="Nome do Contato"
					placeholder="Nome completo"
					value={lead.contatoNome ?? ""}
					handleChange={(v) => updateField("contatoNome", v)}
					required
				/>
				<TextInput
					label="E-mail do Contato"
					placeholder="contato@email.com"
					value={lead.contatoEmail ?? ""}
					handleChange={(v) => updateField("contatoEmail", v)}
					required
				/>
				<TextInput
					label="Telefone do Contato"
					placeholder="(00) 00000-0000"
					value={lead.contatoTelefone ?? ""}
					handleChange={(v) => updateField("contatoTelefone", v)}
				/>
				<TextInput
					label="Cargo"
					placeholder="Ex: Diretor Comercial"
					value={lead.contatoCargo ?? ""}
					handleChange={(v) => updateField("contatoCargo", v)}
				/>
			</ResponsiveMenuSection>

			<ResponsiveMenuSection title="OPORTUNIDADE" icon={<DollarSign className="w-3.5 h-3.5" />}>
				<TextInput
					label="Título"
					placeholder="Nome da oportunidade"
					value={lead.titulo ?? ""}
					handleChange={(v) => updateField("titulo", v)}
				/>
				<TextareaInput
					label="Descrição"
					placeholder="Descreva a oportunidade..."
					value={lead.descricao ?? ""}
					handleChange={(v) => updateField("descricao", v)}
				/>
				<NumberInput
					label="Valor Estimado"
					placeholder="0,00"
					value={lead.valor}
					handleChange={(v) => updateField("valor", v)}
				/>
				<NumberInput
					label="Probabilidade (%)"
					placeholder="0-100"
					value={lead.probabilidade}
					handleChange={(v) => updateField("probabilidade", v)}
				/>
				<SelectInput
					label="Origem do Lead"
					value={lead.origemLead ?? null}
					options={ORIGEM_OPTIONS}
					resetOptionLabel="Sem origem"
					handleChange={(v) => updateField("origemLead", v as any)}
					onReset={() => updateField("origemLead", null)}
				/>
			</ResponsiveMenuSection>
		</ResponsiveMenu>
	);
}
