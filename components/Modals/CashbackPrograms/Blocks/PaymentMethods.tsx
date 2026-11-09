import CheckboxInput from "@/components/Inputs/CheckboxInput";
import SelectInput from "@/components/Inputs/SelectInput";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_CASHBACK_PAYMENT_ACCRUAL_RULE } from "@/lib/cashback/payment-accrual";
import { getCashbackUnitLabel } from "@/lib/formatting";
import { PAYMENT_METHOD_ICONS } from "@/lib/payments/icons";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments/labels";
import type { TCashbackPaymentAccrualRule } from "@/schemas/cashback-programs";
import { CashbackAccrualPaymentMethodEnum, type TCashbackAccrualMomentEnum, type TCashbackAccrualPaymentMethodEnum } from "@/schemas/enums";
import type { TUseCashbackProgramState } from "@/state-hooks/use-cashback-program-state";
import { Wallet } from "lucide-react";
import CashbackProgramBlockShell from "./BlockShell";

const MOMENT_OPTIONS: { id: TCashbackAccrualMomentEnum; value: TCashbackAccrualMomentEnum; label: string }[] = [
	{ id: "NA_VENDA", value: "NA_VENDA", label: "NA VENDA" },
	{ id: "NA_QUITACAO", value: "NA_QUITACAO", label: "NA QUITAÇÃO" },
];

type CashbackProgramsPaymentMethodsBlockProps = {
	cashbackProgram: TUseCashbackProgramState["state"]["cashbackProgram"];
	updateCashbackProgram: TUseCashbackProgramState["updateCashbackProgram"];
	embedded?: boolean;
};

/**
 * Regras de acúmulo por forma de pagamento (lib/cashback/payment-accrual.ts). Desligado = `null`:
 * cada caminho de acúmulo segue o comportamento anterior às regras. Ligado, toda forma tem uma
 * linha, gravada explicitamente, para o mapa no banco ser lido sem depender de default.
 */
export default function CashbackProgramsPaymentMethodsBlock({ cashbackProgram, updateCashbackProgram, embedded }: CashbackProgramsPaymentMethodsBlockProps) {
	const rules = cashbackProgram.acumuloRegrasPagamento ?? null;
	const enabled = rules !== null;
	const unitLabel = getCashbackUnitLabel(cashbackProgram.terminologia);

	function setEnabled(value: boolean) {
		if (!value) return updateCashbackProgram({ acumuloRegrasPagamento: null });
		updateCashbackProgram({
			acumuloRegrasPagamento: Object.fromEntries(
				CashbackAccrualPaymentMethodEnum.options.map((metodo) => [metodo, { ...DEFAULT_CASHBACK_PAYMENT_ACCRUAL_RULE }]),
			),
		});
	}

	function updateRule(metodo: TCashbackAccrualPaymentMethodEnum, changes: Partial<TCashbackPaymentAccrualRule>) {
		const current = rules?.[metodo] ?? DEFAULT_CASHBACK_PAYMENT_ACCRUAL_RULE;
		updateCashbackProgram({ acumuloRegrasPagamento: { ...rules, [metodo]: { ...current, ...changes } } });
	}

	return (
		<CashbackProgramBlockShell embedded={embedded} title="FORMAS DE PAGAMENTO" icon={<Wallet className="h-4 min-h-4 w-4 min-w-4" />}>
			<p className="text-sm font-medium text-muted-foreground">
				Define quais formas de pagamento geram {unitLabel} e quando: na venda, ou só quando o pagamento for quitado (útil para fiado e convênio).
				Numa venda paga em mais de uma forma, só a parte paga nas formas que pontuam vira {unitLabel}.
			</p>
			<CheckboxInput
				labelTrue="USAR REGRAS POR FORMA DE PAGAMENTO"
				labelFalse="USAR REGRAS POR FORMA DE PAGAMENTO"
				checked={enabled}
				handleChange={setEnabled}
			/>
			{enabled ? (
				<div className="flex w-full flex-col divide-y divide-primary/10 rounded-lg border border-primary/10">
					{CashbackAccrualPaymentMethodEnum.options.map((metodo) => {
						const rule = rules?.[metodo] ?? DEFAULT_CASHBACK_PAYMENT_ACCRUAL_RULE;
						const Icon = PAYMENT_METHOD_ICONS[metodo];
						return (
							<div key={metodo} className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
								<div className="flex min-w-36 grow items-center gap-2">
									<Icon className="h-4 w-4 min-w-4 text-muted-foreground" />
									<span className="text-sm font-medium">{PAYMENT_METHOD_LABELS[metodo]}</span>
								</div>
								<label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
									<Switch checked={rule.pontua} onCheckedChange={(value) => updateRule(metodo, { pontua: value })} aria-label={`${PAYMENT_METHOD_LABELS[metodo]} pontua`} />
									{rule.pontua ? "PONTUA" : "NÃO PONTUA"}
								</label>
								<div className="w-36">
									<SelectInput
										label={`Quando ${PAYMENT_METHOD_LABELS[metodo]} pontua`}
										showLabel={false}
										value={rule.momento}
										editable={rule.pontua}
										resetOptionLabel="NA VENDA"
										options={MOMENT_OPTIONS}
										handleChange={(value) => updateRule(metodo, { momento: value as TCashbackAccrualMomentEnum })}
										onReset={() => updateRule(metodo, { momento: "NA_VENDA" })}
									/>
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<p className="text-xs text-muted-foreground">Sem regras, toda venda pontua como hoje.</p>
			)}
			{enabled ? (
				<p className="text-xs text-muted-foreground">
					Integrações que não informam pagamentos continuam pontuando o total da venda, na data da venda. Quando a integração não informa a quitação,
					“na quitação” vale como “na venda”.
				</p>
			) : null}
		</CashbackProgramBlockShell>
	);
}
