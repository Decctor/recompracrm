"use client";

import { SegmentationsField } from "@/app/dashboard/growth/campaigns/_module/builder/components/segmentations-panel";
import { getCategoryFromTrigger } from "@/app/dashboard/growth/campaigns/_module/builder/helpers/categories";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import CampaignsActionBlock from "@/app/dashboard/growth/campaigns/_module/shared/form/Blocks/Action";
import CampaignsCashbackGenerationBlock from "@/app/dashboard/growth/campaigns/_module/shared/form/Blocks/CashbackGeneration";
import CampaignsCouponGenerationBlock from "@/app/dashboard/growth/campaigns/_module/shared/form/Blocks/CouponGeneration";
import CampaignsConfigBlock from "@/app/dashboard/growth/campaigns/_module/shared/form/Blocks/Config";
import CampaignsConversionBlock from "@/app/dashboard/growth/campaigns/_module/shared/form/Blocks/Conversion";
import CampaignsExecutionBlock from "@/app/dashboard/growth/campaigns/_module/shared/form/Blocks/Execution";
import CampaignsFiltersBlock from "@/app/dashboard/growth/campaigns/_module/shared/form/Blocks/Filters";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { getErrorMessage } from "@/lib/errors";
import { updateCampaign } from "@/lib/mutations/campaigns";
import { useCampaignState, type TUseCampaignState } from "@/state-hooks/use-campaign-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TextIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { toast } from "sonner";
import { buildCampaignStateFromEntity, buildCampaignUpdatePayload } from "./utils";
import { useCampaignById, useCampaignStats } from "@/lib/queries/campaigns";

type ControlCampaignProps = {
	sessionUser: TAuthUserSession["user"];
	sessionUserOrg: NonNullable<TAuthUserSession["membership"]>["organizacao"];
	campaignId: string;
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};

	section: "general" | "send" | "audience" | "effects" | "settings";
};

type SharedSectionProps = {
	controller: TUseCampaignState;
};

/**
 * Shared shell for every per-section campaign edit. It hydrates a local
 * `useCampaignState` from the persisted campaign, renders the section blocks,
 * and submits the whole entity (so untouched fields are preserved) through the
 * existing `updateCampaign` mutation.
 */
export default function ControlCampaign({
	sessionUser: _sessionUser,
	sessionUserOrg,
	campaignId,
	closeModal,
	callbacks,
	section,
}: ControlCampaignProps) {
	const queryClient = useQueryClient();
	const { data: campaign, isLoading, isError, error, queryKey } = useCampaignById({ id: campaignId });
	const controller = useCampaignState();
	const { state, redefineState } = controller;
	useEffect(() => {
		if (!campaign) return;
		redefineState(buildCampaignStateFromEntity(campaign));
	}, [campaign, redefineState]);

	const { mutate, isPending } = useMutation({
		mutationKey: ["update-campaign-section", campaignId],
		mutationFn: updateCampaign,
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey });
			if (callbacks?.onMutate) callbacks.onMutate();
			return;
		},
		onSuccess: async (data) => {
			toast.success(data.message);
			callbacks?.onSuccess?.();
		},
		onError: (error) => {
			if (callbacks?.onError) callbacks.onError();
			toast.error(getErrorMessage(error));
		},
		onSettled: async () => {
			await queryClient.invalidateQueries({ queryKey });
			if (callbacks?.onSettled) callbacks.onSettled();
			closeModal();
		},
	});

	function handleSubmit() {
		mutate(buildCampaignUpdatePayload(campaignId, state));
	}

	return (
		<ResponsiveMenu
			menuTitle={"EDITAR CAMPANHA"}
			menuDescription={"Edite as informações da campanha"}
			menuActionButtonText="SALVAR ALTERAÇÕES"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={isError ? getErrorMessage(error) : null}
			closeMenu={closeModal}
		>
			{section === "general" ? <GeneralSection controller={controller} /> : null}
			{section === "send" ? (
				<SendSection
					controller={controller}
					organizationId={sessionUserOrg.id}
					organizationName={sessionUserOrg.nome}
					organizationLogoUrl={sessionUserOrg.logoUrl}
				/>
			) : null}
			{section === "audience" ? <AudienceSection controller={controller} /> : null}
			{section === "effects" ? <EffectsSection controller={controller} /> : null}
			{section === "settings" ? <SettingsSection controller={controller} campaignId={campaignId} /> : null}
		</ResponsiveMenu>
	);
}

function GeneralSection({ controller }: SharedSectionProps) {
	const { state, updateCampaign } = controller;

	return (
		<ResponsiveMenuSection title="INFORMAÇÕES GERAIS" icon={<TextIcon className="h-4 min-h-4 w-4 min-w-4" />}>
			<TextInput
				label="TÍTULO"
				value={state.campaign.titulo}
				placeholder="Dê um nome para identificar esta campanha"
				handleChange={(value) => updateCampaign({ titulo: value })}
			/>
			<TextareaInput
				label="DESCRIÇÃO"
				value={state.campaign.descricao ?? ""}
				placeholder="Conte em poucas linhas o objetivo desta campanha (uso interno)..."
				handleChange={(value) => updateCampaign({ descricao: value })}
			/>
		</ResponsiveMenuSection>
	);
}

type SendSectionProps = SharedSectionProps & {
	organizationId: string;
	organizationName: string;
	organizationLogoUrl: string | null;
};

function SendSection({ controller, organizationId, organizationName, organizationLogoUrl }: SendSectionProps) {
	const { state, updateCampaign } = controller;

	return (
		<>
			<CampaignsExecutionBlock campaign={state.campaign} updateCampaign={updateCampaign} campaignSegmentations={state.segmentations} />
			<CampaignsActionBlock
				organizationId={organizationId}
				organizationName={organizationName}
				organizationLogoUrl={organizationLogoUrl}
				campaign={state.campaign}
				updateCampaign={updateCampaign}
			/>
		</>
	);
}

function AudienceSection({ controller }: SharedSectionProps) {
	// On RFM campaigns the segmentations ARE the (read-only) trigger config, so we
	// only expose segmentation editing for the other categories — matching the wizard.
	const showSegmentations = getCategoryFromTrigger(controller.state.campaign.gatilhoTipo) !== "RFM";

	return (
		<>
			{showSegmentations ? <SegmentationsField controller={controller} /> : null}
			<CampaignsFiltersBlock
				filtros={controller.state.filtros}
				campaignSegmentations={controller.state.segmentations}
				addFilterCondition={controller.addFilterCondition}
				updateFilterCondition={controller.updateFilterCondition}
				addFilterGroup={controller.addFilterGroup}
				updateFilterGroupOperator={controller.updateFilterGroupOperator}
				removeFilterNode={controller.removeFilterNode}
			/>
		</>
	);
}

function EffectsSection({ controller }: SharedSectionProps) {
	return (
		<>
			<CampaignsCashbackGenerationBlock campaign={controller.state.campaign} updateCampaign={controller.updateCampaign} />
			<CampaignsCouponGenerationBlock campaign={controller.state.campaign} updateCampaign={controller.updateCampaign} />
		</>
	);
}

function SettingsSection({ controller, campaignId }: SharedSectionProps & { campaignId: string }) {
	const { state, updateCampaign } = controller;
	// A cota ignora o período: só lê o ledger da semana (e do dia) corrente.
	const [today] = useState(() => new Date());
	const { data: stats } = useCampaignStats({ campaignId, startDate: today, endDate: today });
	const weeklyQuota = stats?.quota.find((window) => window.tipo === "SEMANAL");
	const dailyQuota = stats?.quota.find((window) => window.tipo === "DIARIO");
	const weeklyUsage = weeklyQuota
		? {
				campaignUsed: weeklyQuota.campanha.usados,
				organizationWeeklyLimit: weeklyQuota.organizacao.limite,
				organizationDailyLimit: dailyQuota?.organizacao.limite ?? null,
			}
		: null;

	return (
		<>
			<CampaignsConversionBlock campaign={state.campaign} updateCampaign={updateCampaign} />
			<CampaignsConfigBlock campaign={state.campaign} updateCampaign={updateCampaign} weeklyUsage={weeklyUsage} />
		</>
	);
}
