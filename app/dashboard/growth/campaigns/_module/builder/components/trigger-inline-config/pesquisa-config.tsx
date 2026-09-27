"use client";

import DateInput from "@/components/Inputs/DateInput";
import { useSurveyCustomFields } from "@/components/MessageTemplates/SurveyButtonEditor";
import ControlCustomField from "@/components/Modals/Internal/CustomFields/ControlCustomField";
import NewCustomField from "@/components/Modals/Internal/CustomFields/NewCustomField";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { appRoutes } from "@/lib/navigation/routes";
import { CUSTOM_FIELD_TYPE_LABELS } from "@/schemas/enums";
import { ListChecks, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useBuilderCampaign } from "../builder-provider";

/**
 * Configuração inline do gatilho PESQUISA: a data do disparo e o campo personalizado que recebe as
 * respostas. O campo é a pergunta; as opções dele viram os botões do template (etapa Mensagem).
 *
 * Criar e editar o campo aqui usa os mesmos modais da tela de campos personalizados (mesmo padrão
 * do cupom inline do construtor): o usuário não sai do fluxo, e o campo criado já fica selecionado.
 * Diferente do cupom, o campo é criado na hora, não no submit da campanha — o template de pesquisa
 * precisa do id do campo antes de ir para aprovação da Meta.
 */
export default function PesquisaConfig() {
	const { state, updateCampaign } = useBuilderCampaign();
	const { fields, isLoading } = useSurveyCustomFields();
	const [modal, setModal] = useState<"new" | "edit" | null>(null);
	const selectedField = fields.find((field) => field.id === state.campaign.gatilhoPesquisaCampoId) ?? null;

	return (
		<div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4">
			{modal === "new" ? (
				<NewCustomField
					choiceTypesOnly
					closeModal={() => setModal(null)}
					callbacks={{ onSuccess: (response) => updateCampaign({ gatilhoPesquisaCampoId: response.data.insertedId }) }}
				/>
			) : null}
			{modal === "edit" && selectedField ? <ControlCustomField customFieldId={selectedField.id} closeModal={() => setModal(null)} /> : null}

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
					<Button type="button" variant="outline" size="sm" className="gap-1 rounded-full" onClick={() => setModal("new")}>
						<Plus className="h-3.5 w-3.5" />
						NOVO CAMPO
					</Button>
					{selectedField ? (
						<Button type="button" variant="ghost" size="sm" className="gap-1 rounded-full" onClick={() => setModal("edit")}>
							<Pencil className="h-3.5 w-3.5" />
							EDITAR
						</Button>
					) : null}
				</div>
				{selectedField ? (
					<p className="flex items-center gap-1 text-[11px] text-muted-foreground">
						<ListChecks className="h-3 w-3" />
						{CUSTOM_FIELD_TYPE_LABELS[selectedField.tipo]} · {(selectedField.opcoes ?? []).length} opções:{" "}
						{(selectedField.opcoes ?? []).map((option) => option.titulo).join(", ")}
					</p>
				) : fields.length === 0 && !isLoading ? (
					<p className="text-[11px] text-muted-foreground">
						Nenhum campo de escolha ativo. Crie um aqui ou em{" "}
						<Link href={`${appRoutes.settings()}?view=custom-fields`} target="_blank" className="font-semibold text-primary hover:underline">
							Configurações → Campos personalizados
						</Link>
						.
					</p>
				) : null}
			</div>
		</div>
	);
}
