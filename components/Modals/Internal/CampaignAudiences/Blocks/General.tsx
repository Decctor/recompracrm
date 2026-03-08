import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TUseCampaignAudienceState } from "@/state-hooks/use-campaign-audience-state";
import { LayoutGrid } from "lucide-react";

type CampaignAudienceGeneralBlockProps = {
	audience: TUseCampaignAudienceState["state"]["audience"];
	updateAudience: TUseCampaignAudienceState["updateAudience"];
};

export default function CampaignAudienceGeneralBlock({ audience, updateAudience }: CampaignAudienceGeneralBlockProps) {
	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<LayoutGrid className="w-4 h-4" />}>
			<TextInput
				label="TÍTULO DO PÚBLICO"
				value={audience.titulo}
				placeholder="Ex: Clientes VIP de São Paulo..."
				handleChange={(value) => updateAudience({ titulo: value })}
				width="100%"
				required
			/>
			<TextareaInput
				label="DESCRIÇÃO"
				value={audience.descricao ?? ""}
				placeholder="Descreva o público-alvo..."
				handleChange={(value) => updateAudience({ descricao: value || null })}
			/>
		</ResponsiveMenuSection>
	);
}
