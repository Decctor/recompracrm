"use client";
import type { TGetSalesSessionsOutput } from "@/app/api/pos/sales-sessions/route";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";

// Seletor do caixa que recebe (ou devolve) dinheiro fora do PDV: fechamento e parcial de conta,
// estorno de parcial e cancelamento de venda confirmada.

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
