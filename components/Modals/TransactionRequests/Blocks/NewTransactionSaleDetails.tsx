import NumberInput from "@/components/Inputs/NumberInput";
import { PoiBalanceUsageBar, POI_OPERATION_KINDS } from "@/components/PointOfInteraction/operation-kinds";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatCashbackValue, formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import type {
	TPointOfInteractionNewInternalTransactionRequestState,
	TUsePointOfInteractionNewInternalTransactionRequestState,
} from "@/state-hooks/use-point-of-interaction-new-internal-transaction-request";
import { BadgePercent, ShoppingCart } from "lucide-react";

type TCashbackPreset = "none" | "half" | "max";

type NewTransactionSaleDetailsProps = {
	sale: TPointOfInteractionNewInternalTransactionRequestState["sale"];
	updateSale: TUsePointOfInteractionNewInternalTransactionRequestState["updateSale"];
	updateCashback: TUsePointOfInteractionNewInternalTransactionRequestState["updateCashback"];
	/** `false` em "só pontuar": a venda não usa saldo. */
	allowCashback: boolean;
	availableCashback: number;
	maximumCashbackAllowed: number;
	/** Explica de onde vem o máximo (limite do programa), quando ele é menor que o saldo. */
	maximumCashbackReason: string | null;
	isAttemptingToUseMoreCashbackThanAllowed: boolean;
	finalValue: number;
	terminology: TCashbackProgramTerminologyEnum;
};
export function NewTransactionSaleDetails({
	sale,
	updateSale,
	updateCashback,
	allowCashback,
	availableCashback,
	maximumCashbackAllowed,
	maximumCashbackReason,
	isAttemptingToUseMoreCashbackThanAllowed,
	finalValue,
	terminology,
}: NewTransactionSaleDetailsProps) {
	const discountMeta = POI_OPERATION_KINDS.discount;
	const usedCashback = sale.cashback.aplicar ? sale.cashback.valor : 0;
	const halfCashback = Math.floor((maximumCashbackAllowed / 2) * 100) / 100;
	const activePreset: TCashbackPreset | null =
		!sale.cashback.aplicar || usedCashback === 0
			? "none"
			: usedCashback === maximumCashbackAllowed
				? "max"
				: usedCashback === halfCashback
					? "half"
					: null;

	function applyPreset(preset: TCashbackPreset) {
		if (preset === "none") return updateCashback({ aplicar: false, valor: 0 });
		const valor = preset === "max" ? maximumCashbackAllowed : halfCashback;
		updateCashback({ aplicar: valor > 0, valor });
	}

	const presets: { id: TCashbackPreset; label: string; hint: string }[] = [
		{ id: "none", label: "Nada", hint: "só pontuar" },
		{ id: "half", label: "Metade", hint: formatCashbackValue(halfCashback, terminology) },
		{ id: "max", label: "Máximo", hint: formatCashbackValue(maximumCashbackAllowed, terminology) },
	];

	return (
		<>
			<ResponsiveMenuSection title="VALOR DA TRANSAÇÃO" icon={<ShoppingCart className="h-4 min-h-4 w-4 min-w-4" />}>
				<NumberInput label="VALOR" placeholder="Valor da venda..." value={sale.valor} handleChange={(value) => updateSale({ valor: value })} />
			</ResponsiveMenuSection>

			{allowCashback ? (
				<ResponsiveMenuSection title="CASHBACK" icon={<BadgePercent className="h-4 min-h-4 w-4 min-w-4" />}>
					<div className={cn("flex flex-col gap-3 rounded-2xl border p-3.5", discountMeta.classes.surface)}>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span id="cashback-preset-label" className="text-sm font-medium tracking-tight text-foreground/80">
								QUANTO DO SALDO USAR
							</span>
							<div
								role="radiogroup"
								aria-labelledby="cashback-preset-label"
								className="grid w-full grid-cols-3 gap-1 rounded-full bg-brand-secondary/10 p-1 sm:w-80"
							>
								{presets.map((preset) => (
									<button
										key={preset.id}
										type="button"
										role="radio"
										aria-checked={activePreset === preset.id}
										disabled={preset.id !== "none" && maximumCashbackAllowed <= 0}
										onClick={() => applyPreset(preset.id)}
										className={cn(
											"flex h-9 flex-col items-center justify-center rounded-full text-xs leading-tight transition-colors disabled:opacity-50",
											activePreset === preset.id
												? "bg-brand-secondary font-semibold text-brand-secondary-foreground"
												: "text-brand-secondary hover:bg-brand-secondary/10 dark:text-blue-200",
										)}
									>
										<span>{preset.label}</span>
										<span className="text-[0.6rem] opacity-80">{preset.hint}</span>
									</button>
								))}
							</div>
						</div>
						<NumberInput
							label="VALOR DO CASHBACK"
							placeholder="Valor do cashback..."
							value={usedCashback}
							handleChange={(value) => updateCashback({ aplicar: value > 0, valor: value })}
						/>
						<div className="flex flex-col gap-1.5">
							<PoiBalanceUsageBar kind="discount" used={usedCashback} available={availableCashback} />
							<div className="flex flex-wrap justify-between gap-x-3 text-xs text-foreground/80">
								<span>
									<strong className={discountMeta.classes.amount}>{formatCashbackValue(usedCashback, terminology)}</strong> usados · máximo nesta venda{" "}
									<strong>{formatCashbackValue(maximumCashbackAllowed, terminology)}</strong>
									{maximumCashbackReason ? ` (${maximumCashbackReason})` : null}
								</span>
								<span>
									fica <strong>{formatCashbackValue(Math.max(0, availableCashback - usedCashback), terminology)}</strong>
								</span>
							</div>
							{isAttemptingToUseMoreCashbackThanAllowed ? (
								<p className="text-xs font-semibold text-red-600 dark:text-red-400">O valor informado passa do máximo permitido para esta venda.</p>
							) : null}
						</div>
					</div>
				</ResponsiveMenuSection>
			) : null}

			<div className={cn("grid gap-2", allowCashback ? "grid-cols-3" : "grid-cols-2")}>
				<div className="flex flex-col rounded-xl bg-secondary px-3 py-2">
					<span className="text-[0.65rem] text-muted-foreground">VALOR BRUTO</span>
					<span className="text-sm font-semibold">{formatToMoney(sale.valor)}</span>
				</div>
				{allowCashback ? (
					<div className={cn("flex flex-col rounded-xl border px-3 py-2", discountMeta.classes.surface)}>
						<span className={cn("text-[0.65rem]", discountMeta.classes.text)}>DESCONTO</span>
						<span className={cn("text-sm font-semibold", discountMeta.classes.amount)}>− {formatCashbackValue(usedCashback, terminology)}</span>
					</div>
				) : null}
				<div className="flex flex-col rounded-xl bg-primary px-3 py-2 text-primary-foreground">
					<span className="text-[0.65rem] opacity-80">CLIENTE PAGA</span>
					<span className="text-sm font-bold">{formatToMoney(finalValue)}</span>
				</div>
			</div>
		</>
	);
}
