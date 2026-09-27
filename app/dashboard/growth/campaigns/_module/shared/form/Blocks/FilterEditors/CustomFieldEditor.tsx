"use client";

import { useSurveyCustomFields } from "@/components/MessageTemplates/SurveyButtonEditor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { cn } from "@/lib/utils";
import { CampaignCustomFieldFilterConfigSchema, type TCampaignCustomFieldFilterConfig } from "@/schemas/campaigns";
import { CUSTOM_FIELD_TYPE_LABELS, type TCustomFieldFilterOperatorEnum } from "@/schemas/enums";
import { Check, ListChecks } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const CUSTOM_FIELD_FILTER_OPERATOR_LABELS: Record<TCustomFieldFilterOperatorEnum, string> = {
	IGUAL: "É",
	DIFERENTE: "NÃO É",
	PREENCHIDO: "PREENCHIDO",
	NAO_PREENCHIDO: "NÃO PREENCHIDO",
};

const OPERATOR_ORDER: TCustomFieldFilterOperatorEnum[] = ["IGUAL", "DIFERENTE", "PREENCHIDO", "NAO_PREENCHIDO"];

type CustomFieldEditorProps = {
	initialValue?: TCampaignCustomFieldFilterConfig;
	onConfirm: (config: TCampaignCustomFieldFilterConfig) => void;
	closeModal: () => void;
};

/**
 * Editor da condição CAMPO_PERSONALIZADO: campo de escolha → operador → opções. É o filtro que
 * transforma respostas de pesquisa (e qualquer campo coletado no ponto de interação) em público.
 */
export default function CustomFieldEditor({ initialValue, onConfirm, closeModal }: CustomFieldEditorProps) {
	const { fields, isLoading } = useSurveyCustomFields();
	const [campoId, setCampoId] = useState(initialValue?.campoId ?? "");
	const [operador, setOperador] = useState<TCustomFieldFilterOperatorEnum>(initialValue?.operador ?? "IGUAL");
	const [valores, setValores] = useState<string[]>(initialValue?.valores ?? []);
	const field = fields.find((candidate) => candidate.id === campoId) ?? null;
	const usesValues = operador === "IGUAL" || operador === "DIFERENTE";

	function toggleValue(valor: string) {
		setValores((current) => (current.includes(valor) ? current.filter((item) => item !== valor) : [...current, valor]));
	}

	function handleConfirm() {
		const parsed = CampaignCustomFieldFilterConfigSchema.safeParse({ campoId, operador, valores: usesValues ? valores : [] });
		if (!parsed.success) {
			toast.error(parsed.error.issues[0]?.message ?? "Preencha os campos do filtro.");
			return;
		}
		onConfirm(parsed.data);
		closeModal();
	}

	return (
		<ResponsiveMenu
			menuTitle="CAMPO PERSONALIZADO"
			menuDescription="Filtre clientes pela resposta gravada num campo de escolha — respostas de pesquisa ou dados do cadastro."
			menuActionButtonText="CONFIRMAR"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleConfirm}
			actionIsLoading={false}
			stateIsLoading={false}
			stateError={null}
			closeMenu={closeModal}
			dialogVariant="sm"
		>
			<ResponsiveMenuSection title="CAMPO" icon={<ListChecks className="h-4 min-h-4 w-4 min-w-4" />}>
				<div className="flex w-full flex-col gap-1">
					<Label className="text-sm font-medium tracking-tight text-foreground/80">
						CAMPO<span className="text-red-500">*</span>
					</Label>
					<Select
						items={fields.map((candidate) => ({ value: candidate.id, label: candidate.titulo }))}
						value={campoId || null}
						onValueChange={(value) => {
							if (value === null) return;
							setCampoId(value);
							setValores([]);
						}}
						disabled={isLoading}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder={isLoading ? "Carregando campos..." : "Selecione o campo"} />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{fields.map((candidate) => (
									<SelectItem key={candidate.id} value={candidate.id}>
										{candidate.titulo} · {CUSTOM_FIELD_TYPE_LABELS[candidate.tipo]}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>

				<div className="flex w-full flex-col gap-2">
					<Label className="text-sm font-medium tracking-tight text-foreground/80">CONDIÇÃO</Label>
					<div className="flex flex-wrap items-center gap-2">
						{OPERATOR_ORDER.map((option) => (
							<Button
								key={option}
								type="button"
								variant={operador === option ? "brand" : "outline"}
								size="sm"
								onClick={() => setOperador(option)}
							>
								{CUSTOM_FIELD_FILTER_OPERATOR_LABELS[option]}
							</Button>
						))}
					</div>
					{field?.tipo === "ESCOLHA_MULTIPLA" && usesValues ? (
						<p className="text-[11px] text-muted-foreground">
							Escolha múltipla: "É" inclui quem marcou ao menos uma das opções; "NÃO É" exclui quem marcou qualquer uma delas.
						</p>
					) : null}
				</div>

				{usesValues ? (
					<div className="flex w-full flex-col gap-2">
						<Label className="text-sm font-medium tracking-tight text-foreground/80">
							OPÇÕES<span className="text-red-500">*</span>
						</Label>
						{!field ? (
							<p className="text-xs italic text-muted-foreground">Selecione o campo para ver as opções.</p>
						) : (
							<div className="flex flex-wrap items-center gap-2">
								{(field.opcoes ?? []).map((option) => {
									const selected = valores.includes(option.valor);
									return (
										<button
											key={option.valor}
											type="button"
											onClick={() => toggleValue(option.valor)}
											className={cn(
												"flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
												selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/80 hover:bg-primary/10",
											)}
										>
											{selected ? <Check className="h-3 w-3" /> : null}
											{option.titulo}
										</button>
									);
								})}
							</div>
						)}
					</div>
				) : null}
			</ResponsiveMenuSection>
		</ResponsiveMenu>
	);
}
