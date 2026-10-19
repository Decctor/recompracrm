"use client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { ArrowRightLeft, Banknote, CreditCard, Ellipsis, type LucideIcon, QrCode, Ticket, WalletCards } from "lucide-react";

// ============================================================================
// Pecas compartilhadas entre o fechamento (ClosePane) e o recebimento parcial
// (PartialPaymentPane): metodos com tile proprio e os helpers de valor (o
// seletor de caixa vive em components/CashSessions/SalesSessionPicker). Os
// quatro metodos do salao tem tile; os demais vivem em "Outro". Mesmo
// contrato do POS.
// ============================================================================

export type TMethodMeta = { label: string; tile: string; icon: LucideIcon };

export const METHOD_META: Partial<Record<TPaymentMethodEnum, TMethodMeta>> = {
	PIX: { label: "Pix", tile: "Pix", icon: QrCode },
	DINHEIRO: { label: "Dinheiro", tile: "Dinheiro", icon: Banknote },
	CARTAO_CREDITO: { label: "Cartão de crédito", tile: "Crédito", icon: CreditCard },
	CARTAO_DEBITO: { label: "Cartão de débito", tile: "Débito", icon: WalletCards },
	TRANSFERENCIA: { label: "Transferência", tile: "Transf.", icon: ArrowRightLeft },
	VALE: { label: "Vale", tile: "Vale", icon: Ticket },
	OUTRO: { label: "Outro", tile: "Outro", icon: Ellipsis },
};
export const TILE_METHODS: TPaymentMethodEnum[] = ["PIX", "DINHEIRO", "CARTAO_CREDITO", "CARTAO_DEBITO"];
export const OTHER_METHODS: TPaymentMethodEnum[] = ["TRANSFERENCIA", "VALE", "OUTRO"];

export const roundCents = (value: number) => Math.round(value * 100) / 100;
export const formatInput = (value: number) => value.toFixed(2).replace(".", ",");
export const parseInput = (raw: string) => Number.parseFloat(raw.replace(/\./g, "").replace(",", ".")) || 0;

/** Notas prováveis acima do valor: arredondamentos para 10/50/100 e as notas comuns. */
export function likelyNotes(valor: number) {
	const candidates = [Math.ceil(valor / 10) * 10, Math.ceil(valor / 50) * 50, Math.ceil(valor / 100) * 100, 50, 100, 200];
	return [...new Set(candidates)]
		.filter((note) => note > valor + 0.001)
		.sort((a, b) => a - b)
		.slice(0, 2);
}

// ----------------------------------------------------------------- Metodos

type MethodTileProps = Omit<React.ComponentProps<"button">, "children"> & { icon: LucideIcon; label: string; active: boolean };

export function MethodTile({ icon: Icon, label, active, className, ...props }: MethodTileProps) {
	return (
		<button
			type="button"
			aria-pressed={active}
			className={cn(
				"flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-xs font-bold transition-colors",
				active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary/50",
				className,
			)}
			{...props}
		>
			<Icon className="size-4 shrink-0" />
			<span className="max-w-full truncate">{label}</span>
		</button>
	);
}

/** Grade de metodos: quatro tiles do salao + "Outro" com os demais. */
export function PaymentMethodPicker({ value, onChange }: { value: TPaymentMethodEnum; onChange: (method: TPaymentMethodEnum) => void }) {
	const meta = METHOD_META[value] ?? METHOD_META.OUTRO!;
	const isOther = OTHER_METHODS.includes(value);
	return (
		<div className="grid grid-cols-5 gap-1.5">
			{TILE_METHODS.map((method) => {
				const tileMeta = METHOD_META[method]!;
				return <MethodTile key={method} icon={tileMeta.icon} label={tileMeta.tile} active={value === method} onClick={() => onChange(method)} />;
			})}
			<DropdownMenu>
				<DropdownMenuTrigger
					render={<MethodTile icon={Ellipsis} label={isOther ? meta.tile : "Outro"} active={isOther} aria-label="Outras formas de pagamento" />}
				/>
				<DropdownMenuContent align="end">
					{OTHER_METHODS.map((method) => {
						const otherMeta = METHOD_META[method]!;
						const OtherIcon = otherMeta.icon;
						return (
							<DropdownMenuItem key={method} onClick={() => onChange(method)}>
								<OtherIcon className="size-4" />
								{otherMeta.label}
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
