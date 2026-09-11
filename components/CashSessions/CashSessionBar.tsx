"use client";

import type { TGetSalesSessionsOutputDefault } from "@/app/api/pos/sales-sessions/route";
import SelectInput from "@/components/Inputs/SelectInput";
import CloseSalesSession from "@/components/Modals/Internal/SalesSessions/CloseSalesSession";
import OpenSalesSession from "@/components/Modals/Internal/SalesSessions/OpenSalesSession";
import RegisterMovement from "@/components/Modals/Internal/SalesSessions/RegisterMovement";
import { Button } from "@/components/ui/button";
import { formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { ArrowRightLeft, LockKeyhole, Wallet } from "lucide-react";
import { useState } from "react";

type Session = TGetSalesSessionsOutputDefault["sessions"][number];
type Props = {
	session: Session | null;
	sessions: Session[];
	activeSessionId: string | null;
	onSessionChange: (id: string | null) => void;
	isLoading: boolean;
	requireOpeningFloat: boolean;
	blindCount: boolean;
	className?: string;
	// Card compacto para viver dentro do checkout (coluna de 420px / Sheet do mobile): mesmas
	// ações da barra, empilhadas em duas linhas em vez de espalhadas pela largura da página.
	compact?: boolean;
};
type ActiveModal = "open" | "movement" | "close" | null;

function useCashSessionModals({ session, requireOpeningFloat, blindCount }: Pick<Props, "session" | "requireOpeningFloat" | "blindCount">) {
	const [modal, setModal] = useState<ActiveModal>(null);
	const modals = (
		<>
			{modal === "open" ? <OpenSalesSession closeModal={() => setModal(null)} requireOpeningFloat={requireOpeningFloat} /> : null}
			{modal === "movement" && session ? <RegisterMovement sessionId={session.id} closeModal={() => setModal(null)} /> : null}
			{modal === "close" && session ? <CloseSalesSession sessionId={session.id} closeModal={() => setModal(null)} blindCount={blindCount} /> : null}
		</>
	);
	return { setModal, modals };
}

function getSessionSelectOptions(sessions: Session[]) {
	return sessions.map((item) => ({
		id: item.id,
		value: item.id,
		label: `${item.id.slice(0, 6)}${item.vendedorPadrao?.nome ? ` - ${item.vendedorPadrao.nome}` : ""}`,
	}));
}

function CompactCashSessionCard({
	session,
	sessions,
	activeSessionId,
	onSessionChange,
	isLoading,
	requireOpeningFloat,
	blindCount,
	className,
}: Props) {
	const { setModal, modals } = useCashSessionModals({ session, requireOpeningFloat, blindCount });
	return (
		<div
			className={cn(
				"flex w-full flex-col gap-2 rounded-lg border px-2.5 py-2",
				session ? "border-primary/25 bg-primary/[0.06]" : "border-border bg-muted/40",
				className,
			)}
		>
			<div className="flex min-w-0 items-start gap-2.5">
				<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
					<Wallet className="h-4 w-4" />
				</span>
				{isLoading ? (
					<span className="self-center text-sm text-muted-foreground">Verificando caixas...</span>
				) : session ? (
					<div className="flex min-w-0 flex-col leading-tight">
						<span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-primary">
							<span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
							Caixa aberto
						</span>
						<span className="truncate text-[11px] text-muted-foreground">
							{session.vendedorPadrao?.nome ?? (session.politica === "VENDEDOR_UNICO" ? "Vendedor único" : "Múltiplos vendedores")} · desde{" "}
							{dayjs(session.dataAbertura).format("HH:mm")} · fundo {formatToMoney(session.saldoInicial)}
						</span>
					</div>
				) : (
					<div className="flex min-w-0 flex-col leading-tight">
						<span className="text-xs font-extrabold uppercase tracking-wide">Selecione ou abra um caixa</span>
						<span className="text-[11px] text-muted-foreground">A venda usa a sessão escolhida explicitamente.</span>
					</div>
				)}
			</div>
			{sessions.length > 1 ? (
				<SelectInput
					label="CAIXA"
					showLabel={false}
					value={activeSessionId}
					options={getSessionSelectOptions(sessions)}
					handleChange={onSessionChange}
					resetOptionLabel="Selecione o caixa"
					onReset={() => onSessionChange(null)}
				/>
			) : null}
			<div className="flex flex-wrap items-center justify-end gap-1.5">
				{session ? (
					<>
						<Button variant="outline" size="xs" onClick={() => setModal("movement")} className="gap-1 bg-card">
							<ArrowRightLeft className="h-3.5 w-3.5" />
							MOVIMENTO
						</Button>
						<Button variant="outline" size="xs" onClick={() => setModal("close")} className="gap-1 bg-card">
							<LockKeyhole className="h-3.5 w-3.5" />
							FECHAR
						</Button>
						<Button variant="ghost" size="xs" onClick={() => setModal("open")} aria-label="Abrir outro caixa" title="Abrir outro caixa">
							<Wallet className="h-3.5 w-3.5" />
						</Button>
					</>
				) : (
					<Button size="xs" onClick={() => setModal("open")} className="gap-1">
						<Wallet className="h-3.5 w-3.5" />
						ABRIR CAIXA
					</Button>
				)}
			</div>
			{modals}
		</div>
	);
}

export default function CashSessionBar(props: Props) {
	if (props.compact) return <CompactCashSessionCard {...props} />;
	return <FullCashSessionBar {...props} />;
}

function FullCashSessionBar({ session, sessions, activeSessionId, onSessionChange, isLoading, requireOpeningFloat, blindCount, className }: Props) {
	const { setModal, modals } = useCashSessionModals({ session, requireOpeningFloat, blindCount });
	return (
		<div
			className={cn(
				"flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5",
				session ? "border-primary/25 bg-primary/[0.06]" : "border-border bg-muted/40",
				className,
			)}
		>
			<div className="flex min-w-0 items-center gap-2.5">
				<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
					<Wallet className="h-4 w-4" />
				</span>
				{isLoading ? (
					<span className="text-sm text-muted-foreground">Verificando caixas...</span>
				) : session ? (
					<div className="flex min-w-0 flex-col leading-tight">
						<span className="truncate font-bold text-sm">
							CAIXA ABERTO{" "}
							<span className="font-medium text-muted-foreground">
								- {session.politica === "VENDEDOR_UNICO" ? "VENDEDOR ÚNICO" : "MÚLTIPLOS VENDEDORES"}
								{session.vendedorPadrao?.nome ? ` - ${session.vendedorPadrao.nome}` : ""}
							</span>
						</span>
						<span className="text-[11px] text-muted-foreground">
							Desde {dayjs(session.dataAbertura).format("DD/MM HH:mm")} - Fundo {formatToMoney(session.saldoInicial)}
						</span>
					</div>
				) : (
					<div className="flex flex-col leading-tight">
						<span className="font-bold text-sm">SELECIONE OU ABRA UM CAIXA</span>
						<span className="text-[11px] text-muted-foreground">A venda usa a sessão escolhida explicitamente.</span>
					</div>
				)}
			</div>
			<div className="flex items-center gap-2">
				{sessions.length > 1 ? (
					<div className="w-52">
						<SelectInput
							label="CAIXA"
							showLabel={false}
							value={activeSessionId}
							options={getSessionSelectOptions(sessions)}
							handleChange={onSessionChange}
							resetOptionLabel="Selecione o caixa"
							onReset={() => onSessionChange(null)}
						/>
					</div>
				) : null}
				{session ? (
					<>
						<Button variant="ghost" size="sm" onClick={() => setModal("movement")} className="gap-1.5">
							<ArrowRightLeft className="h-4 w-4" />
							MOVIMENTO
						</Button>
						<Button variant="outline" size="sm" onClick={() => setModal("close")} className="gap-1.5">
							<LockKeyhole className="h-4 w-4" />
							FECHAR CAIXA
						</Button>
					</>
				) : null}
				<Button size="sm" variant={session ? "ghost" : "default"} onClick={() => setModal("open")} className="gap-1.5">
					<Wallet className="h-4 w-4" />
					ABRIR CAIXA
				</Button>
			</div>
			{modals}
		</div>
	);
}
