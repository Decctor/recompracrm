import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TCommunityContentStatusEnum, TCommunityMaterialTypeEnum } from "@/schemas/enums";
import type { TUseInternalCommunityMaterialState } from "@/state-hooks/use-internal-community-material-state";
import { FileText } from "lucide-react";

const MaterialTypeOptions: { id: number; value: TCommunityMaterialTypeEnum; label: string }[] = [
	{ id: 1, value: "EBOOK", label: "EBOOK" },
	{ id: 2, value: "PLAYBOOK", label: "PLAYBOOK" },
	{ id: 3, value: "PLANILHA", label: "PLANILHA" },
	{ id: 4, value: "TEMPLATE", label: "TEMPLATE" },
	{ id: 5, value: "GUIA", label: "GUIA" },
	{ id: 6, value: "CHECKLIST", label: "CHECKLIST" },
	{ id: 7, value: "INFOGRAFICO", label: "INFOGRÁFICO" },
	{ id: 8, value: "DOCUMENTO", label: "DOCUMENTO" },
];

const MaterialStatusOptions: { id: number; value: TCommunityContentStatusEnum; label: string }[] = [
	{ id: 1, value: "RASCUNHO", label: "RASCUNHO" },
	{ id: 2, value: "PUBLICADO", label: "PUBLICADO" },
	{ id: 3, value: "ARQUIVADO", label: "ARQUIVADO" },
];

type MaterialGeneralBlockProps = {
	communityMaterial: TUseInternalCommunityMaterialState["state"]["communityMaterial"];
	updateCommunityMaterial: TUseInternalCommunityMaterialState["updateCommunityMaterial"];
};
export default function MaterialGeneralBlock({ communityMaterial, updateCommunityMaterial }: MaterialGeneralBlockProps) {
	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<FileText className="h-4 min-h-4 w-4 min-w-4" />}>
			<TextInput
				label="TÍTULO"
				placeholder="Preencha aqui o título do material..."
				value={communityMaterial.titulo}
				handleChange={(value) => updateCommunityMaterial({ titulo: value })}
			/>
			<TextareaInput
				label="DESCRIÇÃO (OPCIONAL)"
				placeholder="Preencha aqui uma breve descrição do material..."
				value={communityMaterial.descricao ?? ""}
				handleChange={(value) => updateCommunityMaterial({ descricao: value })}
			/>
			<TextareaInput
				label="RESUMO (OPCIONAL)"
				placeholder="Preencha aqui um resumo do material..."
				value={communityMaterial.resumo ?? ""}
				handleChange={(value) => updateCommunityMaterial({ resumo: value })}
			/>
			<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
				<SelectInput
					label="TIPO DO MATERIAL"
					value={communityMaterial.tipo}
					resetOptionLabel="SELECIONE O TIPO"
					handleChange={(value) => updateCommunityMaterial({ tipo: value as TCommunityMaterialTypeEnum })}
					width="100%"
					options={MaterialTypeOptions}
					onReset={() => updateCommunityMaterial({ tipo: "EBOOK" })}
				/>
				<SelectInput
					label="STATUS"
					value={communityMaterial.status}
					resetOptionLabel="SELECIONE O STATUS"
					handleChange={(value) => updateCommunityMaterial({ status: value as TCommunityContentStatusEnum })}
					width="100%"
					options={MaterialStatusOptions}
					onReset={() => updateCommunityMaterial({ status: "RASCUNHO" })}
				/>
			</div>
			<NumberInput
				label="ORDEM"
				placeholder="0"
				value={communityMaterial.ordem}
				handleChange={(value) => updateCommunityMaterial({ ordem: value })}
				width="100%"
			/>
		</ResponsiveMenuSection>
	);
}
