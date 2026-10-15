"use client";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { ChangeTabServiceCard } from "@/components/Modals/ServiceCards/ChangeTabServiceCard";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { cancelTabOrOrder, transferTab, updateTabClient } from "@/lib/mutations/tabs";
import { useTabById } from "@/lib/queries/tabs";
import { isTabCloseBlockingOrderStatus } from "@/lib/tabs/close-blocking";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	ArrowRightLeft,
	Ban,
	ChevronDown,
	ChevronUp,
	CircleUser,
	Ellipsis,
	IdCard,
	Plus,
	UserRound,
	UserRoundMinus,
	UserRoundPlus,
	Utensils,
	X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";
import { formatTabAge, tabLabel } from "../board-meta";
import { AccountOrders, InlineCancelTabConfirm } from "./AccountOrders";
import { ClosePane } from "./ClosePane";
import { PartialPaymentPane } from "./PartialPaymentPane";
import { TabOrderComposer } from "./TabOrderComposer";
import { useTabOrderCart } from "./use-tab-order-cart";

// Mesmo picker do PDV: busca por nome/telefone/CPF e cadastro na hora quando o cliente não existe.
const ClientVinculationMenu = dynamic(() => import("@/components/Clients/ClientVinculationMenu"), { loading: () => null });

// ============================================================================
// Painel lateral da conta. Substitui a pagina /[accountId]: o board continua
// a vista (desktop) e trocar de conta e um clique ou ↑↓, sem navegar. O
// cabecalho concentra identidade, consumo e acoes da conta; o corpo alterna
// entre Pedidos e Lançar pedido, e o fechamento assume o corpo inteiro.
// ============================================================================

export type TAccountPanelTab = "pedidos" | "lancar";

export type TTransferTarget = { id: string; rotulo: string };

type AccountPanelProps = {
	tabId: string;
	now: number;
	sheetTab: TAccountPanelTab;
	onSheetTabChange: (tab: TAccountPanelTab) => void;
	/** Pontos que ainda aceitam conta (limite por ponto respeitado). null = pontos desabilitados. */
	transferTargets: TTransferTarget[] | null;
	onPrev: () => void;
	onNext: () => void;
	onClose: () => void;
	/** Conta fechada ou cancelada: sai do board e o painel fecha. */
	onFinished: () => void;
};

export function AccountPanel({ tabId, now, sheetTab, onSheetTabChange, transferTargets, onPrev, onNext, onClose, onFinished }: AccountPanelProps) {
	const queryClient = useQueryClient();
	const { data: tab, isLoading, isError, error, queryKey } = useTabById({ tabId });
	const [pane, setPane] = useState<"conta" | "fechar" | "parcial">("conta");
	const [transferOpen, setTransferOpen] = useState(false);
	const [confirmingCancel, setConfirmingCancel] = useState(false);
	const [linkClientOpen, setLinkClientOpen] = useState(false);
	const [changeCardOpen, setChangeCardOpen] = useState(false);
	const orderCart = useTabOrderCart();

	function refresh() {
		queryClient.invalidateQueries({ queryKey });
		queryClient.invalidateQueries({ queryKey: ["tabs"] });
		queryClient.invalidateQueries({ queryKey: ["preparation-tickets"] });
	}

	function finish() {
		queryClient.invalidateQueries({ queryKey: ["tabs"] });
		queryClient.invalidateQueries({ queryKey: ["preparation-tickets"] });
		queryClient.removeQueries({ queryKey });
		onFinished();
	}

	const { mutate: mutateTransfer, isPending: transferPending } = useMutation({
		mutationKey: ["transfer-tab", tabId],
		mutationFn: transferTab,
		onSuccess: (data) => {
			toast.success(data.message);
			setTransferOpen(false);
			refresh();
			queryClient.invalidateQueries({ queryKey: ["service-points"] });
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	// Vincular, trocar e desvincular: o picker só escolhe; a gravação na conta acontece aqui.
	const { mutate: mutateTabClient, isPending: tabClientPending } = useMutation({
		mutationKey: ["update-tab-client", tabId],
		mutationFn: updateTabClient,
		onSuccess: (data) => {
			toast.success(data.message);
			refresh();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	const { mutate: mutateCancelTab, isPending: cancelPending } = useMutation({
		mutationKey: ["cancel-tab", tabId],
		mutationFn: cancelTabOrOrder,
		onSuccess: (data) => {
			toast.success(data.message);
			finish();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	if (isLoading || !tab) {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex items-start justify-between gap-3 border-b border-border bg-card px-4 pt-4 pb-3 sm:px-5">
					<div className="flex flex-col gap-2">
						<Skeleton className="h-7 w-44" />
						<Skeleton className="h-4 w-56" />
					</div>
					<Button size="icon" variant="ghost" className="size-8 rounded-lg" aria-label="Fechar painel" onClick={onClose}>
						<X className="size-4" />
					</Button>
				</div>
				<div className="flex flex-col gap-2.5 p-5">
					{isError ? <ErrorComponent msg={getErrorMessage(error)} /> : null}
					<Skeleton className="h-28 w-full rounded-xl" />
					<Skeleton className="h-28 w-full rounded-xl" />
				</div>
			</div>
		);
	}

	const isOpen = tab.status === "ABERTA";
	const closing = pane === "fechar" && isOpen;
	const receivingPartial = pane === "parcial" && isOpen;
	const valorPago = tab.valorPago ?? 0;
	const activePartials = tab.pagamentosParciais.filter((payment) => payment.status === "ATIVO").length;
	const activeOrders = tab.pedidos.filter((order) => order.status !== "CANCELADO");
	const label = tabLabel(tab);
	const meta = [
		tab.servicePoint ? (tab.servicePoint.grupo ?? null) : "Comanda avulsa",
		tab.codigo && tab.servicePoint ? `Comanda ${tab.codigo}` : null,
		isOpen ? `aberta há ${formatTabAge(tab.dataAbertura, now)}` : tab.status === "CANCELADA" ? "cancelada" : "fechada",
	]
		.filter(Boolean)
		.join(" · ");
	const consumo = isOpen ? (tab.consumoParcial ?? 0) : (tab.valorTotal ?? tab.consumoParcial ?? 0);
	// Com parcial recebido, o numero do cabecalho e o que falta: e isso que o garcom vai cobrar.
	const headline = isOpen && valorPago > 0 ? (tab.valorRestante ?? Math.max(0, consumo - valorPago)) : consumo;
	const activeItems = activeOrders.flatMap((order) => order.itens).filter((item) => item.quantidadeCancelada < item.quantidade);
	const hasDeliveredItems = tab.pedidos.some((order) => order.itens.some((item) => (item.quantidadeEntregue ?? 0) > 0));
	const targets = (transferTargets ?? []).filter((point) => point.id !== tab.servicePointId);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* ------------------------------------------------------------ Cabecalho */}
			{/* Duas linhas: o total fica ao lado do nome (o rodapé só existe em Pedidos, e o Lançar
			    pedido também precisa dele); cliente e responsável entram na linha de metadados. */}
			<div className="flex flex-col gap-3 border-b border-border bg-card px-4 pt-4 pb-3 sm:px-5">
				<div className="flex items-start justify-between gap-x-4">
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						{/* No celular, sem espaço ao lado do nome, o total desce para a linha de baixo. */}
						<div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
							<h2 className="min-w-0 truncate text-2xl font-bold leading-tight tracking-tight">{label}</h2>
							{/* No fechamento/parcial o total vive no cartao do pane — sem repetir o numero aqui. */}
							{closing || receivingPartial ? null : (
								<span className="flex items-baseline gap-2">
									<span
										className="text-numeric whitespace-nowrap text-lg font-bold tracking-tight"
										title={isOpen ? (valorPago > 0 ? "Restante a receber" : "Consumo em aberto") : "Total da conta"}
									>
										{formatToMoney(headline)}
									</span>
									{isOpen && valorPago > 0 ? (
										<span className="whitespace-nowrap rounded-full bg-success-surface px-2 py-0.5 text-xs font-bold text-success-surface-foreground tabular-nums">
											{formatToMoney(valorPago)} pago
										</span>
									) : null}
								</span>
							)}
						</div>
						<div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
							<span>{meta}</span>
							<span aria-hidden>·</span>
							{isOpen ? (
								<button
									type="button"
									onClick={() => setLinkClientOpen(true)}
									title={tab.cliente ? "Trocar cliente" : "Vincular cliente"}
									className="-mx-1 flex items-center gap-1.5 whitespace-nowrap rounded-md px-1 underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<CircleUser className="size-3.5" />
									{tab.cliente?.nome ?? "Sem cliente"}
								</button>
							) : (
								<span className="flex items-center gap-1.5 whitespace-nowrap">
									<CircleUser className="size-3.5" />
									{tab.cliente?.nome ?? "Sem cliente"}
								</span>
							)}
							{tab.responsavelVendedor ? (
								<>
									<span aria-hidden>·</span>
									<span className="flex items-center gap-1.5 whitespace-nowrap">
										<UserRound className="size-3.5" />
										{tab.responsavelVendedor.nome}
									</span>
								</>
							) : null}
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<IconAction label="Conta anterior (↑)" onClick={onPrev}>
							<ChevronUp className="size-4" />
						</IconAction>
						<IconAction label="Próxima conta (↓)" onClick={onNext}>
							<ChevronDown className="size-4" />
						</IconAction>
						{isOpen ? (
							<>
								<span className="mx-1 h-5 w-px bg-border" aria-hidden />
								{transferTargets ? (
									<Popover open={transferOpen} onOpenChange={setTransferOpen}>
										<PopoverTrigger
											render={
												<Button variant="outline" className="h-8 gap-1.5 rounded-lg px-3 text-sm font-bold">
													<ArrowRightLeft className="size-4" />
													<span className="hidden sm:inline">Transferir</span>
												</Button>
											}
										/>
										<PopoverContent align="end" className="flex w-[300px] flex-col gap-2.5 rounded-xl p-3.5">
											<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Transferir para</span>
											{targets.length > 0 ? (
												<div className="flex max-h-60 flex-wrap gap-1.5 overflow-y-auto">
													{targets.map((point) => (
														<button
															key={point.id}
															type="button"
															disabled={transferPending}
															onClick={() => mutateTransfer({ tabId: tab.id, servicePointDestinoId: point.id, motivo: null })}
															className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-dashed border-border bg-card px-2.5 text-xs font-bold transition-colors hover:border-success hover:bg-success-surface disabled:opacity-50"
														>
															<span className="size-1.5 rounded-full bg-success" aria-hidden />
															{point.rotulo}
														</button>
													))}
												</div>
											) : (
												<span className="text-sm font-semibold">Nenhum ponto disponível agora.</span>
											)}
											<span className="text-xs text-muted-foreground">Só aparecem pontos com vaga para mais uma conta. Pedidos e consumo vão junto.</span>
										</PopoverContent>
									</Popover>
								) : null}
								<DropdownMenu>
									<DropdownMenuTrigger
										render={
											<Button variant="outline" size="icon" className="size-8 rounded-lg" aria-label="Mais ações" title="Mais ações">
												<Ellipsis className="size-4" />
											</Button>
										}
									/>
									<DropdownMenuContent align="end" className="w-56">
										<DropdownMenuItem onClick={() => setLinkClientOpen(true)}>
											<UserRoundPlus className="size-4" />
											{tab.cliente ? "Trocar cliente" : "Vincular cliente"}
										</DropdownMenuItem>
										{tab.cliente ? (
											<DropdownMenuItem disabled={tabClientPending} onClick={() => mutateTabClient({ tabId: tab.id, clienteId: null })}>
												<UserRoundMinus className="size-4" />
												Desvincular cliente
											</DropdownMenuItem>
										) : null}
										{tab.serviceCardId ? (
											<DropdownMenuItem onClick={() => setChangeCardOpen(true)}>
												<IdCard className="size-4" />
												Trocar comanda
											</DropdownMenuItem>
										) : null}
										<DropdownMenuSeparator />
										<DropdownMenuItem variant="destructive" onClick={() => setConfirmingCancel(true)}>
											<Ban className="size-4" />
											Cancelar conta
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</>
						) : null}
						<Button
							size="icon"
							variant="ghost"
							className="size-8 rounded-lg"
							aria-label="Fechar painel (Esc)"
							title="Fechar painel (Esc)"
							onClick={onClose}
						>
							<X className="size-4" />
						</Button>
					</div>
				</div>

				{!isOpen ? (
					<div
						className={cn("rounded-xl px-3.5 py-2.5 text-sm font-bold", tab.status === "CANCELADA" ? "bg-destructive/10 text-destructive" : "bg-secondary")}
					>
						{tab.status === "CANCELADA" ? "Conta cancelada" : "Conta fechada"}. Somente leitura.
					</div>
				) : null}

				{confirmingCancel && isOpen ? (
					<InlineCancelTabConfirm
						hasDeliveredItems={hasDeliveredItems}
						pending={cancelPending}
						onKeep={() => setConfirmingCancel(false)}
						onConfirm={(confirmarItensEntregues) =>
							mutateCancelTab({ tabId: tab.id, tabOrderId: null, devolverEstoque: null, confirmarItensEntregues, motivo: null })
						}
					/>
				) : null}
			</div>

			{/* ---------------------------------------------------------------- Corpo */}
			{receivingPartial ? (
				<PartialPaymentPane
					tabId={tab.id}
					tabLabel={label}
					consumo={tab.consumoParcial ?? 0}
					jaPago={valorPago}
					onBack={() => setPane("conta")}
					onReceived={() => {
						setPane("conta");
						refresh();
					}}
				/>
			) : closing ? (
				<ClosePane
					tabId={tab.id}
					tabLabel={label}
					subtotal={tab.consumoParcial ?? 0}
					jaPago={valorPago}
					partialCount={activePartials}
					itemsGross={activeItems.reduce((sum, item) => sum + item.valorVendaTotalBruto, 0)}
					itemsDiscount={activeItems.reduce((sum, item) => sum + item.valorTotalDesconto, 0)}
					vendedorId={tab.vendaRascunhoVendedorId}
					draftSaleId={tab.vendaRascunhoId}
					orderCount={activeOrders.length}
					pendingOrders={tab.pedidos.filter((order) => isTabCloseBlockingOrderStatus(order.status))}
					itemCount={activeOrders.reduce((sum, order) => sum + order.itens.reduce((acc, item) => acc + item.quantidade - item.quantidadeCancelada, 0), 0)}
					onBack={() => setPane("conta")}
					onClosed={finish}
				/>
			) : (
				<>
					{isOpen ? (
						<div className="flex border-b border-border bg-card px-4 sm:px-5" role="tablist">
							<SheetTabButton active={sheetTab === "pedidos"} onClick={() => onSheetTabChange("pedidos")}>
								<Utensils className="size-4" />
								Pedidos
								<span className="font-bold text-muted-foreground">{tab.pedidos.length}</span>
							</SheetTabButton>
							<SheetTabButton active={sheetTab === "lancar"} onClick={() => onSheetTabChange("lancar")}>
								<Plus className="size-4" />
								Lançar pedido
								{orderCart.cartCount > 0 ? (
									<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
										{orderCart.cartCount}
									</span>
								) : null}
							</SheetTabButton>
						</div>
					) : null}

					{/* Compositor sempre montado: o carrinho sobrevive a ida e volta entre as abas. */}
					<div className={cn("flex min-h-0 flex-1 flex-col", sheetTab !== "pedidos" && isOpen && "hidden")}>
						<AccountOrders
							tab={tab}
							now={now}
							refresh={refresh}
							onStartClose={() => setPane("fechar")}
							onStartPartial={() => setPane("parcial")}
							onRepeatItem={(item) => {
								orderCart.addItem(item);
								onSheetTabChange("lancar");
							}}
						/>
					</div>
					{isOpen ? (
						<div className={cn("flex min-h-0 flex-1 flex-col bg-card", sheetTab !== "lancar" && "hidden")}>
							<TabOrderComposer
								tabId={tab.id}
								orderCart={orderCart}
								onLaunched={() => {
									refresh();
									onSheetTabChange("pedidos");
								}}
							/>
						</div>
					) : null}
				</>
			)}

			{linkClientOpen ? (
				<ClientVinculationMenu
					description="Busque por nome, telefone ou CPF/CNPJ. O consumo da conta passa a contar no histórico do cliente quando a conta for fechada."
					authorSellerId={tab.responsavelVendedor?.id ?? null}
					closeModal={() => setLinkClientOpen(false)}
					onSelectClient={(client) => {
						setLinkClientOpen(false);
						if (client.id !== tab.cliente?.id) mutateTabClient({ tabId: tab.id, clienteId: client.id });
					}}
				/>
			) : null}
			{changeCardOpen ? (
				<ChangeTabServiceCard
					tabId={tab.id}
					currentCodigo={tab.codigo}
					closeModal={() => setChangeCardOpen(false)}
					callbacks={{
						onSuccess: () => {
							refresh();
							queryClient.invalidateQueries({ queryKey: ["service-cards"] });
						},
					}}
				/>
			) : null}
		</div>
	);
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
	return (
		<Button variant="outline" size="icon" className="size-8 rounded-lg" aria-label={label} title={label} onClick={onClick}>
			{children}
		</Button>
	);
}

function SheetTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={active}
			onClick={onClick}
			className={cn(
				"mr-5 flex h-10 items-center gap-1.5 whitespace-nowrap px-1 text-sm font-bold transition-colors",
				active ? "text-foreground shadow-[inset_0_-2px_0_var(--color-primary)]" : "text-muted-foreground hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}
