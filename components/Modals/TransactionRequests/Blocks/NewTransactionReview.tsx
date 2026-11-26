import { SaleValueConfirmationInput } from "@/app/(external)/point-of-interaction/[orgId]/_shared/components/sale-value-confirmation-input";
import { POI_OPERATION_KINDS, type TPoiOperationKind } from "@/components/PointOfInteraction/operation-kinds";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatCashbackValue } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { ArrowRight, ChevronRight, CircleCheck, LockKeyhole, UserRound } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import type { ReactNode } from "react";
import type { TNewTransactionStep } from "./NewTransactionSteps";

export const OPERATOR_PASSWORD_LENGTH = 5;

const OPERATION_SUBTITLES: Record<TPoiOperationKind, { accumulates: string; noAccumulation: string }> = {
	"sale-only": { accumulates: "Registra a venda e acumula saldo", noAccumulation: "Registra a venda" },
	discount: { accumulates: "Registra a venda e usa saldo como desconto", noAccumulation: "Registra a venda e usa saldo como desconto" },
	prize: { accumulates: "Troca saldo por recompensas do catálogo", noAccumulation: "Troca saldo por recompensas do catálogo" },
	"free-form": { accumulates: "Só débito de saldo · nenhuma venda registrada", noAccumulation: "Só débito de saldo · nenhuma venda registrada" },
};

export type TNewTransactionReviewLine = {
	label: string;
	value: ReactNode;
	/** Etapa onde a linha é corrigida. */
	editStep?: TNewTransactionStep;
	emphasis?: "debit" | "total";
};

type NewTransactionReviewProps = {
	kind: TPoiOperationKind;
	programAccumulates: boolean;
	lines: TNewTransactionReviewLine[];
	balanceBefore: number;
	balanceAfter: number;
	terminology: TCashbackProgramTerminologyEnum;
	onEdit: (step: TNewTransactionStep) => void;
	requiresSaleValueConfirmation: boolean;
	operatorConfirmedSaleValue: number | null;
	onOperatorConfirmedSaleValueChange: (value: number | null) => void;
	operatorIdentifier: string;
	onOperatorIdentifierChange: (value: string) => void;
	/** "Quem fez a venda?", quando o POI coleta o vendedor. */
	sellerPicker?: ReactNode;
};
export function NewTransactionReview({
	kind,
	programAccumulates,
	lines,
	balanceBefore,
	balanceAfter,
	terminology,
	onEdit,
	requiresSaleValueConfirmation,
	operatorConfirmedSaleValue,
	onOperatorConfirmedSaleValueChange,
	operatorIdentifier,
	onOperatorIdentifierChange,
	sellerPicker,
}: NewTransactionReviewProps) {
	const meta = POI_OPERATION_KINDS[kind];
	const Icon = meta.icon;
	const subtitle = OPERATION_SUBTITLES[kind][programAccumulates ? "accumulates" : "noAccumulation"];
	const balanceChanges = balanceAfter !== balanceBefore;

	return (
		<>
			<ResponsiveMenuSection title="RESUMO" icon={<CircleCheck className="h-4 min-h-4 w-4 min-w-4" />}>
				<div className={cn("overflow-hidden rounded-2xl border", meta.classes.surface)}>
					<div className="flex items-center gap-2.5 px-3.5 py-3">
						<span className={cn("flex size-7.5 min-w-7.5 items-center justify-center rounded-lg", meta.classes.iconTile)}>
							<Icon className="size-4" />
						</span>
						<span className="flex flex-col">
							<span className={cn("text-sm font-semibold", meta.classes.title)}>{meta.label}</span>
							<span className={cn("text-xs", meta.classes.text)}>{subtitle}</span>
						</span>
					</div>
					<div className="divide-y divide-border bg-background">
						{lines.map((line) => {
							const content = (
								<>
									<span className="text-xs text-muted-foreground">{line.label}</span>
									<span
										className={cn(
											"flex min-w-0 items-center gap-1.5 text-right text-sm font-medium",
											line.emphasis === "debit" && cn("text-base font-bold", meta.classes.amount),
											line.emphasis === "total" && "text-base font-bold",
										)}
									>
										<span className="min-w-0 break-words">{line.value}</span>
										{line.editStep ? <ChevronRight className="size-3.5 min-w-3.5 text-muted-foreground" /> : null}
									</span>
								</>
							);
							return line.editStep ? (
								<button
									key={line.label}
									type="button"
									onClick={() => line.editStep && onEdit(line.editStep)}
									className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-secondary/60"
									aria-label={`Corrigir ${line.label.toLowerCase()}`}
								>
									{content}
								</button>
							) : (
								<div key={line.label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
									{content}
								</div>
							);
						})}
						{balanceChanges ? (
							<div className="flex items-center justify-between gap-3 bg-secondary/40 px-3.5 py-2.5">
								<span className="text-xs text-muted-foreground">SALDO</span>
								<span className="flex items-center gap-1.5 text-sm">
									<span className="text-muted-foreground line-through">{formatCashbackValue(balanceBefore, terminology)}</span>
									<ArrowRight className="size-3.5 text-muted-foreground" />
									<strong>{formatCashbackValue(Math.max(0, balanceAfter), terminology)}</strong>
								</span>
							</div>
						) : null}
					</div>
				</div>
			</ResponsiveMenuSection>

			{sellerPicker ? (
				<ResponsiveMenuSection title="VENDEDOR" icon={<UserRound className="h-4 min-h-4 w-4 min-w-4" />}>
					{sellerPicker}
				</ResponsiveMenuSection>
			) : null}

			<ResponsiveMenuSection title="OPERADOR" icon={<LockKeyhole className="h-4 min-h-4 w-4 min-w-4" />}>
				{requiresSaleValueConfirmation ? (
					<SaleValueConfirmationInput value={operatorConfirmedSaleValue} onChange={onOperatorConfirmedSaleValueChange} compact />
				) : null}
				<label htmlFor="new-transaction-operator-password" className="text-sm font-medium tracking-tight text-foreground/80">
					SENHA DO OPERADOR ({OPERATOR_PASSWORD_LENGTH} DÍGITOS)<span className="text-red-500">*</span>
				</label>
				<InputOTP
					id="new-transaction-operator-password"
					maxLength={OPERATOR_PASSWORD_LENGTH}
					pattern={REGEXP_ONLY_DIGITS}
					inputMode="numeric"
					autoComplete="off"
					pushPasswordManagerStrategy="none"
					value={operatorIdentifier}
					onChange={onOperatorIdentifierChange}
					containerClassName="w-full max-w-full justify-center"
				>
					<InputOTPGroup>
						{Array.from({ length: OPERATOR_PASSWORD_LENGTH }, (_, index) => (
							<InputOTPSlot key={index} index={index} />
						))}
					</InputOTPGroup>
				</InputOTP>
			</ResponsiveMenuSection>
		</>
	);
}
