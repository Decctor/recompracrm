import CheckboxInput from "@/components/Inputs/CheckboxInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import { getCashbackUnitLabel } from "@/lib/formatting";
import type { TUseCashbackProgramState } from "@/state-hooks/use-cashback-program-state";
import { CashbackProgramRedemptionLimitTypeOptions } from "@/utils/select-options";
import { Percent } from "lucide-react";
import CashbackProgramBlockShell from "./BlockShell";

type CashbackProgramsRedemptionBlockProps = {
	cashbackProgram: TUseCashbackProgramState["state"]["cashbackProgram"];
	updateCashbackProgram: TUseCashbackProgramState["updateCashbackProgram"];
	embedded?: boolean;
};

/**
 * As duas formas de gastar o saldo: desconto na compra (com o teto por compra, que só existe para
 * ela) e troca por recompensas. O teto mora aqui, e não num bloco próprio, porque sem a modalidade
 * de desconto ele não significa nada.
 */
export default function CashbackProgramsRedemptionBlock({ cashbackProgram, updateCashbackProgram, embedded }: CashbackProgramsRedemptionBlockProps) {
	const unitLabel = getCashbackUnitLabel(cashbackProgram.terminologia);
	const limitHint =
		cashbackProgram.resgateLimiteTipo === "PERCENTUAL"
			? `O desconto em ${unitLabel} cobre no máximo essa porcentagem do valor da compra.`
			: cashbackProgram.resgateLimiteTipo === "FIXO"
				? `O desconto em ${unitLabel} numa mesma compra não passa desse valor.`
				: "Sem limite: o cliente pode usar todo o saldo numa compra.";

	return (
		<CashbackProgramBlockShell embedded={embedded} title="RESGATE" icon={<Percent className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full flex flex-col gap-2">
				<CheckboxInput
					checked={cashbackProgram.modalidadeDescontosPermitida}
					labelTrue="PERMITIR DESCONTO NA COMPRA"
					labelFalse="PERMITIR DESCONTO NA COMPRA"
					handleChange={(value) => updateCashbackProgram({ modalidadeDescontosPermitida: value })}
				/>
				{cashbackProgram.modalidadeDescontosPermitida ? (
					<div className="w-full flex flex-col gap-1">
						<div className="w-full flex flex-col items-start gap-2 sm:flex-row">
							<div className="w-full sm:w-1/2">
								<SelectInput
									value={cashbackProgram.resgateLimiteTipo}
									label="LIMITE POR COMPRA"
									resetOptionLabel="SEM LIMITE"
									handleChange={(value) =>
										updateCashbackProgram({ resgateLimiteTipo: value as TUseCashbackProgramState["state"]["cashbackProgram"]["resgateLimiteTipo"] })
									}
									options={CashbackProgramRedemptionLimitTypeOptions}
									onReset={() => updateCashbackProgram({ resgateLimiteTipo: null, resgateLimiteValor: null })}
								/>
							</div>
							{cashbackProgram.resgateLimiteTipo ? (
								<div className="w-full sm:w-1/2">
									<NumberInput
										value={cashbackProgram.resgateLimiteValor ?? 0}
										label={
											cashbackProgram.resgateLimiteTipo === "PERCENTUAL"
												? "LIMITE (% DA COMPRA)"
												: `LIMITE (${getCashbackUnitLabel(cashbackProgram.terminologia, { uppercase: true })})`
										}
										placeholder={cashbackProgram.resgateLimiteTipo === "PERCENTUAL" ? "Ex: 50" : "Ex: 100"}
										handleChange={(value) => updateCashbackProgram({ resgateLimiteValor: value })}
									/>
								</div>
							) : null}
						</div>
						<p className="text-xs text-muted-foreground">{limitHint}</p>
					</div>
				) : null}
			</div>
			<div className="w-full flex flex-col gap-1">
				<CheckboxInput
					checked={cashbackProgram.modalidadeRecompensasPermitida}
					labelTrue="PERMITIR TROCA POR RECOMPENSAS"
					labelFalse="PERMITIR TROCA POR RECOMPENSAS"
					handleChange={(value) => updateCashbackProgram({ modalidadeRecompensasPermitida: value })}
				/>
				<p className="text-xs text-muted-foreground">Produtos que o cliente leva trocando {unitLabel}. São cadastrados na aba Recompensas.</p>
			</div>
		</CashbackProgramBlockShell>
	);
}
