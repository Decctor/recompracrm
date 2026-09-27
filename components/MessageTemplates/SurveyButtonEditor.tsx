"use client";

import type { TGetCustomFieldsOutputDefault } from "@/app/api/custom-fields/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MESSAGE_TEMPLATE_BUTTON_TEXT_MAX_LENGTH, MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT } from "@/lib/message-templates/constants";
import type { TMessageTemplateSurveyButton } from "@/lib/message-templates/surveys";
import { useCustomFields } from "@/lib/queries/custom-fields";
import type { TMessageTemplateContent } from "@/schemas/message-templates";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";

type TCustomField = TGetCustomFieldsOutputDefault["customFields"][number];
type TButton = TMessageTemplateContent["botoes"][number];

const SURVEY_FIELD_TYPES = new Set(["ESCOLHA_UNICA", "ESCOLHA_MULTIPLA"]);

/** Campos de escolha ativos da organização: os únicos que um botão de pesquisa pode alimentar. */
export function useSurveyCustomFields() {
	const query = useCustomFields({ entidade: "CLIENTE", ativoOnly: true });
	const fields = useMemo(() => (query.data?.customFields ?? []).filter((field) => SURVEY_FIELD_TYPES.has(field.tipo)), [query.data]);
	return { ...query, fields };
}

/** Texto do botão a partir da opção: o título, cortado no limite da Meta. */
export function buildSurveyButtonText(option: { titulo: string }) {
	return option.titulo.slice(0, MESSAGE_TEMPLATE_BUTTON_TEXT_MAX_LENGTH);
}

export function buildSurveyButtonsForField(field: TCustomField, excludeOptionValues: Set<string> = new Set()): TMessageTemplateSurveyButton[] {
	return (field.opcoes ?? [])
		.filter((option) => !excludeOptionValues.has(option.valor))
		.map((option) => ({ tipo: "RESPOSTA_PESQUISA" as const, texto: buildSurveyButtonText(option), campoId: field.id, opcaoValor: option.valor }));
}

/**
 * Linha do editor para um botão RESPOSTA_PESQUISA: campo → opção → texto. Trocar o campo limpa a
 * opção; escolher a opção preenche o texto quando ele ainda é o título da opção anterior (ou vazio),
 * para não sobrescrever um rótulo que o usuário já personalizou.
 */
export function SurveyButtonEditor({
	button,
	index,
	allButtons,
	onChange,
	onRemove,
	onAppendButtons,
	typeSelect,
}: {
	button: TMessageTemplateSurveyButton;
	index: number;
	allButtons: TButton[];
	onChange: (button: TButton) => void;
	onRemove: () => void;
	onAppendButtons: (buttons: TButton[]) => void;
	/** Seletor de tipo do botão, renderizado pelo editor pai para manter os tipos num só lugar. */
	typeSelect: React.ReactNode;
}) {
	const { fields, isLoading } = useSurveyCustomFields();
	const field = fields.find((candidate) => candidate.id === button.campoId) ?? null;
	const usedOptionValues = useMemo(
		() =>
			new Set(
				allButtons
					.filter((candidate, candidateIndex) => candidate.tipo === "RESPOSTA_PESQUISA" && candidateIndex !== index && candidate.campoId === button.campoId)
					.map((candidate) => (candidate as TMessageTemplateSurveyButton).opcaoValor),
			),
		[allButtons, button.campoId, index],
	);
	const remainingOptions = field ? (field.opcoes ?? []).filter((option) => !usedOptionValues.has(option.valor) && option.valor !== button.opcaoValor) : [];
	const roomLeft = MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT - allButtons.length;

	function handleFieldChange(fieldId: string | null) {
		if (!fieldId) return;
		onChange({ ...button, campoId: fieldId, opcaoValor: "", texto: "" });
	}

	function handleOptionChange(optionValue: string | null) {
		if (!optionValue || !field) return;
		const option = (field.opcoes ?? []).find((candidate) => candidate.valor === optionValue);
		if (!option) return;
		const previousOption = (field.opcoes ?? []).find((candidate) => candidate.valor === button.opcaoValor);
		const keepsCustomText = button.texto.trim() && button.texto !== (previousOption ? buildSurveyButtonText(previousOption) : "");
		onChange({ ...button, opcaoValor: option.valor, texto: keepsCustomText ? button.texto : buildSurveyButtonText(option) });
	}

	return (
		<div className="grid gap-2 rounded-lg bg-background p-2">
			<div className="grid gap-2 md:grid-cols-[140px_1fr_1fr_auto]">
				{typeSelect}
				<Select
					items={fields.map((candidate) => ({ value: candidate.id, label: candidate.titulo }))}
					value={button.campoId || null}
					onValueChange={handleFieldChange}
					disabled={isLoading}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder={isLoading ? "Carregando campos..." : "Campo da pesquisa"} />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{fields.length === 0 ? (
								<p className="px-3 py-2 text-xs text-muted-foreground">Nenhum campo de escolha ativo. Crie um em Configurações → Campos personalizados.</p>
							) : null}
							{fields.map((candidate) => (
								<SelectItem key={candidate.id} value={candidate.id}>
									{candidate.titulo}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				<Select
					items={(field?.opcoes ?? []).map((option) => ({ value: option.valor, label: option.titulo }))}
					value={button.opcaoValor || null}
					onValueChange={handleOptionChange}
					disabled={!field}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Opção de resposta" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{(field?.opcoes ?? []).map((option) => (
								<SelectItem key={option.valor} value={option.valor} disabled={usedOptionValues.has(option.valor)}>
									{option.titulo}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				<Button type="button" variant="ghost-destructive" size="icon-sm" onClick={onRemove}>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
			<div className="grid gap-2 md:grid-cols-[1fr_auto]">
				<Input
					value={button.texto}
					maxLength={MESSAGE_TEMPLATE_BUTTON_TEXT_MAX_LENGTH}
					onChange={(event) => onChange({ ...button, texto: event.target.value })}
					placeholder="Texto do botão (o que o cliente lê)"
				/>
				{field && remainingOptions.length > 0 && roomLeft > 0 ? (
					<Button
						type="button"
						variant="outline"
						size="xs"
						className="gap-1 self-center"
						onClick={() =>
							onAppendButtons(buildSurveyButtonsForField(field, new Set([...usedOptionValues, button.opcaoValor])).slice(0, roomLeft))
						}
					>
						<Plus className="h-3.5 w-3.5" />
						DEMAIS OPÇÕES ({Math.min(remainingOptions.length, roomLeft)})
					</Button>
				) : null}
			</div>
			<p className="flex items-center gap-1 text-[11px] text-muted-foreground">
				<ListChecks className="h-3 w-3" />
				{field
					? `O toque grava "${button.opcaoValor || "…"}" em "${field.titulo}" (${field.tipo === "ESCOLHA_MULTIPLA" ? "escolha múltipla" : "escolha única"}).`
					: "O toque do cliente grava a opção escolhida no campo personalizado."}
			</p>
		</div>
	);
}
