import ClientLocationAddressPaste from "@/components/Clients/ClientLocationAddressPaste";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import type { TAddressRegion } from "@/lib/geo/address-parsing";
import { useClientLocationAutofill } from "@/lib/hooks/use-client-location-autofill";
import { useOrganizationRegion } from "@/lib/queries/organizations";
import type { TUseClientState } from "@/state-hooks/use-client-state";
import { BrazilianCitiesOptionsFromUF, BrazilianStatesOptions } from "@/utils/states-cities";
import { MapPin, Plus, Trash2 } from "lucide-react";

type ClientLocationsBlockProps = {
	locations: TUseClientState["state"]["clientLocations"];
	addClientLocation: TUseClientState["addClientLocation"];
	updateClientLocation: TUseClientState["updateClientLocation"];
	removeClientLocation: TUseClientState["removeClientLocation"];
};

export default function ClientLocationsBlock({
	locations,
	addClientLocation,
	updateClientLocation,
	removeClientLocation,
}: ClientLocationsBlockProps) {
	const activeLocations = locations.filter((location) => !location.deletar);
	const { data: organizationRegion = null } = useOrganizationRegion();

	return (
		<ResponsiveMenuSection title="LOCALIZAÇÕES" icon={<MapPin className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full flex items-center justify-between">
				<p className="text-xs text-muted-foreground">A primeira localização ativa também define o endereço principal do cliente.</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="gap-1"
					onClick={() =>
						addClientLocation({
							titulo: locations.length > 0 ? `Localização ${locations.length + 1}` : "Localização Principal",
							// A maior parte da clientela mora na cidade da loja: o endereço já nasce nela.
							...organizationRegion,
						})
					}
				>
					<Plus className="h-4 w-4" />
					ADICIONAR
				</Button>
			</div>

			{activeLocations.length === 0 ? (
				<div className="w-full rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhuma localização adicionada.</div>
			) : (
				<div className="w-full flex flex-col gap-3">
					{locations.map((location, index) => {
						if (location.deletar) return null;
						const isPrimary = activeLocations[0] === location;

						return (
							<ClientLocationBlockCard
								key={location.id ?? `new-location-${index}`}
								location={location}
								isPrimary={isPrimary}
								defaultRegion={organizationRegion}
								updateClientLocation={(changes) => updateClientLocation(index, changes)}
								removeClientLocation={() => removeClientLocation(index)}
							/>
						);
					})}
				</div>
			)}
		</ResponsiveMenuSection>
	);
}

type ClientLocationBlockCardProps = {
	location: TUseClientState["state"]["clientLocations"][number];
	isPrimary: boolean;
	defaultRegion: TAddressRegion | null;
	updateClientLocation: (info: Parameters<TUseClientState["updateClientLocation"]>[1]) => void;
	removeClientLocation: () => void;
};
function ClientLocationBlockCard({ location, isPrimary, defaultRegion, updateClientLocation, removeClientLocation }: ClientLocationBlockCardProps) {
	const autofill = useClientLocationAutofill({ location, updateLocation: updateClientLocation, defaultRegion });
	return (
		<div className="w-full rounded-lg border p-3 flex flex-col gap-2">
			<div className="w-full flex items-center justify-between gap-2">
				<p className="text-xs font-semibold tracking-wide">LOCALIZAÇÃO {isPrimary ? "(PRINCIPAL)" : ""}</p>
				<Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeClientLocation()}>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>

			<TextInput
				label="TÍTULO"
				placeholder="Ex: Casa, Trabalho"
				value={location.titulo}
				handleChange={(value) => updateClientLocation({ titulo: value })}
			/>

			<ClientLocationAddressPaste autofill={autofill} />

			<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
				<TextInput label="CEP" placeholder="Digite o CEP" value={location.localizacaoCep ?? ""} handleChange={autofill.handleCepChange} />
				<SelectInput
					label="ESTADO"
					value={location.localizacaoEstado ?? null}
					options={BrazilianStatesOptions}
					handleChange={autofill.handleStateChange}
					onReset={() => updateClientLocation({ localizacaoEstado: null, localizacaoCidade: null })}
					resetOptionLabel="NÃO DEFINIDO"
				/>
				<SelectInput
					label="CIDADE"
					value={location.localizacaoCidade ?? null}
					options={BrazilianCitiesOptionsFromUF(location.localizacaoEstado ?? "")}
					handleChange={(value) => updateClientLocation({ localizacaoCidade: value || null })}
					onReset={() => updateClientLocation({ localizacaoCidade: null })}
					resetOptionLabel="NÃO DEFINIDO"
				/>
				<TextInput
					label="BAIRRO"
					placeholder="Digite o bairro"
					value={location.localizacaoBairro ?? ""}
					handleChange={(value) => updateClientLocation({ localizacaoBairro: value || null })}
				/>
				<TextInput
					label="LOGRADOURO"
					placeholder="Digite o logradouro"
					value={location.localizacaoLogradouro ?? ""}
					handleChange={(value) => updateClientLocation({ localizacaoLogradouro: value || null })}
				/>
				<TextInput
					id={autofill.numberInputId}
					label="NÚMERO"
					placeholder="Digite o número"
					value={location.localizacaoNumero ?? ""}
					handleChange={(value) => updateClientLocation({ localizacaoNumero: value || null })}
				/>
			</div>

			<TextInput
				label="COMPLEMENTO"
				placeholder="Apartamento, bloco, referência..."
				value={location.localizacaoComplemento ?? ""}
				handleChange={(value) => updateClientLocation({ localizacaoComplemento: value || null })}
			/>
		</div>
	);
}
