"use client";

import CheckboxInput from "@/components/Inputs/CheckboxInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { cn } from "@/lib/utils";
import type { TPreparationStationTicketScopeEnum } from "@/schemas/enums";
import type { TUseInternalPreparationStationState } from "@/state-hooks/use-internal-preparation-station-state";
import { LayoutGrid } from "lucide-react";

export const PREPARATION_STATION_TICKET_SCOPE_LABELS: Record<TPreparationStationTicketScopeEnum, string> = {
	PEDIDO: "Pedido inteiro, com destaque nos itens desta estação",
	ESTACAO: "Somente os itens desta estação",
};

const TICKET_SCOPE_DESCRIPTIONS: Record<TPreparationStationTicketScopeEnum, string> = {
	PEDIDO: "Os demais itens saem em corpo menor, sob “Também neste pedido” — quem prepara sabe o que acompanha.",
	ESTACAO: "O ticket traz só o que esta estação prepara.",
};

type PreparationStationGeneralBlockProps = {
	station: TUseInternalPreparationStationState["state"]["station"];
	updateStation: TUseInternalPreparationStationState["updateStation"];
};

export default function PreparationStationGeneralBlock({ station, updateStation }: PreparationStationGeneralBlockProps) {
	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="h-4 w-4" />}>
			<TextInput
				label="NOME"
				required
				value={station.nome}
				placeholder="Ex.: Cozinha, Bar, Balcão"
				handleChange={(value) => updateStation({ nome: value })}
			/>
			<div className="flex w-full flex-col gap-1 md:flex-row">
				<CheckboxInput
					checked={station.ativa}
					labelTrue="ATIVA"
					labelFalse="INATIVA"
					description={station.ativa ? "Recebe itens dos tickets de preparo." : "Não recebe itens; as regras ficam guardadas."}
					justify="justify-start"
					handleChange={(value) => updateStation({ ativa: value, ...(value ? {} : { padrao: false }) })}
				/>
				<CheckboxInput
					checked={station.padrao}
					labelTrue="ESTAÇÃO PADRÃO"
					labelFalse="ESTAÇÃO PADRÃO"
					description="Recebe os itens que nenhuma regra capturou. Só uma estação é padrão."
					justify="justify-start"
					editable={station.ativa}
					handleChange={(value) => updateStation({ padrao: value })}
				/>
			</div>
			<div className="flex w-full flex-col gap-1.5">
				<span className="text-start text-sm font-medium tracking-tight text-foreground/80">O QUE O TICKET MOSTRA</span>
				<div role="radiogroup" aria-label="O que o ticket mostra" className="grid w-full grid-cols-1 gap-2 md:grid-cols-2">
					{(Object.keys(PREPARATION_STATION_TICKET_SCOPE_LABELS) as TPreparationStationTicketScopeEnum[]).map((scope) => {
						const selected = station.escopoTicket === scope;
						return (
							<button
								key={scope}
								type="button"
								role="radio"
								aria-checked={selected}
								onClick={() => updateStation({ escopoTicket: scope })}
								className={cn(
									"flex w-full flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
									selected ? "border-primary/40 bg-primary/10" : "border-border bg-card hover:bg-accent",
								)}
							>
								<span className={cn("text-sm font-semibold", selected && "text-primary")}>{PREPARATION_STATION_TICKET_SCOPE_LABELS[scope]}</span>
								<span className="text-xs text-muted-foreground">{TICKET_SCOPE_DESCRIPTIONS[scope]}</span>
							</button>
						);
					})}
				</div>
			</div>
		</ResponsiveMenuSection>
	);
}
