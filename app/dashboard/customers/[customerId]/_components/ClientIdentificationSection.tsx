"use client";

import { MISSING_ESSENTIAL_FIELD_CLASS, MissingEssentialsChip } from "./registry-shared";
import DateInput from "@/components/Inputs/DateInput";
import TextInput from "@/components/Inputs/TextInput";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Chip } from "@/components/ui/chip";
import { Section } from "@/components/ui/section";
import type { TClientEssentialField } from "@/lib/clients/client-registry-state";
import { formatDateForInputValue, formatDateOnInputChange, formatToCPForCNPJ } from "@/lib/formatting";
import type { TUseClientSectionEditor } from "@/state-hooks/use-client-section-editor";
import { Hash, IdCard } from "lucide-react";

type ClientIdentificationSectionProps = {
	editor: TUseClientSectionEditor;
	idExterno: string | null;
	missingFields: Set<TClientEssentialField>;
};

/** Quem é o cliente: o que identifica a pessoa e o que a nota fiscal precisa nomear. */
export default function ClientIdentificationSection({ editor, idExterno, missingFields }: ClientIdentificationSectionProps) {
	const { state, updateClient } = editor;
	const sectionMissingCount = (["nome", "cpfCnpj", "datas"] as const).filter((field) => missingFields.has(field)).length;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<IdCard />
				</Section.Icon>
				<Section.Title>Identificação</Section.Title>
				<MissingEssentialsChip count={sectionMissingCount} />
				{idExterno ? (
					<Section.Actions>
						<Chip.Root size="sm" shape="pill" variant="muted" className="text-numeric">
							<Chip.Icon>
								<Hash />
							</Chip.Icon>
							<Chip.Label>ID EXTERNO {idExterno}</Chip.Label>
						</Chip.Root>
					</Section.Actions>
				) : null}
			</Section.Header>
			<Section.Body>
				<div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					<TextInput
						label="NOME"
						required
						placeholder="Preencha aqui o nome do cliente."
						value={state.client.nome}
						className={missingFields.has("nome") ? MISSING_ESSENTIAL_FIELD_CLASS : undefined}
						handleChange={(value) => updateClient({ nome: value })}
					/>
					<TextInput
						label="CPF/CNPJ"
						required
						placeholder="000.000.000-00"
						value={state.client.cpfCnpj ?? ""}
						className={missingFields.has("cpfCnpj") ? MISSING_ESSENTIAL_FIELD_CLASS : undefined}
						handleChange={(value) => updateClient({ cpfCnpj: formatToCPForCNPJ(value) || null })}
					/>
					<DateInput
						label="DATA DE NASCIMENTO"
						value={formatDateForInputValue(state.client.dataNascimento)}
						holderClassName={missingFields.has("datas") ? MISSING_ESSENTIAL_FIELD_CLASS : undefined}
						handleChange={(value) => updateClient({ dataNascimento: formatDateOnInputChange(value, "date") })}
					/>
					<DateInput
						label="DATA DE FUNDAÇÃO"
						value={formatDateForInputValue(state.client.dataFundacao)}
						handleChange={(value) => updateClient({ dataFundacao: formatDateOnInputChange(value, "date") })}
					/>
					<TextInput
						label="PROFISSÃO"
						placeholder="Preencha aqui a profissão do cliente."
						value={state.client.profissao ?? ""}
						handleChange={(value) => updateClient({ profissao: value || null })}
					/>
					<TextInput
						label="ONDE TRABALHA"
						placeholder="Preencha aqui onde o cliente trabalha."
						value={state.client.ondeTrabalha ?? ""}
						handleChange={(value) => updateClient({ ondeTrabalha: value || null })}
					/>
					<TextInput
						label="ESTADO CIVIL"
						placeholder="Preencha aqui o estado civil do cliente."
						value={state.client.estadoCivil ?? ""}
						handleChange={(value) => updateClient({ estadoCivil: value || null })}
					/>
					<TextInput
						label="DEFICIÊNCIA"
						placeholder="Preencha aqui a deficiência, se houver."
						value={state.client.deficiencia ?? ""}
						handleChange={(value) => updateClient({ deficiencia: value || null })}
					/>
				</div>

				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />
			</Section.Body>
		</Section.Root>
	);
}
