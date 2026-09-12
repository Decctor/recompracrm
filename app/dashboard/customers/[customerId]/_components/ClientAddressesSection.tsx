"use client";

import { MISSING_ESSENTIAL_FIELD_CLASS, MissingEssentialsChip } from "./registry-shared";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Section } from "@/components/ui/section";
import type { TClientEssentialField } from "@/lib/clients/client-registry-state";
import { getClientLocationAddressByCEP } from "@/lib/clients/locations";
import { formatToCEP } from "@/lib/formatting";
import type { TClientLocationState } from "@/state-hooks/use-client-state";
import type { TUseClientSectionEditor } from "@/state-hooks/use-client-section-editor";
import { BrazilianCitiesOptionsFromUF, BrazilianStatesOptions } from "@/utils/states-cities";
import { MapPin, Plus, Trash2 } from "lucide-react";

type ClientAddressesSectionProps = {
	editor: TUseClientSectionEditor;
	missingFields: Set<TClientEssentialField>;
};

/**
 * Lista de endereços do cliente. A primeira ativa é a principal — `syncClientMainLocation` copia
 * os campos dela para o cliente, que é o endereço usado no cabeçalho e nas entregas.
 */
export default function ClientAddressesSection({ editor, missingFields }: ClientAddressesSectionProps) {
	const { state, addClientLocation, updateClientLocation, removeClientLocation } = editor;
	const activeLocations = state.clientLocations.filter((location) => !location.deletar);
	const addressIsMissing = missingFields.has("endereco");

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<MapPin />
				</Section.Icon>
				<Section.Title>Endereços</Section.Title>
				<Section.Count>{activeLocations.length}</Section.Count>
				<MissingEssentialsChip count={addressIsMissing ? 1 : 0} />
				<Section.Actions>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="gap-1"
						onClick={() =>
							addClientLocation({
								titulo: state.clientLocations.length > 0 ? `Localização ${state.clientLocations.length + 1}` : "Localização Principal",
							})
						}
					>
						<Plus className="h-4 w-4 min-h-4 min-w-4" />
						ADICIONAR ENDEREÇO
					</Button>
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				{activeLocations.length === 0 ? (
					<div
						className={
							addressIsMissing
								? "text-warning-surface-foreground bg-warning-surface w-full rounded-lg border border-dashed border-warning/60 p-4 text-center text-xs"
								: "text-muted-foreground w-full rounded-lg border border-dashed border-border p-4 text-center text-xs"
						}
					>
						Nenhum endereço cadastrado.
					</div>
				) : (
					<div className="flex w-full flex-col gap-3">
						{state.clientLocations.map((location, index) => {
							if (location.deletar) return null;
							return (
								<ClientAddressCard
									key={location.id ?? `new-location-${index}`}
									location={location}
									isPrimary={activeLocations[0] === location}
									highlightMissing={addressIsMissing}
									updateClientLocation={(changes) => updateClientLocation(index, changes)}
									removeClientLocation={() => removeClientLocation(index)}
								/>
							);
						})}
					</div>
				)}

				<p className="text-muted-foreground text-xs">O primeiro endereço da lista é o que vai para o cabeçalho e para as entregas.</p>

				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />
			</Section.Body>
		</Section.Root>
	);
}

type ClientAddressCardProps = {
	location: TClientLocationState;
	isPrimary: boolean;
	highlightMissing: boolean;
	updateClientLocation: (changes: Partial<TClientLocationState>) => void;
	removeClientLocation: () => void;
};

function ClientAddressCard({ location, isPrimary, highlightMissing, updateClientLocation, removeClientLocation }: ClientAddressCardProps) {
	async function setAddressDataByCEP(cep: string) {
		const addressInfo = await getClientLocationAddressByCEP(cep);
		if (!addressInfo) return;
		updateClientLocation(addressInfo);
	}

	// Só o endereço principal carrega o destaque de pendência: é ele que vira o endereço do cliente.
	const missingClassName = highlightMissing && isPrimary ? MISSING_ESSENTIAL_FIELD_CLASS : undefined;

	return (
		<div className="border-border flex w-full flex-col gap-3 rounded-lg border p-3">
			<div className="flex w-full items-center gap-2">
				<div className="min-w-0 grow">
					<TextInput
						label="TÍTULO DO ENDEREÇO"
						showLabel={false}
						aria-label="Título do endereço"
						placeholder="Ex: Casa, Trabalho"
						value={location.titulo}
						className="border-none px-0 shadow-none focus-visible:ring-0"
						handleChange={(value) => updateClientLocation({ titulo: value })}
					/>
				</div>
				{isPrimary ? (
					<Chip.Root size="xs" shape="pill" variant="info">
						<Chip.Label caps weight="bold">
							Principal
						</Chip.Label>
					</Chip.Root>
				) : null}
				<Button type="button" variant="ghost" size="icon" className="text-destructive h-7 w-7" onClick={removeClientLocation}>
					<Trash2 className="h-4 w-4 min-h-4 min-w-4" />
				</Button>
			</div>

			<div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
				<TextInput
					label="CEP"
					placeholder="00000-000"
					value={location.localizacaoCep ?? ""}
					className={missingClassName}
					handleChange={(value) => {
						const formattedCep = formatToCEP(value);
						if (formattedCep.length === 9) setAddressDataByCEP(formattedCep);
						updateClientLocation({ localizacaoCep: formattedCep || null });
					}}
				/>
				<SelectInput
					label="ESTADO"
					value={location.localizacaoEstado ?? null}
					options={BrazilianStatesOptions}
					handleChange={(value) =>
						updateClientLocation({ localizacaoEstado: value || null, localizacaoCidade: BrazilianCitiesOptionsFromUF(value)[0]?.value ?? null })
					}
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
			</div>

			<div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
				<div className="lg:col-span-2">
					<TextInput
						label="LOGRADOURO"
						placeholder="Rua, avenida"
						value={location.localizacaoLogradouro ?? ""}
						className={missingClassName}
						handleChange={(value) => updateClientLocation({ localizacaoLogradouro: value || null })}
					/>
				</div>
				<TextInput
					label="NÚMERO"
					placeholder="Nº"
					value={location.localizacaoNumero ?? ""}
					className={missingClassName}
					handleChange={(value) => updateClientLocation({ localizacaoNumero: value || null })}
				/>
				<TextInput
					label="COMPLEMENTO"
					placeholder="Apto, bloco"
					value={location.localizacaoComplemento ?? ""}
					handleChange={(value) => updateClientLocation({ localizacaoComplemento: value || null })}
				/>
			</div>
		</div>
	);
}
