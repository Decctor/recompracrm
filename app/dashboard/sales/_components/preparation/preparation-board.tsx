"use client";
import type { TPreparationTicket } from "@/app/api/sales/preparation/route";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { createManualPrintJob } from "@/lib/mutations/desktop-agent";
import { updateTabOrderStatus } from "@/lib/mutations/tabs";
import { organizationHasPrinterForFinalidade, useAgentPrinters } from "@/lib/queries/desktop-agent";
import { usePreparationTickets } from "@/lib/queries/tabs";
import { cn } from "@/lib/utils";
import type { TSaleAttendanceStatusEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Bike, CheckCheck, ChefHat, Clock, MapPin, NotebookPen, Package, Play, Printer, ShoppingBag, UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

// ============================================================================
// PREPARO — board unificado de tickets em preparacao (o "KDS").
// Dono do trecho EM_PREPARO -> PRONTO. Duas fontes, um grao de ticket:
// vendas confirmadas com preparo e pedidos (rodadas) de contas abertas.
// Zero pagamento, zero fiscal — despacho/pagamento ficam no Atendimento.
// ============================================================================

const COLUMNS: { status: TSaleAttendanceStatusEnum; title: string; icon: ReactNode }[] = [
	{ status: "NAO_INICIADO", title: "NA FILA", icon: <Clock className="w-4 h-4" /> },
	{ status: "EM_PREPARO", title: "EM PREPARO", icon: <ChefHat className="w-4 h-4" /> },
	{ status: "PRONTO", title: "PRONTO", icon: <CheckCheck className="w-4 h-4" /> },
];

const NEXT_STATUS: Partial<Record<TSaleAttendanceStatusEnum, { status: TSaleAttendanceStatusEnum; label: string; icon: ReactNode }>> = {
	NAO_INICIADO: { status: "EM_PREPARO", label: "INICIAR PREPARO", icon: <Play className="w-3.5 h-3.5" /> },
	EM_PREPARO: { status: "PRONTO", label: "MARCAR PRONTO", icon: <CheckCheck className="w-3.5 h-3.5" /> },
};

const ORIGIN_META: Record<string, { icon: ReactNode; className: string }> = {
	COMANDA: { icon: <UtensilsCrossed className="w-3 h-3" />, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
	ENTREGA: { icon: <Bike className="w-3 h-3" />, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
	RETIRADA: { icon: <ShoppingBag className="w-3 h-3" />, className: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
};

function formatElapsedTime(from: Date | string) {
	const minutes = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 60000));
	if (minutes < 60) return `${minutes}min`;
	return `${Math.floor(minutes / 60)}h${(minutes % 60).toString().padStart(2, "0")}`;
}

async function advanceTicket({ ticket, targetStatus }: { ticket: TPreparationTicket; targetStatus: TSaleAttendanceStatusEnum }) {
	// O card carrega a origem; a mutation escolhe o endpoint: venda -> attendance-status
	// existente; pedido de conta -> service proprio de tabs (sem gate de pagamento).
	if (ticket.origem === "VENDA") {
		const { data } = await axios.post(`/api/pos/sales/attendance-status`, { id: ticket.saleId, attendanceStatus: targetStatus });
		return data as { message: string };
	}
	return updateTabOrderStatus({ tabOrderId: ticket.tabOrderId as string, status: targetStatus });
}

function PreparationTicketCard({ ticket, canPrint }: { ticket: TPreparationTicket; canPrint: boolean }) {
	const queryClient = useQueryClient();
	const nextAction = NEXT_STATUS[ticket.status];
	const originMeta = ORIGIN_META[ticket.entregaModalidade ?? ""] ?? {
		icon: <Package className="w-3 h-3" />,
		className: "bg-secondary text-foreground/80",
	};

	const { mutate, isPending } = useMutation({
		mutationKey: ["advance-preparation-ticket", ticket.ticketId],
		mutationFn: advanceTicket,
		onSuccess: (data) => {
			toast.success(data.message);
			queryClient.invalidateQueries({ queryKey: ["preparation-tickets"] });
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	// Reimpressão manual da via de cozinha — mesmo builder do auto-print, sem chave de idempotência
	// (reimprimir é decisão humana, sempre gera um job novo).
	const { mutate: printTicket, isPending: isPrinting } = useMutation({
		mutationKey: ["print-preparation-ticket", ticket.ticketId],
		mutationFn: () =>
			createManualPrintJob(
				ticket.origem === "VENDA"
					? { finalidade: "TICKET_PREPARO", vendaId: ticket.saleId }
					: { finalidade: "TICKET_PREPARO", tabOrderId: ticket.tabOrderId },
			),
		onSuccess: (data) => toast.success(data.message),
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const elapsed = formatElapsedTime(ticket.data);
	const elapsedMinutes = Math.floor((Date.now() - new Date(ticket.data).getTime()) / 60000);

	return (
		<div className="bg-card border-border flex w-full flex-col gap-2.5 rounded-xl border px-3.5 py-3 shadow-2xs">
			<div className="flex items-center justify-between gap-2">
				<div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold tracking-tight", originMeta.className)}>
					{originMeta.icon}
					<span className="uppercase">
						{ticket.etiqueta}
						{ticket.numeroPedido ? ` · Pedido ${ticket.numeroPedido}` : ""}
					</span>
				</div>
				<div
					className={cn(
						"flex items-center gap-1 text-xs font-medium",
						elapsedMinutes >= 30 ? "text-destructive" : elapsedMinutes >= 15 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
					)}
				>
					<Clock className="w-3 h-3" />
					{elapsed}
					{canPrint ? (
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6 text-muted-foreground"
							title="Imprimir ticket de preparo"
							disabled={isPrinting}
							onClick={() => printTicket()}
						>
							<Printer className="w-3.5 h-3.5" />
						</Button>
					) : null}
				</div>
			</div>

			{ticket.clienteNome ? <p className="text-xs text-muted-foreground uppercase tracking-tight">{ticket.clienteNome}</p> : null}

			<div className="flex flex-col gap-1.5">
				{ticket.itens.map((item) => (
					<div key={item.id} className="flex flex-col gap-0.5">
						<div className="flex items-center gap-2 text-sm">
							<span className="font-bold min-w-6 text-center bg-secondary rounded-md px-1">{item.quantidade}x</span>
							<span className="font-medium tracking-tight">{item.nome}</span>
						</div>
						{item.gruposAdicionais.map((group) => (
							<p key={group.grupo ?? "sem-grupo"} className="text-[0.7rem] text-muted-foreground pl-8">
								{group.grupo ? <span className="font-semibold uppercase tracking-tight">{group.grupo}: </span> : null}
								{group.adicionais.map((modifier) => `+ ${modifier.quantidade}x ${modifier.nome}`).join(" · ")}
							</p>
						))}
						{item.observacoes ? (
							<p className="ml-8 flex items-start gap-1 rounded-md bg-amber-500/10 px-1.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
								<NotebookPen className="w-3 h-3 mt-0.5 min-w-3" />
								<span className="whitespace-pre-wrap">{item.observacoes}</span>
							</p>
						) : null}
					</div>
				))}
			</div>

			{ticket.observacoes ? (
				<div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-secondary/50 rounded-md px-2 py-1.5">
					<NotebookPen className="w-3 h-3 mt-0.5 min-w-3" />
					<span>{ticket.observacoes}</span>
				</div>
			) : null}

			{nextAction ? (
				<Button
					size="sm"
					variant="secondary"
					className="w-full flex items-center gap-1.5"
					disabled={isPending}
					onClick={() => mutate({ ticket, targetStatus: nextAction.status })}
				>
					{nextAction.icon}
					{nextAction.label}
				</Button>
			) : (
				<div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground py-1">
					<MapPin className="w-3 h-3" />
					Aguardando retirada/entrega
				</div>
			)}
		</div>
	);
}

export default function PreparationBoard() {
	const { data: tickets, isLoading, isError, error } = usePreparationTickets();
	// O botão de imprimir só existe quando alguma impressora ativa atende a via de preparo — sem
	// isso o job nasceria para expirar no painel.
	const { data: printers } = useAgentPrinters();
	const canPrint = organizationHasPrinterForFinalidade(printers, "TICKET_PREPARO");

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;

	return (
		<div className="flex h-full min-h-0 w-full gap-3 overflow-x-auto pb-2">
			{COLUMNS.map((column) => {
				const columnTickets = (tickets ?? []).filter((ticket) => ticket.status === column.status);
				return (
					<div key={column.status} className="flex h-full min-w-72 flex-1 flex-col gap-2 rounded-xl bg-secondary/30 p-2.5">
						<div className="flex items-center justify-between px-1">
							<div className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
								{column.icon}
								{column.title}
							</div>
							<span className="text-xs font-semibold bg-secondary rounded-md px-2 py-0.5">{columnTickets.length}</span>
						</div>
						<div className="flex flex-col gap-2 overflow-y-auto">
							{columnTickets.length > 0 ? (
								columnTickets.map((ticket) => <PreparationTicketCard key={ticket.ticketId} ticket={ticket} canPrint={canPrint} />)
							) : (
								<p className="text-center text-xs text-muted-foreground py-6">Nenhum ticket.</p>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
