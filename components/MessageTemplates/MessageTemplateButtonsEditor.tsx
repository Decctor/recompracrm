"use client";

import { getMessageTemplateButtonPreset, MESSAGE_TEMPLATE_BUTTON_PRESET_OPTIONS } from "@/lib/message-templates/button-presets";
import type { TUseMessageTemplateState } from "@/state-hooks/use-message-template-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectGroup, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LinkIcon, ListChecks, Plus, Trash2 } from "lucide-react";
import { SurveyButtonEditor } from "./SurveyButtonEditor";

type TButton = TUseMessageTemplateState["state"]["messageTemplate"]["conteudo"]["botoes"][number];

const BUTTON_TYPE_OPTIONS = [
	{ value: "URL", label: "URL" },
	{ value: "RESPOSTA RÁPIDA", label: "RESPOSTA RÁPIDA" },
	{ value: "RESPOSTA_PESQUISA", label: "PESQUISA" },
	{ value: "TELEFONE", label: "TELEFONE" },
] as const;

export const EMPTY_SURVEY_BUTTON: TButton = { tipo: "RESPOSTA_PESQUISA", texto: "", campoId: "", opcaoValor: "" };

export function MessageTemplateButtonsEditor({
	buttons,
	addContentButton,
	addContentPresetButton,
	appendContentButtons,
	updateContentButton,
	removeContentButton,
}: {
	buttons: TButton[];
	addContentButton: TUseMessageTemplateState["addContentButton"];
	addContentPresetButton: TUseMessageTemplateState["addContentPresetButton"];
	appendContentButtons: TUseMessageTemplateState["appendContentButtons"];
	updateContentButton: TUseMessageTemplateState["updateContentButton"];
	removeContentButton: TUseMessageTemplateState["removeContentButton"];
}) {
	return (
		<div className="border-border bg-muted/20 flex flex-col gap-3 rounded-lg border p-3">
			<div className="flex items-center justify-between gap-2">
				<p className="flex items-center gap-1.5 text-xs font-bold uppercase">
					<LinkIcon className="h-3.5 w-3.5" />
					Botões
				</p>
				<Button type="button" variant="ghost" size="xs" className="gap-1" onClick={addContentButton}>
					<Plus className="h-3.5 w-3.5" />
					MANUAL
				</Button>
			</div>
			<div className="flex flex-wrap gap-2">
				{MESSAGE_TEMPLATE_BUTTON_PRESET_OPTIONS.map((preset) => (
					<Button key={preset.id} type="button" variant="outline" size="xs" className="gap-1" onClick={() => addContentPresetButton(preset.id)}>
						<Plus className="h-3.5 w-3.5" />
						{preset.label}
					</Button>
				))}
				<Button type="button" variant="outline" size="xs" className="gap-1" onClick={() => appendContentButtons([EMPTY_SURVEY_BUTTON])}>
					<ListChecks className="h-3.5 w-3.5" />
					Pesquisa
				</Button>
			</div>
			{buttons.length > 0 ? (
				buttons.map((button, index) => (
					<MessageTemplateButtonEditor
						key={index}
						button={button}
						index={index}
						allButtons={buttons}
						updateButton={updateContentButton}
						removeButton={removeContentButton}
						appendButtons={appendContentButtons}
					/>
				))
			) : (
				<p className="text-muted-foreground text-xs">Nenhum botão configurado.</p>
			)}
		</div>
	);
}

function ButtonTypeSelect({ button, index, updateButton }: { button: TButton; index: number; updateButton: (index: number, button: TButton) => void }) {
	return (
		<Select
			items={[...BUTTON_TYPE_OPTIONS]}
			value={button.tipo}
			onValueChange={(value) => {
				if (value === null) return;
				if (value === "URL") updateButton(index, { tipo: "URL", texto: button.texto, url: "url" in button ? button.url : "https://" });
				if (value === "RESPOSTA RÁPIDA") updateButton(index, { tipo: "RESPOSTA RÁPIDA", texto: button.texto });
				if (value === "RESPOSTA_PESQUISA") updateButton(index, { tipo: "RESPOSTA_PESQUISA", texto: button.texto, campoId: "", opcaoValor: "" });
				if (value === "TELEFONE") updateButton(index, { tipo: "TELEFONE", texto: button.texto, telefone: "telefone" in button ? button.telefone : "" });
			}}
		>
			<SelectTrigger className="w-full">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{BUTTON_TYPE_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

export function MessageTemplateButtonEditor({
	button,
	index,
	allButtons,
	updateButton,
	removeButton,
	appendButtons,
}: {
	button: TButton;
	index: number;
	allButtons: TButton[];
	updateButton: (index: number, button: TButton) => void;
	removeButton: (index: number) => void;
	appendButtons: (buttons: TButton[]) => void;
}) {
	if (button.tipo === "URL_PRESET") {
		const preset = getMessageTemplateButtonPreset(button.preset);

		return (
			<div className="grid gap-2 rounded-lg bg-background p-2">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="text-xs font-bold uppercase">{preset?.label ?? button.preset}</p>
						<p className="text-muted-foreground text-xs">{preset?.description}</p>
					</div>
					<Button type="button" variant="ghost-destructive" size="icon-sm" onClick={() => removeButton(index)}>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
				<Input value={button.texto} onChange={(event) => updateButton(index, { ...button, texto: event.target.value })} placeholder="Texto do botão" />
			</div>
		);
	}

	if (button.tipo === "RESPOSTA_PESQUISA") {
		return (
			<SurveyButtonEditor
				button={button}
				index={index}
				allButtons={allButtons}
				onChange={(next) => updateButton(index, next)}
				onRemove={() => removeButton(index)}
				onAppendButtons={appendButtons}
				typeSelect={<ButtonTypeSelect button={button} index={index} updateButton={updateButton} />}
			/>
		);
	}

	return (
		<div className="grid gap-2 rounded-lg bg-background p-2 md:grid-cols-[140px_1fr_1fr_auto]">
			<ButtonTypeSelect button={button} index={index} updateButton={updateButton} />
			<Input value={button.texto} onChange={(event) => updateButton(index, { ...button, texto: event.target.value } as TButton)} placeholder="Texto" />
			{"url" in button ? (
				<Input value={button.url} onChange={(event) => updateButton(index, { ...button, url: event.target.value })} placeholder="https://" />
			) : "telefone" in button ? (
				<Input value={button.telefone} onChange={(event) => updateButton(index, { ...button, telefone: event.target.value })} placeholder="+55..." />
			) : (
				<div />
			)}
			<Button type="button" variant="ghost-destructive" size="icon-sm" onClick={() => removeButton(index)}>
				<Trash2 className="h-4 w-4" />
			</Button>
		</div>
	);
}
