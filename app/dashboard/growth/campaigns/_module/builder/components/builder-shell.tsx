"use client";

import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { createCampaign } from "@/lib/mutations/campaigns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appRoutes } from "@/lib/navigation/routes";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { normalizeFiltersForSubmit } from "@/app/dashboard/growth/campaigns/_module/shared/form/utils";
import { getCategoryById, type TBuilderCategoryId } from "../helpers/categories";
import { STAGE_ORDER, type TBuilderStageId } from "../helpers/stages";
import { categoryParser, stageParser } from "../helpers/url-state";
import { validateStage } from "../helpers/validation";
import { useQueryState } from "nuqs";
import BuilderHeader from "./builder-header";
import BuilderStepper from "./builder-stepper";
import { BuilderProvider, useBuilderCampaign, useBuilderCouponDraft, useBuilderUi } from "./builder-provider";
import StageAudience from "./stages/stage-audience";
import StageEffects from "./stages/stage-effects";
import StageMessage from "./stages/stage-message";
import StageReview from "./stages/stage-review";
import StageSend from "./stages/stage-send";
import StageSettings from "./stages/stage-settings";
import StageTrigger from "./stages/stage-trigger";

type BuilderShellProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

export default function BuilderShell({ membership }: BuilderShellProps) {
	const [categoryParam] = useQueryState("category", categoryParser.withOptions({ shallow: true }));
	const [stageParam] = useQueryState("stage", stageParser.withOptions({ shallow: true }));

	const initialCategory: TBuilderCategoryId | null = categoryParam ?? null;
	const initialStage: TBuilderStageId = initialCategory ? (stageParam ?? "trigger") : "trigger";

	return (
		<BuilderProvider mode="create" initialCategory={initialCategory} initialStage={initialStage}>
			<BuilderShellContent membership={membership} />
		</BuilderProvider>
	);
}

function BuilderShellContent({ membership }: BuilderShellProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [, setCategoryParam] = useQueryState("category", categoryParser.withOptions({ shallow: true }));
	const [, setStageParam] = useQueryState("stage", stageParser.withOptions({ shallow: true }));

	const { currentStage, selectedCategory, setCurrentStage, markClean } = useBuilderUi();
	const campaignState = useBuilderCampaign();
	const { couponDraft } = useBuilderCouponDraft();
	const { state } = campaignState;

	useEffect(() => {
		setStageParam(currentStage);
	}, [currentStage, setStageParam]);

	useEffect(() => {
		setCategoryParam(selectedCategory);
	}, [selectedCategory, setCategoryParam]);

	const activeValidation = useMemo(
		() => validateStage(currentStage, state.campaign, state.segmentations),
		[currentStage, state.campaign, state.segmentations],
	);

	const { mutate: createCampaignMutation, isPending: createIsPending } = useMutation({
		mutationKey: ["create-campaign-builder"],
		mutationFn: createCampaign,
		onSuccess: async (data) => {
			markClean();
			toast.success(data.message);
			await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
		router.push(`${appRoutes.growth.campaigns()}?view=database`);
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function handleSubmit() {
		const category = getCategoryById(selectedCategory);
		if (!category || !category.triggers.includes(state.campaign.gatilhoTipo)) {
			setCurrentStage("trigger");
			toast.error("Escolha uma categoria e um gatilho para continuar.");
			return;
		}

		const invalidStage = STAGE_ORDER.map((stage) => ({
			stage,
			result: validateStage(stage, state.campaign, state.segmentations),
		})).find((item) => !item.result.valid);

		if (invalidStage) {
			setCurrentStage(invalidStage.stage);
			toast.error(invalidStage.result.reason ?? "Revise os campos obrigatórios.");
			return;
		}

		// O cupom inline não tem id até o servidor criá-lo, então a validação por estágio não
		// consegue cobri-lo — checamos aqui, antes de gastar a requisição.
		if (state.campaign.cupomGeracaoAtivo && !state.campaign.cupomGeracaoCupomId && !couponDraft) {
			setCurrentStage("effects");
			toast.error("Selecione um cupom existente ou crie um para esta campanha.");
			return;
		}
		if (couponDraft && (!couponDraft.codigo?.trim() || !couponDraft.titulo?.trim() || !couponDraft.beneficioValor)) {
			setCurrentStage("effects");
			toast.error("Preencha código, título e valor do benefício do cupom.");
			return;
		}

		createCampaignMutation({
			campaign: { ...state.campaign, filtros: normalizeFiltersForSubmit(state.filtros) },
			segmentations: state.segmentations,
			couponToCreate: couponDraft,
		});
	}

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-3 py-4 lg:px-6">
			<BuilderHeader backToUrl={`${appRoutes.growth.campaigns()}?view=database`} />
			<BuilderStepper />
			<div className="rounded-xl border border-border bg-background p-3 shadow-sm lg:p-5">
				{currentStage === "trigger" ? <StageTrigger validation={activeValidation} /> : null}
				{currentStage === "send" ? <StageSend validation={activeValidation} /> : null}
				{currentStage === "message" ? (
					<StageMessage
						organizationId={membership.organizacao.id}
						organizationName={membership.organizacao.nome}
						organizationLogoUrl={membership.organizacao.logoUrl}
						validation={activeValidation}
					/>
				) : null}
				{currentStage === "audience" ? <StageAudience validation={activeValidation} /> : null}
				{currentStage === "effects" ? <StageEffects validation={activeValidation} /> : null}
				{currentStage === "settings" ? <StageSettings validation={activeValidation} /> : null}
				{currentStage === "review" ? (
					<StageReview validation={activeValidation} finalLoading={createIsPending} onSubmit={handleSubmit} />
				) : null}
			</div>
		</div>
	);
}
