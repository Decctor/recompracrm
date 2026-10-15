"use client";
import type { TTabDetails } from "@/app/api/tabs/route";
import { Button } from "@/components/ui/button";
import type { TBuiltOrderItem } from "@/components/Products/ProductBuilderForm";
import { Checkbox } from "@/components/ui/checkbox";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { createManualPrintJob } from "@/lib/mutations/desktop-agent";
import { cancelTabOrOrder, updateTabOrderStatus } from "@/lib/mutations/tabs";
import { organizationHasPrinterForFinalidade, useAgentPrinters } from "@/lib/queries/desktop-agent";
import { cn } from "@/lib/utils";
import type { TSaleAttendanceStatusEnum } from "@/schemas/enums";
import { useMutation } from "@tanstack/react-query";
import { Ban, CheckCheck, ChefHat, Clock, HandCoins, Plus, Printer, Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { URGENCY_META, formatElapsedMinutes, getOpenRounds, isOpenRound } from "../board-meta";
import { PartialPaymentsList } from "./PartialPaymentsList";
import { ORDER_NEXT_ACTION, ORDER_STATUS_META } from "./tab-meta";
import { toRepeatOrderItem } from "./use-tab-order-cart";

// ============================================================================
// Aba "Pedidos" do painel: rodadas em andamento como cards de acao (mais
// critica primeiro), entregues como lista compacta e o fechamento fixo no
// rodape — o mesmo padrao do checkout do PDV, sempre a um toque com o total
// parcial a vista. Confirmacoes destrutivas expandem inline.
// ============================================================================

type TTabOrder = TTabDetails["pedidos"][number];
type TTabOrderItem = TTabOrder["itens"][number];

type AccountOrdersProps = {
	tab: TTabDetails;
	now: number;
	refresh: () => void;
	onStartClose: () => void;
	/** Receber parcial: alguem da mesa paga a parte dela antes do fechamento. */
	onStartPartial: () => void;
	/** "Pedir mais um": leva uma unidade do item ao carrinho do Lançar pedido. */
	onRepeatItem: (item: TBuiltOrderItem) => void;
};

export function AccountOrders({ tab, now, refresh, onStartClose, onStartPartial, onRepeatItem }: AccountOrdersProps) {
	const isOpen = tab.status === "ABERTA";
	const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);

	const { mutate: mutateOrderStatus, isPending: orderStatusPending } = useMutation({
		mutationKey: ["update-tab-order-status", tab.id],
		mutationFn: updateTabOrderStatus,
		onSuccess: (data) => {
			toast.success(data.message);
			refresh();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	const { mutate: mutateCancel, isPending: cancelPending } = useMutation({
		mutationKey: ["cancel-tab-order", tab.id],
		mutationFn: cancelTabOrOrder,
		onSuccess: (data) => {
			toast.success(data.message);
			setConfirmingOrderId(null);
			refresh();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	// Reimpressão da via de cozinha do pedido — mesmo builder do auto-print, um job por estação.
	// O botão só aparece quando alguma impressora ativa atende o TICKET_PREPARO.
	const { data: printers } = useAgentPrinters();
	const canPrint = organizationHasPrinterForFinalidade(printers, "TICKET_PREPARO");
	const {
		mutate: mutatePrint,
		isPending: printPending,
		variables: printingOrderId,
	} = useMutation({
		mutationKey: ["print-tab-order-ticket", tab.id],
		mutationFn: (tabOrderId: string) => createManualPrintJob({ finalidade: "TICKET_PREPARO", tabOrderId }),
		onSuccess: (data) => toast.success(data.message),
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	const rounds = getOpenRounds(tab, now);
	const roundById = new Map(rounds.map((round) => [round.id, round]));
	const ordersById = new Map(tab.pedidos.map((order) => [order.id, order]));
	// Abertos na ordem de urgencia do board; encerrados na ordem de lancamento.
	const openOrders = rounds.map((round) => ordersById.get(round.id)).filter((order): order is TTabOrder => !!order);
	const doneOrders = tab.pedidos.filter((order) => !isOpenRound(order.status));
	const doneItems = doneOrders.reduce((sum, order) => sum + order.itens.reduce((acc, item) => acc + item.quantidade, 0), 0);
	const consumo = isOpen ? (tab.consumoParcial ?? 0) : (tab.valorTotal ?? tab.consumoParcial ?? 0);
	const valorPago = tab.valorPago ?? 0;
	// O que o fechamento vai cobrar: consumo menos os parciais ja recebidos.
	const restante = isOpen ? (tab.valorRestante ?? Math.max(0, consumo - valorPago)) : consumo;
	const repeatItem = isOpen ? onRepeatItem : undefined;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-4 pb-7 sm:px-5">
				{openOrders.length > 0 ? (
					<section className="flex flex-col gap-2.5">
						<SectionLabel>Em andamento · {openOrders.length}</SectionLabel>
						{openOrders.map((order) => {
							const round = roundById.get(order.id);
							const urgencia = round?.urgencia ?? "no-prazo";
							const statusMeta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.NAO_INICIADO;
							const nextAction = isOpen ? ORDER_NEXT_ACTION[order.status as TSaleAttendanceStatusEnum] : undefined;
							const isConfirmingCancel = confirmingOrderId === order.id;
							const tinted = urgencia !== "no-prazo";

							return (
								<article
									key={order.id}
									// O atraso ja aparece no relogio colorido do cabecalho; a borda fica neutra.
									className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5 shadow-2xs"
								>
									<header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
										<div className="flex min-w-0 items-center gap-2.5">
											<span className="whitespace-nowrap text-sm font-bold">Pedido {order.numero}</span>
											<span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold", statusMeta.className)}>{statusMeta.label}</span>
											<span
												className={cn(
													"flex items-center gap-1 whitespace-nowrap text-xs",
													tinted ? cn(URGENCY_META[urgencia].text, "font-bold") : "text-muted-foreground",
												)}
											>
												<Clock className="size-3.5" />
												{round && round.minutos > 0 ? `há ${formatElapsedMinutes(round.minutos)}` : "agora"}
											</span>
										</div>
										{isOpen && !isConfirmingCancel ? (
											<div className="flex items-center gap-1.5">
												{nextAction ? (
													<Button
														size="sm"
														className="h-8 gap-1.5 rounded-lg px-3 text-xs font-bold"
														disabled={orderStatusPending}
														onClick={() => mutateOrderStatus({ tabOrderId: order.id, status: nextAction.status })}
													>
														<CheckCheck className="size-3.5" />
														{nextAction.label}
													</Button>
												) : null}
												{canPrint ? (
													<Button
														size="icon"
														variant="ghost"
														className="size-8 rounded-lg text-muted-foreground"
														aria-label={`Reimprimir pedido ${order.numero}`}
														title="Reimprimir ticket de preparo"
														disabled={printPending && printingOrderId === order.id}
														onClick={() => mutatePrint(order.id)}
													>
														<Printer className="size-4" />
													</Button>
												) : null}
												<Button
													size="icon"
													variant="ghost"
													className="size-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
													aria-label={`Cancelar pedido ${order.numero}`}
													title="Cancelar pedido"
													disabled={cancelPending}
													onClick={() => setConfirmingOrderId(order.id)}
												>
													<Ban className="size-4" />
												</Button>
											</div>
										) : null}
									</header>

									<OrderItems order={order} onRepeatItem={repeatItem} />

									{order.observacoes ? <span className="text-xs italic text-muted-foreground">“{order.observacoes}”</span> : null}

									{isConfirmingCancel ? (
										<InlineCancelOrderConfirm
											orderNumber={order.numero}
											hasDeliveredItems={order.itens.some((item) => (item.quantidadeEntregue ?? 0) > 0)}
											pending={cancelPending}
											onKeep={() => setConfirmingOrderId(null)}
											onConfirm={(devolverEstoque) =>
												mutateCancel({ tabOrderId: order.id, tabId: null, devolverEstoque, confirmarItensEntregues: null, motivo: null })
											}
										/>
									) : null}
								</article>
							);
						})}
					</section>
				) : null}

				{doneOrders.length > 0 ? (
					<section className="flex flex-col gap-2.5">
						<SectionLabel>
							Entregues · {doneOrders.length} {doneOrders.length === 1 ? "pedido" : "pedidos"} · {doneItems} itens
						</SectionLabel>
						<div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
							{doneOrders.map((order) => {
								const statusMeta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.ENTREGUE;
								const orderTotal = order.itens.reduce((sum, item) => sum + item.valorVendaTotalLiquido, 0);
								return (
									<div key={order.id} className="flex flex-col gap-1.5 border-b border-border/60 px-4 py-3 last:border-b-0">
										<div className="flex items-center justify-between gap-2">
											<span className="flex items-center gap-2 text-sm font-bold">
												Pedido {order.numero}
												<span className={cn("rounded-full px-1.5 py-0.5 text-xs font-bold", statusMeta.className)}>{statusMeta.label}</span>
											</span>
											<span className={cn("text-sm font-bold tabular-nums text-muted-foreground", order.status === "CANCELADO" && "line-through")}>
												{formatToMoney(orderTotal)}
											</span>
										</div>
										{order.itens.map((item) => {
											const metadata = (item.metadados ?? {}) as { nome?: string };
											return (
												<div
													key={item.id}
													className={cn(
														"grid items-center gap-2 text-sm text-foreground/75",
														repeatItem ? "grid-cols-[28px_1fr_auto_auto]" : "grid-cols-[28px_1fr_auto]",
													)}
												>
													<span className="font-bold text-muted-foreground">{item.quantidade}×</span>
													<span className="min-w-0 [overflow-wrap:anywhere]">{metadata.nome ?? "Item"}</span>
													<span className="tabular-nums text-muted-foreground">{formatToMoney(item.valorVendaTotalLiquido)}</span>
													{repeatItem ? <RepeatItemButton item={item} onRepeatItem={repeatItem} /> : null}
												</div>
											);
										})}
									</div>
								);
							})}
						</div>
					</section>
				) : null}

				<PartialPaymentsList payments={tab.pagamentosParciais} isOpen={isOpen} refresh={refresh} />

				{tab.pedidos.length === 0 ? (
					<div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-12 text-center">
						<span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<ChefHat className="size-5" />
						</span>
						<span className="text-sm font-bold">Nenhum pedido lançado ainda</span>
						<span className="max-w-[300px] text-sm leading-snug text-muted-foreground">
							Monte o primeiro pedido em “Lançar pedido”. O pagamento acontece só no fechamento.
						</span>
					</div>
				) : null}
			</div>

			{/* Fechamento fixo — padrao do checkout do PDV. O total já está no botão e no cabeçalho, e as
			    contagens na aba e no rótulo "Em andamento". O parcial fica ao lado, menor: é a exceção. */}
			{isOpen ? (
				<div className="flex gap-2 border-t border-border bg-card px-4 pt-3 pb-4 sm:px-5">
					<Button
						variant="outline"
						size="lg"
						className="shrink-0 gap-1.5 px-3 font-bold"
						disabled={restante <= 0}
						title="Receber a parte de quem vai embora antes"
						onClick={onStartPartial}
					>
						<HandCoins className="size-4" />
						<span className="hidden sm:inline">Receber parcial</span>
						<span className="sm:hidden">Parcial</span>
					</Button>
					<Button variant="brand" size="lg" className="min-w-0 flex-1" disabled={consumo <= 0} onClick={onStartClose}>
						<Receipt className="size-4" />
						<span className="truncate">
							Fechar conta · {formatToMoney(restante)}
							{valorPago > 0 ? <span className="font-semibold opacity-80"> ({formatToMoney(valorPago)} pago)</span> : null}
						</span>
					</Button>
				</div>
			) : null}
		</div>
	);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{children}</span>;
}

function OrderItems({ order, onRepeatItem }: { order: TTabOrder; onRepeatItem?: (item: TBuiltOrderItem) => void }) {
	return (
		<div className="flex flex-col gap-1.5">
			{order.itens.map((item) => {
				const metadata = (item.metadados ?? {}) as { nome?: string };
				const fullyCancelled = item.quantidadeCancelada >= item.quantidade;
				const addOns = item.adicionais.map((addOn) => `${addOn.quantidade}x ${addOn.nome}`).join(" · ");
				return (
					<div
						key={item.id}
						className={cn(
							"grid items-baseline gap-2 text-sm",
							onRepeatItem ? "grid-cols-[28px_1fr_auto_auto]" : "grid-cols-[28px_1fr_auto]",
							fullyCancelled && "text-muted-foreground line-through",
						)}
					>
						<span className="font-bold text-muted-foreground">{item.quantidade}×</span>
						<span className="flex min-w-0 flex-col">
							<span className="font-semibold [overflow-wrap:anywhere]">{metadata.nome ?? "Item"}</span>
							{addOns ? <span className="text-xs text-muted-foreground">{addOns}</span> : null}
						</span>
						<span className="text-sm font-bold tabular-nums">{formatToMoney(item.valorVendaTotalLiquido)}</span>
						{onRepeatItem ? <RepeatItemButton item={item} onRepeatItem={onRepeatItem} /> : null}
					</div>
				);
			})}
		</div>
	);
}

// "Mais uma": a mesma unidade (variante, adicionais, observação) vai ao carrinho do Lançar pedido,
// onde o garçom ajusta a quantidade e envia. Item cancelado ou sem como repetir guarda o espaço
// do botão para os preços continuarem alinhados.
function RepeatItemButton({ item, onRepeatItem }: { item: TTabOrderItem; onRepeatItem: (item: TBuiltOrderItem) => void }) {
	const repeatable = item.quantidadeCancelada < item.quantidade ? toRepeatOrderItem(item) : null;
	if (!repeatable) return <span className="size-7" aria-hidden />;

	return (
		<Button
			size="icon"
			variant="ghost"
			className="size-7 self-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
			aria-label={`Pedir mais 1 ${repeatable.nome}`}
			title="Pedir mais 1"
			onClick={() => onRepeatItem(repeatable)}
		>
			<Plus className="size-4" />
		</Button>
	);
}

// ============================================================================
// Confirmações inline
// ============================================================================

type InlineCancelOrderConfirmProps = {
	orderNumber: number;
	hasDeliveredItems: boolean;
	pending: boolean;
	onKeep: () => void;
	onConfirm: (devolverEstoque: boolean | null) => void;
};

function InlineCancelOrderConfirm({ orderNumber, hasDeliveredItems, pending, onKeep, onConfirm }: InlineCancelOrderConfirmProps) {
	const [devolverEstoque, setDevolverEstoque] = useState(true);

	return (
		<div className="flex flex-col gap-2.5 rounded-xl bg-destructive/10 px-3 py-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
			<p className="text-xs font-bold text-destructive">Cancelar o pedido {orderNumber}? Esta ação não pode ser desfeita.</p>
			{hasDeliveredItems ? (
				<label className="flex items-center gap-2 text-xs font-medium">
					<Checkbox checked={devolverEstoque} onCheckedChange={(checked) => setDevolverEstoque(checked === true)} />
					Devolver os itens já entregues ao estoque
				</label>
			) : null}
			<div className="flex items-center justify-end gap-1.5">
				<Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-bold" disabled={pending} onClick={onKeep}>
					Manter
				</Button>
				<Button
					size="sm"
					variant="destructive"
					className="h-8 rounded-lg text-xs font-bold"
					disabled={pending}
					onClick={() => onConfirm(hasDeliveredItems ? devolverEstoque : null)}
				>
					Cancelar pedido
				</Button>
			</div>
		</div>
	);
}

type InlineCancelTabConfirmProps = {
	hasDeliveredItems: boolean;
	pending: boolean;
	onKeep: () => void;
	onConfirm: (confirmarItensEntregues: boolean | null) => void;
};

export function InlineCancelTabConfirm({ hasDeliveredItems, pending, onKeep, onConfirm }: InlineCancelTabConfirmProps) {
	const [confirmDelivered, setConfirmDelivered] = useState(false);
	const blocked = hasDeliveredItems && !confirmDelivered;

	return (
		<div className="flex flex-col gap-2.5 rounded-xl bg-destructive/10 px-3.5 py-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm font-bold text-destructive">Cancelar a conta inteira? Pedidos ativos serão cancelados.</p>
				<div className="flex gap-2">
					<Button size="sm" variant="outline" className="h-8 rounded-lg text-xs font-bold" disabled={pending} onClick={onKeep}>
						Manter conta
					</Button>
					<Button
						size="sm"
						variant="destructive"
						className="h-8 rounded-lg text-xs font-bold"
						disabled={pending || blocked}
						onClick={() => onConfirm(hasDeliveredItems ? true : null)}
					>
						Cancelar conta
					</Button>
				</div>
			</div>
			{hasDeliveredItems ? (
				<label className="flex items-center gap-2 text-xs font-medium">
					<Checkbox checked={confirmDelivered} onCheckedChange={(checked) => setConfirmDelivered(checked === true)} />A conta possui itens já entregues
					(consumo real). Confirmo o cancelamento mesmo assim.
				</label>
			) : null}
		</div>
	);
}
