"use client";

import UnsavedChangesPrompt from "@/app/dashboard/growth/campaigns/_module/builder/components/unsaved-changes-prompt";
import { getErrorMessage } from "@/lib/errors";
import { invalidateFinanceQueries } from "@/lib/finances/invalidate-finance-queries";
import { createPurchase } from "@/lib/mutations/purchases";
import { appRoutes } from "@/lib/navigation/routes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BUILDER_STAGE_IDS, type TBuilderStageId } from "../helpers/stages";
import { buildCreatePurchaseInput } from "../helpers/submit";
import { findFirstInvalidStage } from "../helpers/validation";
import StageDelivery from "../stages/stage-delivery";
import StageFinance from "../stages/stage-finance";
import StageItems from "../stages/stage-items";
import StageOrigin from "../stages/stage-origin";
import StageReview from "../stages/stage-review";
import StageSupplier from "../stages/stage-supplier";
import BuilderHeader from "./builder-header";
import { BuilderProvider, useBuilder } from "./builder-provider";
import BuilderStepper from "./builder-stepper";
import NextStepBar from "./next-step-bar";

const stageParser = parseAsStringEnum<TBuilderStageId>([...BUILDER_STAGE_IDS]);

export default function PurchaseBuilderShell() {
	// Builder state lives only in the browser, so a reload always starts over at the origin.
	return (
		<BuilderProvider initialStage="origin">
			<PurchaseBuilderContent />
		</BuilderProvider>
	);
}

function PurchaseBuilderContent() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const builder = useBuilder();
	const { currentStage, setCurrentStage, dirty, markClean, state, lines, newSupplier, received, origin, readStatus } = builder;
	const [, setStageParam] = useQueryState("stage", stageParser.withOptions({ shallow: true }));
	const [leavePromptOpen, setLeavePromptOpen] = useState(false);
	const backToUrl = appRoutes.purchases();

	useEffect(() => {
		setStageParam(currentStage);
	}, [currentStage, setStageParam]);

	// Closing the tab or reloading would silently drop everything typed so far.
	useEffect(() => {
		if (!dirty) return;
		const handler = (event: BeforeUnloadEvent) => {
			event.preventDefault();
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [dirty]);

	const { mutate: createPurchaseMutation, isPending } = useMutation({
		mutationKey: ["create-purchase-builder"],
		mutationFn: createPurchase,
		onSuccess: async (data) => {
			markClean();
			toast.success(data.message);
			void invalidateFinanceQueries(queryClient);
			await queryClient.invalidateQueries({ queryKey: ["purchases"] });
			router.push(backToUrl);
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function handleSubmit() {
		const invalid = findFirstInvalidStage({ origin, readStatus, lines, state, received });
		if (invalid) {
			setCurrentStage(invalid.stage);
			toast.error(invalid.reason);
			return;
		}
		createPurchaseMutation(buildCreatePurchaseInput({ state, lines, newSupplier, received }));
	}

	function handleBack() {
		if (dirty) return setLeavePromptOpen(true);
		router.push(backToUrl);
	}

	return (
		<div className="flex w-full flex-col gap-4 py-4">
			<BuilderHeader onBack={handleBack} />
			<BuilderStepper />
			<NextStepBar />
			<div className="rounded-xl border border-border bg-background p-3 shadow-sm lg:p-5">
				{currentStage === "origin" ? <StageOrigin /> : null}
				{currentStage === "supplier" ? <StageSupplier /> : null}
				{currentStage === "items" ? <StageItems /> : null}
				{currentStage === "finance" ? <StageFinance /> : null}
				{currentStage === "delivery" ? <StageDelivery /> : null}
				{currentStage === "review" ? <StageReview onSubmit={handleSubmit} submitting={isPending} /> : null}
			</div>
			<UnsavedChangesPrompt
				open={leavePromptOpen}
				onCancel={() => setLeavePromptOpen(false)}
				onConfirm={() => {
					setLeavePromptOpen(false);
					markClean();
					router.push(backToUrl);
				}}
			/>
		</div>
	);
}
