import NumberInput from "@/components/Inputs/NumberInput";
import { getCashbackUnitLabel } from "@/lib/formatting";
import type { TUseCashbackProgramState } from "@/state-hooks/use-cashback-program-state";
import { Clock } from "lucide-react";
import CashbackProgramBlockShell from "./BlockShell";

type CashbackProgramsExpirationBlockProps = {
	cashbackProgram: TUseCashbackProgramState["state"]["cashbackProgram"];
	updateCashbackProgram: TUseCashbackProgramState["updateCashbackProgram"];
	embedded?: boolean;
};
export default function CashbackProgramsExpirationBlock({ cashbackProgram, updateCashbackProgram, embedded }: CashbackProgramsExpirationBlockProps) {
	return (
		<CashbackProgramBlockShell embedded={embedded} title="EXPIRAÇÃO" icon={<Clock className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="w-full flex flex-col gap-1">
				<NumberInput
					value={cashbackProgram.expiracaoRegraValidadeValor}
					label="VALIDADE (DIAS)"
					placeholder="Ex: 90"
					handleChange={(value) => updateCashbackProgram({ expiracaoRegraValidadeValor: value })}
				/>
				<p className="text-xs text-muted-foreground">
					Dias, contados do acúmulo, até o {getCashbackUnitLabel(cashbackProgram.terminologia, { plural: false })} expirar. Deixe 0 para não expirar.
				</p>
			</div>
		</CashbackProgramBlockShell>
	);
}
