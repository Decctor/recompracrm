"use client";

import type { TVisualKitBrand } from "@/lib/visual-kits/types";
import type { TVisualKitState } from "@/state-hooks/use-visual-kit-state";
import KitBuilderHeader from "./kit-builder-header";
import KitBuilderStepper from "./kit-builder-stepper";
import { KitBuilderProvider, useKitBuilder } from "./kit-builder-context";
import StagePieces from "./stages/stage-pieces";
import StagePrice from "./stages/stage-price";
import StageProducts from "./stages/stage-products";
import StageReview from "./stages/stage-review";
import StageVisual from "./stages/stage-visual";
import type { TKitStageId } from "./stages";

type KitBuilderProps = {
	kitId: string | null;
	initialState?: TVisualKitState;
	initialStage: TKitStageId;
	marca: TVisualKitBrand;
	orgHasERPAccess: boolean;
};

export default function KitBuilder({ kitId, initialState, initialStage, marca, orgHasERPAccess }: KitBuilderProps) {
	return (
		<KitBuilderProvider kitId={kitId} initialState={initialState} initialStage={initialStage} marca={marca} orgHasERPAccess={orgHasERPAccess}>
			<div className="mx-auto flex w-full flex-col gap-4 px-3 py-4 lg:px-6">
				<KitBuilderHeader />
				<KitBuilderStepper />
				<div className="rounded-xl border border-border bg-background p-3 shadow-sm lg:p-5">
					<KitBuilderStage />
				</div>
			</div>
		</KitBuilderProvider>
	);
}

function KitBuilderStage() {
	const { stage } = useKitBuilder();
	switch (stage) {
		case "pecas":
			return <StagePieces />;
		case "produtos":
			return <StageProducts />;
		case "preco":
			return <StagePrice />;
		case "visual":
			return <StageVisual />;
		case "revisao":
			return <StageReview />;
	}
}
