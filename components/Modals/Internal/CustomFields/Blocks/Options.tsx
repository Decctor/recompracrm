"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { MESSAGE_TEMPLATE_BUTTON_TEXT_MAX_LENGTH, MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT } from "@/lib/message-templates/constants";
import type { TUseInternalCustomFieldState } from "@/state-hooks/use-internal-custom-field-state";
import { ChevronDown, ChevronUp, ListChecks, Lock, Plus, Trash2 } from "lucide-react";

type CustomFieldOptionsBlockProps = {
	options: NonNullable<TUseInternalCustomFieldState["state"]["customField"]["opcoes"]>;
	addOption: TUseInternalCustomFieldState["addOption"];
	updateOption: TUseInternalCustomFieldState["updateOption"];
	removeOption: TUseInternalCustomFieldState["removeOption"];
	moveOption: TUseInternalCustomFieldState["moveOption"];
	/** Valores que um template de pesquisa usa como botão: não podem ser removidos (o servidor recusa). */
	lockedValues?: Set<string>;
};

/**
 * Opções de um campo de escolha. O `valor` é derivado do título no primeiro salvamento e depois
 * fica fixo (é o que está gravado nos clientes e nos botões de pesquisa); o usuário edita só o
 * título, que é o que o cliente lê.
 */
export default function CustomFieldOptionsBlock({ options, addOption, updateOption, removeOption, moveOption, lockedValues }: CustomFieldOptionsBlockProps) {
	return (
		<ResponsiveMenuSection title="OPÇÕES DE RESPOSTA" icon={<ListChecks className="h-4 w-4" />}>
			<p className="text-xs text-muted-foreground">
				Cada opção vira um botão de pesquisa (até {MESSAGE_TEMPLATE_BUTTONS_MAX_COUNT} por template, com {MESSAGE_TEMPLATE_BUTTON_TEXT_MAX_LENGTH}{" "}
				caracteres) e um cartão no cadastro do ponto de interação. A ordem aqui é a ordem em que aparecem.
			</p>
			<div className="flex w-full flex-col gap-2">
				{options.map((option, index) => {
					const locked = !!option.valor && !!lockedValues?.has(option.valor);
					return (
						<div key={index} className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
							<div className="flex flex-col">
								<Button variant="ghost" size="fit" className="p-0.5" disabled={index === 0} onClick={() => moveOption(index, -1)}>
									<ChevronUp className="h-3.5 w-3.5" />
								</Button>
								<Button variant="ghost" size="fit" className="p-0.5" disabled={index === options.length - 1} onClick={() => moveOption(index, 1)}>
									<ChevronDown className="h-3.5 w-3.5" />
								</Button>
							</div>
							<div className="flex min-w-0 grow flex-col gap-1">
								<Input
									value={option.titulo}
									placeholder={`Opção ${index + 1}`}
									onChange={(event) => updateOption(index, { titulo: event.target.value })}
								/>
								{option.valor ? (
									<span className="truncate text-[10px] font-mono text-muted-foreground">
										{option.valor}
										{locked ? " · em uso por um template de pesquisa" : ""}
									</span>
								) : null}
							</div>
							<Button
								type="button"
								variant="ghost-destructive"
								size="icon-sm"
								disabled={locked}
								title={locked ? "Esta opção é um botão de pesquisa num template. Arquive o template para removê-la." : undefined}
								onClick={() => removeOption(index)}
							>
								{locked ? <Lock className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
							</Button>
						</div>
					);
				})}
			</div>
			<Button type="button" variant="ghost" size="xs" className="w-fit gap-1" onClick={addOption}>
				<Plus className="h-3.5 w-3.5" />
				ADICIONAR OPÇÃO
			</Button>
		</ResponsiveMenuSection>
	);
}
