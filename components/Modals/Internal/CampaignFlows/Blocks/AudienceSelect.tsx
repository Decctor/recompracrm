import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TUseCampaignFlowState } from "@/state-hooks/use-campaign-flow-state";
import { useCampaignAudiences } from "@/lib/queries/campaign-audiences";
import { Users } from "lucide-react";

type AudienceSelectBlockProps = {
	campaignFlow: TUseCampaignFlowState["state"]["campaignFlow"];
	updateCampaignFlow: TUseCampaignFlowState["updateCampaignFlow"];
};

export default function AudienceSelectBlock({ campaignFlow, updateCampaignFlow }: AudienceSelectBlockProps) {
	const { data: audiencesData } = useCampaignAudiences({
		initialFilters: { search: "", page: 1 },
	});

	const audienceOptions = (audiencesData?.audiences ?? []).map((a) => ({
		id: a.id,
		value: a.id,
		label: a.titulo,
	}));

	return (
		<ResponsiveMenuSection title="PÚBLICO-ALVO" icon={<Users className="w-4 h-4" />}>
			<SelectInput
				label="PÚBLICO"
				value={campaignFlow.publicoId ?? null}
				options={audienceOptions}
				handleChange={(value) => updateCampaignFlow({ publicoId: value })}
				onReset={() => updateCampaignFlow({ publicoId: null })}
				resetOptionLabel="Todos os clientes"
			/>
			<p className="text-xs text-muted-foreground">
				Se nenhum público for selecionado, o fluxo será aplicado a todos os clientes da organização.
			</p>
		</ResponsiveMenuSection>
	);
}
