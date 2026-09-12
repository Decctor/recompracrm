"use client";

import SelectInput from "@/components/Inputs/SelectInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ClientTagsBlock from "@/components/Modals/Clients/Blocks/Tags";
import SectionApplyBar from "@/components/Utils/SectionApplyBar";
import { Section } from "@/components/ui/section";
import { formatDateAsLocale } from "@/lib/formatting";
import type { TUseClientSectionEditor } from "@/state-hooks/use-client-section-editor";
import { CustomersAcquisitionChannels } from "@/utils/select-options";
import { Lock, Megaphone } from "lucide-react";

type ClientRelationshipSectionProps = {
	editor: TUseClientSectionEditor;
	consentimentoMarketingData: Date | string | null;
};

/** Como o cliente chegou, como a loja o classifica e o que a equipe precisa lembrar sobre ele. */
export default function ClientRelationshipSection({ editor, consentimentoMarketingData }: ClientRelationshipSectionProps) {
	const { state, updateClient, addClientTag, removeClientTag } = editor;

	return (
		<Section.Root>
			<Section.Header>
				<Section.Icon>
					<Megaphone />
				</Section.Icon>
				<Section.Title>Relacionamento</Section.Title>
			</Section.Header>
			<Section.Body>
				<SelectInput
					label="CANAL DE AQUISIÇÃO"
					value={state.client.canalAquisicao ?? null}
					options={CustomersAcquisitionChannels}
					handleChange={(value) => updateClient({ canalAquisicao: value })}
					onReset={() => updateClient({ canalAquisicao: null })}
					resetOptionLabel="NÃO DEFINIDO"
				/>

				<div className="flex w-full flex-col gap-1.5">
					<h3 className="text-foreground/80 text-sm font-medium tracking-tight">TAGS</h3>
					<ClientTagsBlock embedded tags={state.clientTags} addClientTag={addClientTag} removeClientTag={removeClientTag} />
				</div>

				<TextareaInput
					label="ANOTAÇÕES"
					value={state.client.anotacoes ?? ""}
					placeholder="Preencha aqui anotações sobre o cliente."
					handleChange={(value) => updateClient({ anotacoes: value || null })}
				/>

				{/* LGPD: o consentimento é do cliente, não do operador — a tela mostra, não edita. */}
				<div className="bg-muted flex items-center gap-2 rounded-lg px-3 py-2.5">
					<Lock className="text-muted-foreground h-4 w-4 min-h-4 min-w-4" />
					<p className="text-muted-foreground text-numeric text-xs">
						{consentimentoMarketingData
							? `Consentimento de marketing aceito em ${formatDateAsLocale(consentimentoMarketingData)} · somente leitura`
							: "Sem consentimento de marketing registrado · somente leitura"}
					</p>
				</div>

				<SectionApplyBar isDirty={editor.isDirty} isPending={editor.isPending} onApply={editor.apply} onDiscard={editor.discard} />
			</Section.Body>
		</Section.Root>
	);
}
