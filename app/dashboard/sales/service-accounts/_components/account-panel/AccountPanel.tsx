"use client";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import { LinkTabClient } from "@/components/Modals/Internal/Tabs/LinkTabClient";
import { ChangeTabServiceCard } from "@/components/Modals/ServiceCards/ChangeTabServiceCard";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { cancelTabOrOrder, transferTab } from "@/lib/mutations/tabs";
import { useTabById } from "@/lib/queries/tabs";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Ban, ChevronDown, ChevronUp, CircleUser, Ellipsis, IdCard, Plus, UserRound, UserRoundPlus, Utensils, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatTabAge, tabLabel } from "../board-meta";
import { AccountOrders, InlineCancelTabConfirm } from "./AccountOrders";
import { ClosePane } from "./ClosePane";
import { TabOrderComposer } from "./TabOrderComposer";
import { useTabOrderCart } from "./use-tab-order-cart";

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
	const [pane, setPane] = useState<"conta" | "fechar">("conta");
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
				<div className="flex items-start justify-between gap-3 border-b border-border bg-card px-5 pt-4.5 pb-3.5">
					<div className="flex flex-col gap-2">
						<Skeleton className="h-6 w-32" />
						<Skeleton className="h-3.5 w-48" />
						<Skeleton className="mt-3 h-8 w-36" />
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
	const hasDeliveredItems = tab.pedidos.some((order) => order.itens.some((item) => (item.quantidadeEntregue ?? 0) > 0));
	const targets = (transferTargets ?? []).filter((point) => point.id !== tab.servicePointId);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* ------------------------------------------------------------ Cabecalho */}
			<div className="flex flex-col gap-3.5 border-b border-border bg-card px-4 pt-4 pb-3.5 sm:px-5">
				<div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
					<div className="flex min-w-0 flex-col gap-1">
						<h2 className="truncate text-2xl font-bold leading-tight tracking-tight">{label}</h2>
						<span className="truncate text-sm text-muted-foreground">{meta}</span>
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

				{/* No fechamento o total vive no cartao "Total a receber" — sem repetir o numero aqui. */}
				<div className={cn("flex flex-wrap items-end gap-x-7 gap-y-3", closing && "hidden")}>
					<div className="flex flex-col gap-1.5">
						<span className="whitespace-nowrap text-xs font-bold uppercase tracking-wide text-muted-foreground">
							{isOpen ? "Consumo em aberto" : "Total da conta"}
						</span>
						<span className="whitespace-nowrap text-3xl font-bold leading-none tracking-tight tabular-nums">{formatToMoney(consumo)}</span>
					</div>
					<div className="flex flex-col gap-1 pb-0.5 text-sm text-muted-foreground">
						<span className="flex items-center gap-1.5 whitespace-nowrap">
							<CircleUser className="size-3.5" />
							{tab.cliente?.nome ?? "Sem cliente"}
						</span>
						{tab.responsavelVendedor ? (
							<span className="flex items-center gap-1.5">
								<UserRound className="size-3.5" />
								{tab.responsavelVendedor.nome}
							</span>
						) : null}
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
			{closing ? (
				<ClosePane
					tabId={tab.id}
					tabLabel={label}
					total={tab.consumoParcial ?? 0}
					orderCount={activeOrders.length}
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
				<LinkTabClient tabId={tab.id} cliente={tab.cliente} closeModal={() => setLinkClientOpen(false)} callbacks={{ onSuccess: refresh }} />
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
