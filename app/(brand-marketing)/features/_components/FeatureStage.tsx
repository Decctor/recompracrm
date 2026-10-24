import { cn } from "@/lib/utils";
import { ScaledMock } from "./ScaledMock";
import type { TFeatureScreen } from "./feature-showcase";
import { MOCK_WIDTH } from "./mocks/mock-parts";

/** Palco cinza-azulado onde a tela do produto se apoia, reduzida para caber em telas estreitas. */
export function FeatureStage({ screen, className }: { screen: TFeatureScreen; className?: string }) {
	return (
		<div className={cn("min-w-0 rounded-[28px] bg-[#eef2f6] p-9 max-sm:rounded-[20px] max-sm:p-4", className)}>
			<ScaledMock width={MOCK_WIDTH} label={screen.label} interactive={screen.interactive}>
				{screen.node}
			</ScaledMock>
		</div>
	);
}
