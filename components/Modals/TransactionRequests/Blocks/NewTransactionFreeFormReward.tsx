import NumberInput from "@/components/Inputs/NumberInput";
import TextInput from "@/components/Inputs/TextInput";
import { PoiBalanceUsageBar, POI_OPERATION_KINDS } from "@/components/PointOfInteraction/operation-kinds";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatCashbackValue, getCashbackUnitLabel } from "@/lib/formatting";
import { FREE_FORM_REWARD_DESCRIPTION_MAX_LENGTH } from "@/lib/point-of-interaction/free-form-reward";
import { cn } from "@/lib/utils";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import type {
	TPointOfInteractionNewInternalTransactionRequestState,
	TUsePointOfInteractionNewInternalTransactionRequestState,
} from "@/state-hooks/use-point-of-interaction-new-internal-transaction-request";
import { AlertTriangle, PenLine, Wallet } from "lucide-react";

// Tolerância de ponto flutuante ao comparar o débito com o saldo.
const BALANCE_EPSILON = 0.0001;

type NewTransactionFreeFormRewardProps = {
	freeFormReward: TPointOfInteractionNewInternalTransactionRequestState["sale"]["freeFormReward"];
	updateFreeFormReward: TUsePointOfInteractionNewInternalTransactionRequestState["updateFreeFormReward"];
	availableCashback: number;
	terminology: TCashbackProgramTerminologyEnum;
};
/**
 * Recompensa avulsa no painel: o prêmio não está no catálogo, então o operador descreve o que o
 * cliente leva e quanto debitar. Não gera venda nem acúmulo, e o limite de resgate do programa
 * (que é do desconto em venda) não se aplica — o teto é o saldo.
 */
export function NewTransactionFreeFormReward({
	freeFormReward,
	updateFreeFormReward,
	availableCashback,
	terminology,
}: NewTransactionFreeFormRewardProps) {
	const meta = POI_OPERATION_KINDS["free-form"];
	const debit = freeFormReward.valor ?? 0;
	const remaining = availableCashback - debit;
	const exceedsBalance = remaining < -BALANCE_EPSILON;

	return (
		<>
			<ResponsiveMenuSection title="RECOMPENSA AVULSA" icon={<PenLine className="h-4 min-h-4 w-4 min-w-4" />}>
				<p className="text-xs text-muted-foreground">Para o que não está no catálogo. Não gera venda nem acúmulo: só debita o saldo.</p>
				<div className="flex flex-col gap-1">
					<TextInput
						label="RECOMPENSA"
						required
						placeholder="Ex: Kit churrasco"
						maxLength={FREE_FORM_REWARD_DESCRIPTION_MAX_LENGTH}
						value={freeFormReward.descricao}
						handleChange={(value) => updateFreeFormReward({ descricao: value })}
					/>
					<div className="flex justify-between gap-3 text-xs text-muted-foreground">
						<span>Aparece no extrato do cliente. Escreva como ele reconheceria.</span>
						<span className="tabular-nums">
							{freeFormReward.descricao.length}/{FREE_FORM_REWARD_DESCRIPTION_MAX_LENGTH}
						</span>
					</div>
				</div>
			</ResponsiveMenuSection>

			<ResponsiveMenuSection title="DÉBITO DO SALDO" icon={<Wallet className="h-4 min-h-4 w-4 min-w-4" />}>
				<div
					className={cn(
						"flex flex-col gap-3 rounded-2xl border p-3.5",
						exceedsBalance ? "border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30" : meta.classes.surface,
					)}
				>
					<NumberInput
						label={`VALOR A DEBITAR (${getCashbackUnitLabel(terminology, { uppercase: true })})`}
						required
						placeholder={terminology === "PONTOS" ? "Ex: 500" : "Ex: 25,00"}
						value={freeFormReward.valor}
						handleChange={(value) => updateFreeFormReward({ valor: value > 0 ? value : null })}
					/>
					<div className="flex flex-col gap-1.5">
						<PoiBalanceUsageBar kind="free-form" used={debit} available={availableCashback} />
						<div className="flex flex-wrap justify-between gap-x-3 text-xs text-foreground/80">
							<span>
								<strong className={meta.classes.amount}>{formatCashbackValue(debit, terminology)}</strong> debitados · o teto é o saldo
							</span>
							<span>
								fica <strong>{formatCashbackValue(Math.max(0, remaining), terminology)}</strong>
							</span>
						</div>
					</div>
					{exceedsBalance ? (
						<p role="alert" className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-400">
							<AlertTriangle className="size-4 min-w-4" />
							Faltam {formatCashbackValue(Math.abs(remaining), terminology)} de saldo: o cliente tem {formatCashbackValue(availableCashback, terminology)}.
						</p>
					) : null}
				</div>
			</ResponsiveMenuSection>
		</>
	);
}
