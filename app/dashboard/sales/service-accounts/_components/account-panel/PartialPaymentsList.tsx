"use client";
import type { TTabDetails } from "@/app/api/tabs/route";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { refundTabPayment } from "@/lib/mutations/tabs";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { HandCoins, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { METHOD_META, SalesSessionPicker, useOpenSalesSessionSelection } from "./payment-shared";

// ============================================================================
// Recebidos da conta: "Joao · Pix · R$ 62,00 · 21:14 · por Ana". Estorno inline
// pedindo motivo (padrao das confirmacoes destrutivas do AccountOrders); em
// dinheiro, tambem o caixa que devolve a nota. Estornados ficam na lista,
// riscados — o historico da conta nao esconde o que aconteceu.
// ============================================================================

type TTabPayment = TTabDetails["pagamentosParciais"][number];

type PartialPaymentsListProps = {
	payments: TTabPayment[];
	isOpen: boolean;
	refresh: () => void;
};

function formatTime(value: string | Date) {
	return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function PartialPaymentsList({ payments, isOpen, refresh }: PartialPaymentsListProps) {
	const [refundingId, setRefundingId] = useState<string | null>(null);
	const active = payments.filter((payment) => payment.status === "ATIVO");
	const total = active.reduce((sum, payment) => sum + payment.valor, 0);

	const { mutate, isPending } = useMutation({
		mutationKey: ["refund-tab-payment"],
		mutationFn: refundTabPayment,
		onSuccess: (data) => {
			toast.success(data.message);
			setRefundingId(null);
			refresh();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	if (payments.length === 0) return null;

	return (
		<section className="flex flex-col gap-2.5">
			<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
				Recebido · {active.length} {active.length === 1 ? "parcial" : "parciais"} · {formatToMoney(total)}
			</span>
			<div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
				{payments.map((payment) => {
					const refunded = payment.status === "ESTORNADO";
					const meta = METHOD_META[payment.metodo] ?? METHOD_META.OUTRO!;
					const MethodIcon = meta.icon;
					const details = [
						meta.label,
						formatTime(payment.dataRecebimento),
						payment.recebidoPorUsuario?.nome ? `por ${payment.recebidoPorUsuario.nome}` : null,
					].filter(Boolean);
					return (
						<div key={payment.id} className="flex flex-col gap-2 border-b border-border/60 px-4 py-3 last:border-b-0">
							<div className="flex items-center justify-between gap-3">
								<span className="flex min-w-0 items-center gap-2.5">
									<span
										className={cn(
											"flex size-8 shrink-0 items-center justify-center rounded-lg",
											refunded ? "bg-secondary text-muted-foreground" : "bg-success-surface text-success-surface-foreground",
										)}
									>
										{refunded ? <Undo2 className="size-4" /> : <MethodIcon className="size-4" />}
									</span>
									<span className="flex min-w-0 flex-col">
										<span className={cn("truncate text-sm font-bold", refunded && "text-muted-foreground line-through")}>
											{payment.pagadorNome || "Recebimento parcial"}
										</span>
										<span className="truncate text-xs text-muted-foreground">
											{details.join(" · ")}
											{refunded
												? ` · estornado${payment.estornadoPorUsuario?.nome ? ` por ${payment.estornadoPorUsuario.nome}` : ""}${payment.motivoEstorno ? `: ${payment.motivoEstorno}` : ""}`
												: ""}
										</span>
									</span>
								</span>
								<span className="flex shrink-0 items-center gap-2">
									<span className={cn("text-sm font-bold tabular-nums", refunded && "text-muted-foreground line-through")}>
										{formatToMoney(payment.valor)}
									</span>
									{isOpen && !refunded && refundingId !== payment.id ? (
										<Button
											size="sm"
											variant="ghost"
											className="h-8 rounded-lg px-2 text-xs font-bold text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
											title="Estornar recebimento"
											onClick={() => setRefundingId(payment.id)}
										>
											Estornar
										</Button>
									) : null}
								</span>
							</div>
							{refundingId === payment.id ? (
								<InlineRefundConfirm
									payment={payment}
									pending={isPending}
									onKeep={() => setRefundingId(null)}
									onConfirm={(reason, sessaoVendaId) => mutate({ tabPaymentId: payment.id, reason, sessaoVendaId })}
								/>
							) : null}
						</div>
					);
				})}
			</div>
		</section>
	);
}

type InlineRefundConfirmProps = {
	payment: TTabPayment;
	pending: boolean;
	onKeep: () => void;
	onConfirm: (reason: string, sessaoVendaId: string | null) => void;
};

function InlineRefundConfirm({ payment, pending, onKeep, onConfirm }: InlineRefundConfirmProps) {
	const [reason, setReason] = useState("");
	const isCash = payment.metodo === "DINHEIRO";
	const { openSessions, sessaoVendaId, setSessaoVendaId, selectedSession } = useOpenSalesSessionSelection();
	// Dinheiro sai de uma gaveta: sem caixa aberto, o estorno nao tem de onde sair (regra do servidor).
	const missingSession = isCash && !sessaoVendaId;
	const blocked = reason.trim().length === 0 || missingSession;

	return (
		<div className="flex flex-col gap-2.5 rounded-xl bg-destructive/10 px-3 py-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
			<p className="text-xs font-bold text-destructive">
				Estornar {formatToMoney(payment.valor)}
				{payment.pagadorNome ? ` de ${payment.pagadorNome}` : ""}? O valor volta a ser cobrado no fechamento.
			</p>
			<input
				aria-label="Motivo do estorno"
				value={reason}
				maxLength={300}
				placeholder="Motivo (obrigatório)"
				onChange={(event) => setReason(event.target.value)}
				className="h-9 rounded-lg border border-border bg-card px-3 text-sm font-semibold outline-none focus:border-primary"
			/>
			{isCash ? (
				openSessions.length > 0 ? (
					<SalesSessionPicker
						openSessions={openSessions}
						selectedSession={selectedSession}
						onSelect={setSessaoVendaId}
						required
						label="Caixa que devolve o dinheiro"
					/>
				) : (
					<span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
						<HandCoins className="size-3.5" />
						Abra um caixa para estornar um recebimento em dinheiro.
					</span>
				)
			) : null}
			<div className="flex items-center justify-end gap-1.5">
				<Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-bold" disabled={pending} onClick={onKeep}>
					Manter
				</Button>
				<Button
					size="sm"
					variant="destructive"
					className="h-8 rounded-lg text-xs font-bold"
					disabled={pending || blocked}
					onClick={() => onConfirm(reason.trim(), sessaoVendaId)}
				>
					Estornar
				</Button>
			</div>
		</div>
	);
}
