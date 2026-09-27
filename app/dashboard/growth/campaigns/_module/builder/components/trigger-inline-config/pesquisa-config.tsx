"use client";

import DateInput from "@/components/Inputs/DateInput";
import TextInput from "@/components/Inputs/TextInput";
import { useSurveyCustomFields } from "@/components/MessageTemplates/SurveyButtonEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildUniqueCustomFieldOptionValues } from "@/lib/custom-fields/option-values";
import { getErrorMessage } from "@/lib/errors";
import { MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT } from "@/lib/message-templates/constants";
import { createCustomField } from "@/lib/mutations/custom-fields";
import { CUSTOM_FIELD_TYPE_LABELS } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useBuilderCampaign } from "../builder-provider";

const MIN_OPTIONS = 2;

/**
 * Configuração inline do gatilho PESQUISA: a data do disparo e o campo personalizado que recebe as
 * respostas. O campo é a pergunta; as opções dele viram os botões do template (etapa Mensagem).
 * Criar o campo aqui evita mandar o usuário para as configurações no meio do construtor.
 */
export default function PesquisaConfig() {
	const { state, updateCampaign } = useBuilderCampaign();
	const { fields, isLoading, queryKey } = useSurveyCustomFields();
	const [creating, setCreating] = useState(false);
	const selectedField = fields.find((field) => field.id === state.campaign.gatilhoPesquisaCampoId) ?? null;

	return (
		<div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4">
			<p className="text-xs text-muted-foreground">
				A pesquisa é enviada uma única vez na data selecionada e no bloco de horário da etapa de Envio. Cada botão do template grava a
				opção escolhida no campo personalizado do cliente — depois, esse campo serve de filtro para novos públicos.
			</p>
			<DateInput
				label="DATA DO DISPARO"
				value={state.campaign.gatilhoPesquisaDataReferencia ?? undefined}
				handleChange={(value) => updateCampaign({ gatilhoPesquisaDataReferencia: value ?? null })}
			/>
			<div className="flex w-full flex-col gap-1">
				<label className="text-xs font-medium tracking-tight">CAMPO DA PERGUNTA</label>
				<div className="flex w-full flex-wrap items-center gap-2">
					<Select
						items={fields.map((field) => ({ value: field.id, label: field.titulo }))}
						value={state.campaign.gatilhoPesquisaCampoId ?? null}
						onValueChange={(value) => {
							if (value === null) return;
							updateCampaign({ gatilhoPesquisaCampoId: value });
						}}
						disabled={isLoading}
					>
						<SelectTrigger className="w-full sm:w-auto sm:min-w-64">
							<SelectValue placeholder={isLoading ? "Carregando campos..." : "Selecione o campo de escolha"} />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{fields.map((field) => (
									<SelectItem key={field.id} value={field.id}>
										{field.titulo}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Button type="button" variant="outline" size="sm" className="gap-1 rounded-full" onClick={() => setCreating((current) => !current)}>
						<Plus className="h-3.5 w-3.5" />
						{creating ? "CANCELAR" : "NOVO CAMPO"}
					</Button>
				</div>
				{selectedField ? (
					<p className="flex items-center gap-1 text-[11px] text-muted-foreground">
						<ListChecks className="h-3 w-3" />
						{CUSTOM_FIELD_TYPE_LABELS[selectedField.tipo]} · {(selectedField.opcoes ?? []).length} opções:{" "}
						{(selectedField.opcoes ?? []).map((option) => option.titulo).join(", ")}
					</p>
				) : fields.length === 0 && !isLoading ? (
					<p className="text-[11px] text-muted-foreground">Nenhum campo de escolha ativo. Crie um aqui para começar.</p>
				) : null}
			</div>
			{creating ? (
				<NewSurveyFieldForm
					onCreated={(fieldId) => {
						updateCampaign({ gatilhoPesquisaCampoId: fieldId });
						setCreating(false);
					}}
					queryKey={queryKey}
				/>
			) : null}
		</div>
	);
}

function NewSurveyFieldForm({ onCreated, queryKey }: { onCreated: (fieldId: string) => void; queryKey: unknown[] }) {
	const queryClient = useQueryClient();
	const [titulo, setTitulo] = useState("");
	const [tipo, setTipo] = useState<"ESCOLHA_UNICA" | "ESCOLHA_MULTIPLA">("ESCOLHA_UNICA");
	const [optionTitles, setOptionTitles] = useState<string[]>(["", ""]);

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-survey-custom-field"],
		mutationFn: createCustomField,
		onSuccess: async (response) => {
			toast.success(response.message);
			await queryClient.invalidateQueries({ queryKey });
			onCreated(response.data.insertedId);
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function handleSubmit() {
		const cleanTitles = optionTitles.map((title) => title.trim()).filter(Boolean);
		if (!titulo.trim()) return toast.error("Informe o título da pergunta.");
		if (cleanTitles.length < MIN_OPTIONS) return toast.error(`Informe ao menos ${MIN_OPTIONS} opções de resposta.`);
		const values = buildUniqueCustomFieldOptionValues(cleanTitles);
		mutate({
			customField: {
				entidade: "CLIENTE",
				chaveNativa: null,
				titulo: titulo.trim(),
				descricao: null,
				tipo,
				opcoes: cleanTitles.map((title, index) => ({ valor: values[index], titulo: title, legenda: null, icone: null })),
				ativo: true,
			},
		});
	}

	return (
		<div className="flex w-full flex-col gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/[0.04] p-3">
			<TextInput label="TÍTULO DA PERGUNTA" value={titulo} placeholder="Ex.: Sabor preferido" handleChange={setTitulo} />
			<div className="flex w-full flex-col gap-1">
				<label className="text-xs font-medium tracking-tight">TIPO DE RESPOSTA</label>
				<Select
					items={[
						{ value: "ESCOLHA_UNICA", label: CUSTOM_FIELD_TYPE_LABELS.ESCOLHA_UNICA },
						{ value: "ESCOLHA_MULTIPLA", label: CUSTOM_FIELD_TYPE_LABELS.ESCOLHA_MULTIPLA },
					]}
					value={tipo}
					onValueChange={(value) => {
						if (value === "ESCOLHA_UNICA" || value === "ESCOLHA_MULTIPLA") setTipo(value);
					}}
				>
					<SelectTrigger className="w-full sm:w-auto sm:min-w-64">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="ESCOLHA_UNICA">{CUSTOM_FIELD_TYPE_LABELS.ESCOLHA_UNICA}</SelectItem>
							<SelectItem value="ESCOLHA_MULTIPLA">{CUSTOM_FIELD_TYPE_LABELS.ESCOLHA_MULTIPLA}</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
				<p className="text-[11px] text-muted-foreground">
					Escolha única: o último toque vale. Escolha múltipla: cada toque acumula no campo do cliente.
				</p>
			</div>
			<div className="flex w-full flex-col gap-2">
				<label className="text-xs font-medium tracking-tight">OPÇÕES DE RESPOSTA (até {MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT} botões)</label>
				{optionTitles.map((title, index) => (
					<div key={index} className="flex items-center gap-2">
						<Input
							value={title}
							placeholder={`Opção ${index + 1}`}
							maxLength={25}
							onChange={(event) => setOptionTitles((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
						/>
						<Button
							type="button"
							variant="ghost-destructive"
							size="icon-sm"
							disabled={optionTitles.length <= MIN_OPTIONS}
							onClick={() => setOptionTitles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				))}
				<Button
					type="button"
					variant="ghost"
					size="xs"
					className="w-fit gap-1"
					disabled={optionTitles.length >= MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT}
					onClick={() => setOptionTitles((current) => [...current, ""])}
				>
					<Plus className="h-3.5 w-3.5" />
					ADICIONAR OPÇÃO
				</Button>
			</div>
			<Button type="button" size="sm" className="w-fit rounded-full" disabled={isPending} onClick={handleSubmit}>
				{isPending ? "CRIANDO..." : "CRIAR CAMPO"}
			</Button>
		</div>
	);
}
