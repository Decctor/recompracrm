"use client";
import type { TGetSalesSessionsOutput } from "@/app/api/pos/sales-sessions/route";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ArrowRightLeft, Banknote, ChevronsUpDown, CreditCard, Ellipsis, type LucideIcon, QrCode, Ticket, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";

// ============================================================================
// Pecas compartilhadas entre o fechamento (ClosePane) e o recebimento parcial
// (PartialPaymentPane): metodos com tile proprio, o seletor de caixa e os
// helpers de valor. Os quatro metodos do salao tem tile; os demais vivem em
// "Outro". Mesmo contrato do POS.
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

// ------------------------------------------------------------------- Caixa

async function fetchOpenSalesSessions() {
	const { data } = await axios.get<TGetSalesSessionsOutput>("/api/pos/sales-sessions?status=ABERTA");
	return data.data.default?.sessions ?? [];
}
export type TOpenSalesSession = Awaited<ReturnType<typeof fetchOpenSalesSessions>>[number];

export function describeSession(session: TOpenSalesSession) {
	const opened = new Date(session.dataAbertura);
	const sameDay = opened.toDateString() === new Date().toDateString();
	const time = opened.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
	return {
		title: session.vendedorPadrao?.nome ? `Caixa · ${session.vendedorPadrao.nome}` : "Caixa",
		detail: `${session.politica === "VENDEDOR_UNICO" ? "Vendedor único" : "Múltiplos vendedores"} · aberto ${
			sameDay ? `às ${time}` : `em ${opened.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${time}`
		}`,
	};
}

/** Sessoes abertas + a selecionada; com uma unica sessao aberta ela e escolhida sozinha. */
export function useOpenSalesSessionSelection() {
	const [sessaoVendaId, setSessaoVendaId] = useState<string | null>(null);
	const { data: openSessions } = useQuery({ queryKey: ["open-sales-sessions"], queryFn: fetchOpenSalesSessions });
	useEffect(() => {
		if (openSessions?.length === 1) setSessaoVendaId((current) => current ?? openSessions[0].id);
	}, [openSessions]);
	const selectedSession = (openSessions ?? []).find((session) => session.id === sessaoVendaId) ?? null;
	return { openSessions: openSessions ?? [], sessaoVendaId, setSessaoVendaId, selectedSession };
}

export function SessionLine({ session }: { session: TOpenSalesSession }) {
	const { title, detail } = describeSession(session);
	return (
		<span className="flex min-w-0 items-center gap-2.5">
			<span className="size-2 shrink-0 rounded-full bg-success" aria-hidden />
			<span className="whitespace-nowrap text-sm font-bold">{title}</span>
			<span className="truncate text-xs text-muted-foreground">{detail}</span>
		</span>
	);
}

type SalesSessionPickerProps = {
	openSessions: TOpenSalesSession[];
	selectedSession: TOpenSalesSession | null;
	onSelect: (sessaoVendaId: string | null) => void;
	/** Sem caixa nao e opcao (ex.: estorno em dinheiro). */
	required?: boolean;
	label?: string;
};

export function SalesSessionPicker({
	openSessions,
	selectedSession,
	onSelect,
	required = false,
	label = "Sessão de caixa",
}: SalesSessionPickerProps) {
	if (openSessions.length === 0) return null;
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<button
							type="button"
							className="flex h-11 w-full items-center justify-between gap-2.5 rounded-xl border border-border px-3 text-left transition-colors hover:bg-secondary/40"
						>
							{selectedSession ? (
								<SessionLine session={selectedSession} />
							) : (
								<span className="flex min-w-0 items-center gap-2.5">
									<span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
									<span className="text-sm font-bold text-muted-foreground">{required ? "Escolha o caixa" : "Sem sessão de caixa"}</span>
								</span>
							)}
							<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
						</button>
					}
				/>
				<DropdownMenuContent align="start" className="w-(--anchor-width)">
					{openSessions.map((session) => (
						<DropdownMenuItem key={session.id} onClick={() => onSelect(session.id)}>
							<SessionLine session={session} />
						</DropdownMenuItem>
					))}
					{required ? null : (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => onSelect(null)}>Sem sessão de caixa</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
