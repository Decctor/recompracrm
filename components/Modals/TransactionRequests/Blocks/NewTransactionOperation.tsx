import { POI_OPERATION_KINDS, type TPoiOperationKind } from "@/components/PointOfInteraction/operation-kinds";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatCashbackValue, formatNameAsInitials, formatToPhone } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { TCashbackProgramTerminologyEnum } from "@/schemas/enums";
import { Check, LockKeyhole, ShoppingCart } from "lucide-react";

export type TNewTransactionOperationOption = {
	kind: TPoiOperationKind;
	description: string;
	/** Por que a operação não está disponível para este cliente; `null` quando está. */
	unavailableReason: string | null;
};

export const NEW_TRANSACTION_OPERATION_ORDER: TPoiOperationKind[] = ["sale-only", "discount", "prize", "free-form"];

type NewTransactionOperationProps = {
	clientName: string;
	clientPhone: string;
	availableCashback: number;
	terminology: TCashbackProgramTerminologyEnum;
	options: TNewTransactionOperationOption[];
	selected: TPoiOperationKind | null;
	onSelect: (kind: TPoiOperationKind) => void;
	onChangeClient: () => void;
};
export function NewTransactionOperation({
	clientName,
	clientPhone,
	availableCashback,
	terminology,
	options,
	selected,
	onSelect,
	onChangeClient,
}: NewTransactionOperationProps) {
	return (
		<div className="flex flex-col gap-4">
			<NewTransactionClientStrip
				clientName={clientName}
				clientPhone={clientPhone}
				availableCashback={availableCashback}
				terminology={terminology}
				onChangeClient={onChangeClient}
			/>
			<ResponsiveMenuSection title="OPERAÇÃO" icon={<ShoppingCart className="h-4 min-h-4 w-4 min-w-4" />}>
				<div role="radiogroup" aria-label="Operação" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
					{options.map((option) => {
						const meta = POI_OPERATION_KINDS[option.kind];
						const Icon = meta.icon;
						const isSelected = selected === option.kind;
						const isUnavailable = option.unavailableReason !== null;
						return (
							<button
								key={option.kind}
								type="button"
								role="radio"
								aria-checked={isSelected}
								disabled={isUnavailable}
								onClick={() => onSelect(option.kind)}
								className={cn(
									"relative flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all outline-none focus-visible:ring-4 focus-visible:ring-ring/30",
									isUnavailable
										? "cursor-not-allowed border-dashed border-border bg-secondary/40"
										: cn("cursor-pointer hover:shadow-sm", meta.classes.surface),
									isSelected && cn("bg-background", meta.classes.selected),
								)}
							>
								{isSelected ? (
									<span className={cn("absolute top-3 right-3 flex size-5 items-center justify-center rounded-full", meta.classes.iconTile)}>
										<Check className="size-3" strokeWidth={3} />
									</span>
								) : null}
								<span
									className={cn(
										"flex size-9.5 min-w-9.5 items-center justify-center rounded-xl",
										isUnavailable ? "bg-muted text-muted-foreground" : meta.classes.iconTile,
									)}
								>
									{isUnavailable ? <LockKeyhole className="size-4.5" /> : <Icon className="size-5" />}
								</span>
								<span className="flex min-w-0 flex-col gap-1 pr-5">
									<span className={cn("text-[0.95rem] font-semibold", isUnavailable ? "text-foreground/70" : meta.classes.title)}>{meta.label}</span>
									<span className={cn("text-xs leading-snug", isUnavailable ? "text-muted-foreground" : meta.classes.text)}>
										{option.unavailableReason ?? option.description}
									</span>
									{!isUnavailable ? (
										<span className={cn("w-fit rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold", meta.classes.badge)}>{meta.balanceEffect}</span>
									) : null}
								</span>
							</button>
						);
					})}
				</div>
			</ResponsiveMenuSection>
		</div>
	);
}

type NewTransactionClientStripProps = {
	clientName: string;
	clientPhone: string;
	availableCashback: number;
	terminology: TCashbackProgramTerminologyEnum;
	onChangeClient?: () => void;
};
/** Lembrete do cliente escolhido na etapa 1, com o saldo — visível nas etapas seguintes. */
export function NewTransactionClientStrip({
	clientName,
	clientPhone,
	availableCashback,
	terminology,
	onChangeClient,
}: NewTransactionClientStripProps) {
	return (
		<div className="flex items-center gap-3 rounded-full bg-secondary py-1.5 pr-1.5 pl-2">
			<span className="flex size-7.5 min-w-7.5 items-center justify-center rounded-full bg-primary text-[0.65rem] font-bold text-brand">
				{formatNameAsInitials(clientName || "?")}
			</span>
			<span className="min-w-0 flex-1 truncate text-sm">
				<span className="font-semibold">{clientName || "Cliente"}</span>
				<span className="text-muted-foreground"> · {formatToPhone(clientPhone)}</span>
			</span>
			<span className="hidden text-xs text-muted-foreground sm:inline">
				Saldo <strong className="text-foreground">{formatCashbackValue(availableCashback, terminology)}</strong>
			</span>
			{onChangeClient ? (
				<button
					type="button"
					onClick={onChangeClient}
					className="h-7 rounded-full border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
				>
					Trocar
				</button>
			) : null}
		</div>
	);
}
