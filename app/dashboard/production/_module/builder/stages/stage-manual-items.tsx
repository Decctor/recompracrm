"use client";

import { ProductionInputsBlock, ProductionOutputsBlock } from "@/components/Modals/Productions/Blocks/ProductionItems";
import { useBuilder } from "../components/builder-provider";
import { BuilderCard } from "../components/builder-ui";

/** Produção sem receita: o mesmo editor livre de entradas e saídas do formulário de produção. */
export default function StageManualItems() {
	const { manual } = useBuilder();
	const {
		state,
		addProductionInput,
		updateProductionInput,
		removeProductionInput,
		addProductionOutput,
		updateProductionOutput,
		removeProductionOutput,
	} = manual;

	return (
		<div className="flex flex-col gap-3.5">
			<BuilderCard>
				<ProductionInputsBlock
					productionInputs={state.productionInputs}
					addProductionInput={addProductionInput}
					updateProductionInput={updateProductionInput}
					removeProductionInput={removeProductionInput}
				/>
			</BuilderCard>
			<BuilderCard>
				<ProductionOutputsBlock
					productionOutputs={state.productionOutputs}
					addProductionOutput={addProductionOutput}
					updateProductionOutput={updateProductionOutput}
					removeProductionOutput={removeProductionOutput}
				/>
			</BuilderCard>
		</div>
	);
}
