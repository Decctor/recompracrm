import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TUseCashbackProgramState } from "@/state-hooks/use-cashback-program-state";
import { CashbackProgramAccumulationTypeOptions } from "@/utils/select-options";
import { LayoutGrid, PiggyBank } from "lucide-react";

type CashbackProgramsAccumulationBlockProps = {
	userOrgHasIntegration: boolean;
	cashbackProgram: TUseCashbackProgramState["state"]["cashbackProgram"];
	updateCashbackProgram: TUseCashbackProgramState["updateCashbackProgram"];
};
export default function CashbackProgramsAccumulationBlock({
	userOrgHasIntegration,
	cashbackProgram,
	updateCashbackProgram,
}: CashbackProgramsAccumulationBlockProps) {
	return (
		<ResponsiveMenuSection title="ACUMULAÇÃO" icon={<PiggyBank className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full flex items-center justify-center gap-2">
				<div className="w-full lg:w-1/3">
					<SelectInput
						value={cashbackProgram.acumuloTipo}
						label="TIPO DE ACUMULAÇÃO"
						resetOptionLabel="NÃO DEFINIDO"
						handleChange={(value) => updateCashbackProgram({ acumuloTipo: value as TUseCashbackProgramState["state"]["cashbackProgram"]["acumuloTipo"] })}
						options={CashbackProgramAccumulationTypeOptions}
						onReset={() => updateCashbackProgram({ acumuloTipo: "FIXO" })}
						width="100%"
					/>
				</div>
				<div className="w-full lg:w-1/3">
					<NumberInput
						value={cashbackProgram.acumuloValor}
						label="VALOR DE ACUMULAÇÃO"
						placeholder="Preencha aqui o valor de acumulação..."
						handleChange={(value) => updateCashbackProgram({ acumuloValor: value })}
						width="100%"
					/>
				</div>
				<div className="w-full lg:w-1/3">
					<NumberInput
						value={cashbackProgram.acumuloValorParceiro}
						label="VALOR DE ACÚMULO PARCEIRO"
						placeholder="Preencha aqui o valor de acúmulo do parceiro..."
						handleChange={(value) => updateCashbackProgram({ acumuloValorParceiro: value })}
						width="100%"
					/>
				</div>
			</div>
			<div className="w-full flex flex-col gap-1">
				<p className="text-sm font-medium text-muted-foreground">
					Define abaixo, se aplicável, um valor mínimo de compra para que o cliente acumule pontos.
				</p>
				<NumberInput
					value={cashbackProgram.acumuloRegraValorMinimo}
					label="VALOR MÍNIMO P/ ACÚMULO"
					placeholder="Preencha aqui o valor mínimo para o acúmulo..."
					handleChange={(value) => updateCashbackProgram({ acumuloRegraValorMinimo: value })}
					width="100%"
				/>
			</div>
			{userOrgHasIntegration ? (
				<div className="w-full flex flex-col gap-1">
					<p className="text-sm font-medium text-muted-foreground">Define abaixo o mecanismo aplicável de acúmulo de pontos.</p>
					<div className="w-full flex flex-col items-center gap-2 lg:flex-row">
						<div className="w-full lg:w-1/2">
							<CheckboxInput
								labelTrue="ACUMULAR AUTOMÁTICO VIA INTEGRAÇÃO"
								labelFalse="ACUMULAR AUTOMÁTICO VIA INTEGRAÇÃO"
								checked={cashbackProgram.acumuloPermitirViaIntegracao}
								handleChange={(value) => updateCashbackProgram({ acumuloPermitirViaIntegracao: value, acumuloPermitirViaPontoIntegracao: !value })}
							/>
						</div>
						<div className="w-full lg:w-1/2">
							<CheckboxInput
								labelTrue="ACUMULAR VIA PONTO DE INTEGRAÇÃO"
								labelFalse="ACUMULAR VIA PONTO DE INTEGRAÇÃO"
								checked={cashbackProgram.acumuloPermitirViaPontoIntegracao}
								handleChange={(value) => updateCashbackProgram({ acumuloPermitirViaPontoIntegracao: value, acumuloPermitirViaIntegracao: !value })}
							/>
						</div>
					</div>
				</div>
			) : null}
		</ResponsiveMenuSection>
	);
}
