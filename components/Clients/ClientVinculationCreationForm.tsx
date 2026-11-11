"use client";

import DateInput from "@/components/Inputs/DateInput";
import ClientGeneralBlock from "@/components/Modals/Clients/Blocks/General";
import ClientLocationsBlock from "@/components/Modals/Clients/Blocks/Locations";
import { Button } from "@/components/ui/button";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatDateForInputValue, formatDateOnInputChange } from "@/lib/formatting";
import { getClientSearchIntentLabel, parseClientSearchIntent } from "@/lib/clients/parse-client-search-intent";
import type { TUseClientState } from "@/state-hooks/use-client-state";
import { ArrowLeft, Cake, UserRound } from "lucide-react";
import { useEffect } from "react";

type ClientVinculationCreationFormProps = {
	source: "manual" | "no_results";
	seedSearch: string;
	state: TUseClientState["state"];
	updateClient: TUseClientState["updateClient"];
	addClientLocation: TUseClientState["addClientLocation"];
	updateClientLocation: TUseClientState["updateClientLocation"];
	removeClientLocation: TUseClientState["removeClientLocation"];
	onReturnToSearch: () => void;
	onReady: () => void;
};

export default function ClientVinculationCreationForm({
	source,
	seedSearch,
	state,
	updateClient,
	addClientLocation,
	updateClientLocation,
	removeClientLocation,
	onReturnToSearch,
	onReady,
}: ClientVinculationCreationFormProps) {
	const searchIntent = parseClientSearchIntent(seedSearch);

	useEffect(() => onReady(), [onReady]);

	return (
		<div className="flex flex-col gap-4">
			<Button type="button" variant="ghost" size="sm" className="w-fit px-2 text-muted-foreground" onClick={onReturnToSearch}>
				<ArrowLeft className="size-4" />
				VOLTAR PARA A BUSCA
			</Button>
			<div className="flex flex-col gap-3 rounded-xl border border-border p-3">
				<div className="space-y-1">
					<div className="flex items-center gap-2 text-sm font-semibold">
						<UserRound className="h-4 w-4" />
						{source === "no_results" ? getClientSearchIntentLabel(searchIntent.kind) : "Cadastrar outro cliente"}
					</div>
					<p className="text-xs text-muted-foreground">
						{source === "manual"
							? "Use os dados da busca como ponto de partida e complete o novo cadastro."
							: "Preenchemos automaticamente o campo detectado na busca."}
					</p>
				</div>
				<ClientGeneralBlock client={state.client} updateClient={updateClient} />
				<ResponsiveMenuSection title="ANIVERSÁRIO" icon={<Cake className="h-4 min-h-4 w-4 min-w-4" />}>
					<div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2">
						<DateInput
							label="DATA DE NASCIMENTO"
							value={formatDateForInputValue(state.client.dataNascimento)}
							handleChange={(value) => updateClient({ dataNascimento: formatDateOnInputChange(value, "date") })}
						/>
					</div>
				</ResponsiveMenuSection>
				<ClientLocationsBlock
					locations={state.clientLocations}
					addClientLocation={addClientLocation}
					updateClientLocation={updateClientLocation}
					removeClientLocation={removeClientLocation}
				/>
			</div>
		</div>
	);
}
