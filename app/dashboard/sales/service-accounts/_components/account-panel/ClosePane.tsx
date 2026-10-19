"use client";
import SelectInput from "@/components/Inputs/SelectInput";
import { DiscountApproval } from "@/components/Modals/Sales/DiscountApproval";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { createManualPrintJob } from "@/lib/mutations/desktop-agent";
import { closeTab } from "@/lib/mutations/tabs";
import { evaluateDiscount } from "@/lib/permissions/discounts";
import { useSaleDiscountContext } from "@/lib/queries/action-approvals";
import { organizationHasPrinterForFinalidade, useAgentPrinters } from "@/lib/queries/desktop-agent";
import { useOrganization } from "@/lib/queries/organizations";
import { usePOSFinancialAccounts } from "@/lib/queries/pos";
import { resolveTabBalance } from "@/lib/tabs/partial-payments";
import { cn } from "@/lib/utils";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { useMutation } from "@tanstack/react-query";
import {
	ArrowLeft,
	CircleAlert,
	CircleCheck,
	HandCoins,
	type LucideIcon,
	Minus,
	PackageCheck,
	Percent,
	Plus,
	Printer,
	Receipt,
	Tag,
	Trash2,
	UsersRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	METHOD_META,
	PaymentMethodPicker,
	formatInput,
	likelyNotes,
	parseInput,
	roundCents,
} from "./payment-shared";
import { SalesSessionPicker, useOpenSalesSessionSelection } from "@/components/CashSessions/SalesSessionPicker";
import { ORDER_STATUS_META } from "./tab-meta";

// ============================================================================
// Fechamento dentro do painel: total com a barra do que já foi informado,
// ajustes do total (desconto e acréscimo, como no checkout do PDV), os
// recebimentos parciais já feitos abatendo do total, divisão igual, um cartão
// por forma de pagamento e a conferência com o RESTANTE antes de confirmar.
// Restante zero: a conta fecha sem cartão de pagamento nenhum.
// ============================================================================

const SPLIT_MIN = 2;
const SPLIT_MAX = 12;

type TPaymentRow = {
	key: number;
	metodo: TPaymentMethodEnum;
	valor: number;
	/** Texto digitado, preservado enquanto o operador edita (vírgula, zeros à direita). */
	raw: string | null;
	contaFinanceiraId: string | null;
	/** Dinheiro: nota entregue pelo cliente. Só calcula o troco na tela — não vai para o fechamento. */
	recebido: number | null;
};

type TAdjustmentMode = "VALOR" | "PERCENTUAL";
type TAdjustment = { mode: TAdjustmentMode; amount: number; raw: string | null };
const EMPTY_ADJUSTMENT: TAdjustment = { mode: "VALOR", amount: 0, raw: null };
const SERVICE_FEE_PERCENT = 10;

/** Valor em R$ do ajuste: percentual incide sobre o consumo (taxa de serviço = 10% do consumo). */
function resolveAdjustment(adjustment: TAdjustment, subtotal: number) {
	const value = adjustment.mode === "PERCENTUAL" ? (subtotal * adjustment.amount) / 100 : adjustment.amount;
	return roundCents(Math.max(0, value));
}

/** Mesma conta do servidor (closeTab via resolveTabBalance): desconto limitado ao consumo, acréscimo por último, parciais abatidos. */
function computeCloseTotals({
	subtotal,
	discount,
	surcharge,
	jaPago,
}: {
	subtotal: number;
	discount: TAdjustment;
	surcharge: TAdjustment;
	jaPago: number;
}) {
	const descontoGeral = Math.min(resolveAdjustment(discount, subtotal), subtotal);
	const acrescimoGeral = resolveAdjustment(surcharge, subtotal);
	const balance = resolveTabBalance({ consumo: subtotal, descontoGeral, acrescimoGeral, jaPago });
	return { descontoGeral, acrescimoGeral, total: balance.valorTotal, restante: balance.restante, bloqueio: balance.bloqueio };
}

type ClosePaneProps = {
	tabId: string;
	tabLabel: string;
	/** Consumo da conta (líquido dos itens), antes dos ajustes do fechamento. */
	subtotal: number;
	/** Soma dos recebimentos parciais ativos — abate do total; o fechamento cobra o restante. */
	jaPago: number;
	partialCount: number;
	/** Bruto e desconto dos itens ativos — base do teto de desconto do vendedor. */
	itemsGross: number;
	itemsDiscount: number;
	/** Vendedor da venda rascunho: identidade avaliada pelo teto de desconto. */
	vendedorId: string | null;
	/** Venda rascunho da conta: é ela que o cupom imprime antes do fechamento. */
	draftSaleId: string | null;
	orderCount: number;
	itemCount: number;
	/** Pedidos que bloqueariam o fechamento: o fechamento os entrega junto (mesma transação). */
	pendingOrders: { id: string; numero: number; status: string }[];
	onBack: () => void;
	onClosed: () => void;
};

export function ClosePane({
	tabId,
	tabLabel,
	subtotal,
	jaPago,
	partialCount,
	itemsGross,
	itemsDiscount,
	vendedorId,
	draftSaleId,
	orderCount,
	itemCount,
	pendingOrders,
	onBack,
	onClosed,
}: ClosePaneProps) {
	const initialBalance = resolveTabBalance({ consumo: subtotal, jaPago });
	const [payments, setPayments] = useState<TPaymentRow[]>([
		{ key: 1, metodo: "PIX", valor: initialBalance.restante, raw: null, contaFinanceiraId: null, recebido: null },
	]);
	const [discount, setDiscount] = useState<TAdjustment>(EMPTY_ADJUSTMENT);
	const [surcharge, setSurcharge] = useState<TAdjustment>(EMPTY_ADJUSTMENT);
	const { descontoGeral, acrescimoGeral, total, restante, bloqueio } = computeCloseTotals({ subtotal, discount, surcharge, jaPago });
	// Parciais cobriram tudo: nada a cobrar, nenhum cartão de pagamento.
	const nothingToCollect = restante <= 0.009;

	// Ajuste muda o restante: com um único pagamento, ele acompanha; com vários, a
	// conferência mostra a diferença e o "Usar restante" resolve.
	function changeAdjustment(kind: "discount" | "surcharge", next: TAdjustment) {
		const nextTotals = computeCloseTotals({
			subtotal,
			discount: kind === "discount" ? next : discount,
			surcharge: kind === "surcharge" ? next : surcharge,
			jaPago,
		});
		if (kind === "discount") setDiscount(next);
		else setSurcharge(next);
		setPayments((prev) => (prev.length === 1 ? [{ ...prev[0], valor: nextTotals.restante, raw: null }] : prev));
	}

	// Teto de desconto: feedback imediato aqui, enforcement autoritativo na rota (mesmo do PDV).
	const { data: discountContext } = useSaleDiscountContext({ vendedorId });
	const discountAuthority = discountContext?.authority ?? null;
	const aggregatedDiscount = { valorBase: roundCents(itemsGross), descontoTotal: roundCents(descontoGeral + itemsDiscount) };
	const discountRequiresApproval =
		descontoGeral > 0 && discountAuthority ? evaluateDiscount({ authority: discountAuthority, ...aggregatedDiscount }) === "REQUER_APROVACAO" : false;
	const [isDiscountApprovalOpen, setIsDiscountApprovalOpen] = useState(false);
	const [discountApproval, setDiscountApproval] = useState<{ id: string; valorBase: number; descontoTotal: number } | null>(null);
	// Aprovação só vale para o desconto aprovado: mudou o valor, pede de novo.
	const validDiscountApproval =
		discountApproval &&
		discountApproval.valorBase === aggregatedDiscount.valorBase &&
		discountApproval.descontoTotal === aggregatedDiscount.descontoTotal
			? discountApproval
			: null;
	const [splitPeople, setSplitPeople] = useState(SPLIT_MIN);
	const { openSessions, sessaoVendaId, setSessaoVendaId, selectedSession } = useOpenSalesSessionSelection();
	const { data: financialAccounts } = usePOSFinancialAccounts();
	const accountOptions = (financialAccounts?.contas ?? []).map((conta) => ({ id: conta.id, value: conta.id, label: conta.nome }));
	const methodsWithEditableAccount = financialAccounts?.metodosComContaEditavel ?? [];

	// Cupom da conta antes de receber — o mesmo CUPOM_VENDA do histórico de vendas, impresso a partir
	// da venda rascunho com os ajustes que estão na tela (ainda não gravados até o fechamento).
	// Só aparece quando alguma impressora ativa atende a cupons.
	const { data: printers } = useAgentPrinters();
	const canPrintReceipt = !!draftSaleId && organizationHasPrinterForFinalidade(printers, "CUPOM_VENDA");
	const { mutate: printDraftReceipt, isPending: printReceiptPending } = useMutation({
		mutationKey: ["print-tab-receipt", tabId],
		mutationFn: () =>
			createManualPrintJob({
				finalidade: "CUPOM_VENDA",
				vendaId: draftSaleId,
				draftAdjustments: descontoGeral > 0 || acrescimoGeral > 0 ? { descontoGeral, acrescimoGeral } : null,
			}),
		onSuccess: (data) => toast.success(data.message),
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	// "Imprimir cupom ao fechar": começa na regra automática da organização (cupom ligado e com o
	// canal COMANDA) e vale só para este fechamento. Sem organização carregada, o switch não aparece
	// e o fechamento segue a regra no servidor.
	const { data: organization } = useOrganization();
	const receiptAutoPrintRule = organization?.configuracao.preferencias.impressoes?.automatica?.CUPOM_VENDA;
	const receiptOnCloseByDefault = !!receiptAutoPrintRule?.habilitada && !!receiptAutoPrintRule.canais?.includes("COMANDA");
	const [receiptOnCloseChoice, setReceiptOnCloseChoice] = useState<boolean | null>(null);
	const showReceiptOnClose = canPrintReceipt && !!organization;
	const printReceiptOnClose = receiptOnCloseChoice ?? receiptOnCloseByDefault;

	const { mutate, isPending } = useMutation({
		mutationKey: ["close-tab", tabId],
		mutationFn: closeTab,
		onSuccess: (data, variables) => {
			// A conta já fechou; um cupom pedido que não saiu vira só aviso.
			const receiptPrint = data.data.receiptPrint;
			if (variables.printReceipt && receiptPrint && receiptPrint.status !== "SOLICITADO") {
				toast.warning(
					receiptPrint.status === "ERRO"
						? `Conta fechada, mas o cupom não foi impresso: ${receiptPrint.error}`
						: "Conta fechada, mas nenhuma impressora ativa atende a cupons.",
				);
			} else {
				toast.success(data.message);
			}
			onClosed();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const effectivePayments = nothingToCollect ? [] : payments;
	const paid = roundCents(effectivePayments.reduce((sum, payment) => sum + payment.valor, 0));
	const difference = roundCents(restante - paid);
	const matches = !bloqueio && Math.abs(difference) <= 0.01;
	const splitShare = Math.floor((restante / splitPeople) * 100) / 100;

	function updatePayment(key: number, changes: Partial<TPaymentRow>) {
		setPayments((prev) => prev.map((payment) => (payment.key === key ? { ...payment, ...changes } : payment)));
	}

	function applySplit() {
		setPayments(
			Array.from({ length: splitPeople }, (_, index) => ({
				key: index + 1,
				metodo: "PIX" as const,
				// A última parte absorve o centavo que sobra da divisão.
				valor: index === splitPeople - 1 ? roundCents(restante - splitShare * (splitPeople - 1)) : splitShare,
				raw: null,
				contaFinanceiraId: null,
				recebido: null,
			})),
		);
	}

	function submit(descontoAprovacaoId: string | null) {
		mutate({
			tabId,
			descontoGeral: descontoGeral > 0 ? descontoGeral : null,
			acrescimoGeral: acrescimoGeral > 0 ? acrescimoGeral : null,
			descontoAprovacaoId,
			pagamentos: effectivePayments.map((payment) => ({
				metodo: payment.metodo,
				valor: payment.valor,
				efetivacaoTipo: "IMEDIATA",
				contaFinanceiraId: payment.contaFinanceiraId,
			})),
			sessaoVendaId,
			entregarPedidosEmAndamento: pendingOrders.length > 0,
			printReceipt: showReceiptOnClose ? printReceiptOnClose : null,
		});
	}

	function confirm() {
		if (!matches) return;
		if (discountRequiresApproval && !validDiscountApproval) {
			setIsDiscountApprovalOpen(true);
			return;
		}
		submit(validDiscountApproval?.id ?? null);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3.5">
				<Button size="icon" variant="ghost" className="size-8 rounded-lg" aria-label="Voltar aos pedidos" title="Voltar aos pedidos" onClick={onBack}>
					<ArrowLeft className="size-4" />
				</Button>
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="whitespace-nowrap text-xs font-bold uppercase tracking-wide">Fechar conta</span>
					<span className="truncate text-xs text-muted-foreground">{tabLabel}</span>
				</div>
				{canPrintReceipt ? (
					<Button
						variant="outline"
						className="h-8 gap-1.5 rounded-lg px-3 text-sm font-bold"
						title="Imprimir o cupom da conta com os ajustes atuais"
						disabled={printReceiptPending}
						onClick={() => printDraftReceipt()}
					>
						<Printer className="size-4" />
						Imprimir cupom
					</Button>
				) : null}
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
				{/* Antes dos pagamentos, para ser visto antes de digitar: o fechamento entrega o que ficou
				    pendente. Pedido não servido se cancela nos pedidos — entregue entra na conta. */}
				{pendingOrders.length > 0 ? (
					<div className="flex flex-col gap-2.5 rounded-xl bg-info-surface p-3.5 text-info-surface-foreground">
						<div className="flex items-start gap-2.5">
							<PackageCheck className="mt-0.5 size-4 shrink-0" />
							<div className="flex min-w-0 flex-col gap-0.5">
								<span className="text-sm font-bold">
									{pendingOrders.length === 1 ? "1 pedido ainda não foi entregue" : `${pendingOrders.length} pedidos ainda não foram entregues`}
								</span>
								<span className="text-xs">
									{pendingOrders.length === 1 ? "Ele será marcado como entregue" : "Eles serão marcados como entregues"} ao fechar a conta.
								</span>
							</div>
						</div>
						<div className="flex flex-wrap gap-1.5 pl-6.5">
							{pendingOrders.map((order) => {
								const statusMeta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.NAO_INICIADO;
								return (
									<span key={order.id} className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-bold text-foreground">
										Pedido {order.numero}
										<span className="font-semibold text-muted-foreground">· {statusMeta.label}</span>
									</span>
								);
							})}
						</div>
						<button
							type="button"
							onClick={onBack}
							className="ml-6.5 self-start rounded-md text-xs font-bold underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							Algum não foi servido? Voltar aos pedidos
						</button>
					</div>
				) : null}

				{/* Restante + progresso do que já foi informado. Com parciais, a composição aparece
				    sempre: o operador precisa ver de onde saiu o número. */}
				<div className="flex flex-col gap-3 rounded-xl bg-warning-surface p-4 text-warning-surface-foreground">
					<div className="flex items-end justify-between gap-3">
						<div className="flex flex-col gap-1.5">
							<span className="text-xs font-bold uppercase tracking-wide">{jaPago > 0 ? "Restante a receber" : "Total a receber"}</span>
							<span className="text-3xl font-bold leading-none tracking-tight text-foreground tabular-nums">{formatToMoney(restante)}</span>
						</div>
						<span className="whitespace-nowrap text-right text-xs font-semibold">
							{orderCount} {orderCount === 1 ? "pedido" : "pedidos"} · {itemCount} {itemCount === 1 ? "item" : "itens"}
						</span>
					</div>
					{descontoGeral > 0 || acrescimoGeral > 0 || jaPago > 0 ? (
						<div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold tabular-nums">
							<span>Consumo {formatToMoney(subtotal)}</span>
							{descontoGeral > 0 ? <span>Desconto −{formatToMoney(descontoGeral)}</span> : null}
							{acrescimoGeral > 0 ? <span>Acréscimo +{formatToMoney(acrescimoGeral)}</span> : null}
							{jaPago > 0 ? (
								<>
									<span>Total {formatToMoney(total)}</span>
									<span>
										Já pago −{formatToMoney(jaPago)}
										{partialCount > 1 ? ` (${partialCount})` : ""}
									</span>
								</>
							) : null}
						</div>
					) : null}
					{nothingToCollect ? null : (
						<div className="flex flex-col gap-1.5">
							<div
								className="h-1.5 overflow-hidden rounded-full bg-warning-surface-foreground/15"
								role="progressbar"
								aria-label="Valor informado"
								aria-valuemin={0}
								aria-valuemax={restante}
								aria-valuenow={paid}
							>
								<div
									className={cn(
										"h-full rounded-full transition-[width] duration-250 ease-out",
										matches ? "bg-success" : difference < 0 ? "bg-destructive" : "bg-brand",
									)}
									style={{ width: `${Math.min(100, restante ? (paid / restante) * 100 : 0)}%` }}
								/>
							</div>
							<div className="flex justify-between gap-2 whitespace-nowrap text-xs font-bold">
								<span>Informado {formatToMoney(paid)}</span>
								<span>{matches ? "Tudo certo" : difference > 0 ? `Faltam ${formatToMoney(difference)}` : `Sobram ${formatToMoney(-difference)}`}</span>
							</div>
						</div>
					)}
				</div>

				{/* Ajustes do total — desconto e acréscimo de cabeçalho, como no checkout do PDV */}
				<div className="flex flex-col divide-y divide-border rounded-xl border border-border">
					<AdjustmentRow
						icon={Tag}
						label="Desconto"
						hint="Sobre o consumo"
						adjustment={discount}
						resolvedValue={descontoGeral}
						sign="−"
						onChange={(next) => changeAdjustment("discount", next)}
					/>
					<AdjustmentRow
						icon={Percent}
						label="Acréscimo"
						hint="Taxa de serviço, couvert"
						adjustment={surcharge}
						resolvedValue={acrescimoGeral}
						sign="+"
						onChange={(next) => changeAdjustment("surcharge", next)}
						shortcut={{
							label: `Serviço ${SERVICE_FEE_PERCENT}%`,
							active: surcharge.mode === "PERCENTUAL" && surcharge.amount === SERVICE_FEE_PERCENT,
							apply: () => changeAdjustment("surcharge", { mode: "PERCENTUAL", amount: SERVICE_FEE_PERCENT, raw: null }),
						}}
					/>
				</div>
				{bloqueio ? (
					<div className="-mt-2 flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
						<CircleAlert className="size-4 shrink-0" />
						{bloqueio}
					</div>
				) : null}
				{discountRequiresApproval && !validDiscountApproval ? (
					<div className="-mt-2 flex items-center gap-2 rounded-xl bg-warning-surface px-3 py-2 text-xs font-semibold text-warning-surface-foreground">
						<CircleAlert className="size-4 shrink-0" />
						Desconto acima do limite do vendedor — o fechamento pedirá a aprovação de um gestor.
					</div>
				) : null}

				{nothingToCollect ? (
					<div className="flex items-center gap-2.5 rounded-xl bg-success-surface px-3.5 py-3 text-sm font-bold text-success-surface-foreground">
						<CircleCheck className="size-4 shrink-0" />
						{bloqueio ? "Nada a receber." : "Os recebimentos parciais cobrem a conta inteira. Nada a receber no fechamento."}
					</div>
				) : (
					<>
						{/* Divisão igual */}
						<div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
							<span className="flex min-w-0 items-center gap-2.5">
								<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
									<UsersRound className="size-4" />
								</span>
								<span className="flex min-w-0 flex-col">
									<span className="whitespace-nowrap text-sm font-bold">Dividir igualmente</span>
									<span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
										{splitPeople} × {formatToMoney(splitShare)}
									</span>
								</span>
							</span>
							<span className="flex shrink-0 items-center gap-1.5">
								<span className="flex items-center rounded-lg border border-border">
									<button
										type="button"
										aria-label="Menos pessoas"
										disabled={splitPeople <= SPLIT_MIN}
										className="flex size-8 items-center justify-center disabled:opacity-40"
										onClick={() => setSplitPeople((value) => Math.max(SPLIT_MIN, value - 1))}
									>
										<Minus className="size-3.5" />
									</button>
									<span className="w-6 text-center text-sm font-bold tabular-nums">{splitPeople}</span>
									<button
										type="button"
										aria-label="Mais pessoas"
										disabled={splitPeople >= SPLIT_MAX}
										className="flex size-8 items-center justify-center disabled:opacity-40"
										onClick={() => setSplitPeople((value) => Math.min(SPLIT_MAX, value + 1))}
									>
										<Plus className="size-3.5" />
									</button>
								</span>
								<Button size="sm" className="h-8 rounded-lg bg-foreground px-3 text-xs font-bold text-background hover:bg-foreground/90" onClick={applySplit}>
									Dividir
								</Button>
							</span>
						</div>

						{/* Pagamentos */}
						<div className="flex flex-col gap-2.5">
							<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pagamentos · {payments.length}</span>
							{payments.map((payment, index) => {
								const meta = METHOD_META[payment.metodo] ?? METHOD_META.OUTRO!;
								const MethodIcon = meta.icon;
								const others = paid - payment.valor;
								const rest = Math.max(0, roundCents(restante - others));
								const isCash = payment.metodo === "DINHEIRO";
								const change = payment.recebido !== null ? Math.max(0, roundCents(payment.recebido - payment.valor)) : null;

								return (
									<div key={payment.key} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs">
										<div className="flex items-center justify-between gap-2">
											<span className="flex items-center gap-2.5">
												<span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
													<MethodIcon className="size-4" />
												</span>
												<span className="flex flex-col">
													<span className="text-sm font-bold">{meta.label}</span>
													<span className="text-xs font-semibold text-muted-foreground">Pagamento {index + 1}</span>
												</span>
											</span>
											{payments.length > 1 ? (
												<Button
													size="icon"
													variant="ghost"
													className="size-7 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
													aria-label={`Remover pagamento ${index + 1}`}
													title="Remover pagamento"
													onClick={() => setPayments((prev) => prev.filter((item) => item.key !== payment.key))}
												>
													<Trash2 className="size-3.5" />
												</Button>
											) : null}
										</div>

										{/* Trocar o método invalida a conta escolhida: ela pertencia ao método anterior. */}
										<PaymentMethodPicker
											value={payment.metodo}
											onChange={(method) => updatePayment(payment.key, { metodo: method, contaFinanceiraId: null, recebido: null })}
										/>

										<div className="flex items-stretch gap-2">
											<label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-border px-3.5 focus-within:border-primary">
												<span className="text-sm font-bold text-muted-foreground">R$</span>
												<input
													inputMode="decimal"
													aria-label={`Valor do pagamento ${index + 1}`}
													value={payment.raw ?? formatInput(payment.valor)}
													onChange={(event) => updatePayment(payment.key, { raw: event.target.value, valor: parseInput(event.target.value) })}
													onBlur={() => updatePayment(payment.key, { raw: null })}
													className="min-w-0 flex-1 bg-transparent text-lg font-bold tabular-nums outline-none"
												/>
											</label>
											{Math.abs(rest - payment.valor) > 0.01 ? (
												<Button
													variant="outline"
													className="h-11 rounded-xl px-3 text-xs font-bold"
													onClick={() => updatePayment(payment.key, { valor: rest, raw: null })}
												>
													Usar restante
												</Button>
											) : null}
										</div>

										{isCash ? (
											<div className="flex flex-col gap-2 rounded-xl bg-secondary/40 px-3 py-2.5">
												<div className="flex items-center justify-between gap-2">
													<span className="text-xs font-bold text-muted-foreground">Recebido em mãos</span>
													<div className="flex gap-1">
														{[
															{ label: "Exato", value: payment.valor },
															...likelyNotes(payment.valor).map((note) => ({ label: formatToMoney(note).replace(/,00$/, ""), value: note })),
														].map((note) => {
															const active = payment.recebido !== null && Math.abs(payment.recebido - note.value) <= 0.001;
															return (
																<button
																	key={note.label}
																	type="button"
																	aria-pressed={active}
																	onClick={() => updatePayment(payment.key, { recebido: note.value })}
																	className={cn(
																		"h-7 whitespace-nowrap rounded-lg border px-2 text-xs font-bold",
																		active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
																	)}
																>
																	{note.label}
																</button>
															);
														})}
													</div>
												</div>
												<div className="flex items-center justify-between">
													<span className="flex items-center gap-1.5 text-sm font-bold">
														<HandCoins className="size-4" />
														Troco
													</span>
													<span className={cn("text-base font-bold tabular-nums", change !== null ? "text-success" : "text-muted-foreground")}>
														{change !== null ? formatToMoney(change) : "—"}
													</span>
												</div>
											</div>
										) : null}

										{methodsWithEditableAccount.includes(payment.metodo) && accountOptions.length > 0 ? (
											<SelectInput
												label="CONTA FINANCEIRA"
												value={payment.contaFinanceiraId}
												options={accountOptions}
												resetOptionLabel="CONTA PADRÃO DO MÉTODO"
												handleChange={(value) => updatePayment(payment.key, { contaFinanceiraId: value })}
												onReset={() => updatePayment(payment.key, { contaFinanceiraId: null })}
											/>
										) : null}
									</div>
								);
							})}
							<button
								type="button"
								className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm font-bold text-primary transition-colors hover:bg-primary/5"
								onClick={() =>
									setPayments((prev) => [
										...prev,
										{
											key: Math.max(...prev.map((payment) => payment.key)) + 1,
											metodo: "DINHEIRO",
											valor: Math.max(0, difference),
											raw: null,
											contaFinanceiraId: null,
											recebido: null,
										},
									])
								}
							>
								<Plus className="size-4" />
								Adicionar outra forma de pagamento
							</button>
						</div>
					</>
				)}

				<SalesSessionPicker openSessions={openSessions} selectedSession={selectedSession} onSelect={setSessaoVendaId} />
			</div>

			<div className="flex flex-col gap-2.5 border-t border-border bg-card px-4 pt-3 pb-4">
				<div
					className={cn(
						"flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold",
						matches ? "bg-success-surface text-success-surface-foreground" : "bg-destructive/10 text-destructive",
					)}
				>
					{matches ? <CircleCheck className="size-4" /> : <CircleAlert className="size-4" />}
					{bloqueio
						? "Estorne um recebimento parcial para fechar"
						: matches
							? nothingToCollect
								? "Conta paga pelos recebimentos parciais"
								: "Pagamentos conferem com o restante"
							: difference > 0
								? `Faltam ${formatToMoney(difference)}`
								: `Excedente de ${formatToMoney(-difference)}`}
				</div>
				{showReceiptOnClose ? (
					<label className="flex h-10 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border px-3 text-sm font-bold">
						<span className="flex items-center gap-2">
							<Printer className="size-4 text-muted-foreground" />
							Imprimir cupom ao fechar
						</span>
						<Switch checked={printReceiptOnClose} onCheckedChange={setReceiptOnCloseChoice} />
					</label>
				) : null}
				<Button variant="brand" size="lg" disabled={!matches || isPending} onClick={confirm}>
					<Receipt className="size-4" />
					{isPending
						? "Fechando..."
						: pendingOrders.length > 0
							? `Entregar ${pendingOrders.length} ${pendingOrders.length === 1 ? "pedido" : "pedidos"} e fechar · ${formatToMoney(restante)}`
							: `Confirmar fechamento · ${formatToMoney(restante)}`}
				</Button>
			</div>

			{isDiscountApprovalOpen ? (
				<DiscountApproval
					vendedorId={vendedorId}
					valorBase={aggregatedDiscount.valorBase}
					descontoTotal={aggregatedDiscount.descontoTotal}
					limiteSolicitante={
						discountAuthority && discountAuthority.limiteTipo
							? { tipo: discountAuthority.limiteTipo, valor: discountAuthority.limiteValor }
							: discountAuthority && !discountAuthority.aplicar
								? { tipo: null, valor: 0 }
								: null
					}
					closeModal={() => setIsDiscountApprovalOpen(false)}
					onApproved={(approvalRequestId) => {
						setDiscountApproval({ id: approvalRequestId, ...aggregatedDiscount });
						setIsDiscountApprovalOpen(false);
						submit(approvalRequestId);
					}}
				/>
			) : null}
		</div>
	);
}

type AdjustmentRowProps = {
	icon: LucideIcon;
	label: string;
	hint: string;
	adjustment: TAdjustment;
	resolvedValue: number;
	sign: "+" | "−";
	onChange: (next: TAdjustment) => void;
	shortcut?: { label: string; active: boolean; apply: () => void };
};

function AdjustmentRow({ icon: Icon, label, hint, adjustment, resolvedValue, sign, onChange, shortcut }: AdjustmentRowProps) {
	const isPercent = adjustment.mode === "PERCENTUAL";
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
			<span className="flex min-w-0 items-center gap-2.5">
				<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
					<Icon className="size-4" />
				</span>
				<span className="flex min-w-0 flex-col">
					<span className="whitespace-nowrap text-sm font-bold">{label}</span>
					<span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
						{resolvedValue > 0 ? `${sign}${formatToMoney(resolvedValue)}${isPercent ? ` · ${adjustment.amount}%` : ""}` : hint}
					</span>
				</span>
			</span>
			<span className="flex shrink-0 items-center gap-1.5">
				{shortcut ? (
					<button
						type="button"
						aria-pressed={shortcut.active}
						onClick={shortcut.active ? () => onChange(EMPTY_ADJUSTMENT) : shortcut.apply}
						className={cn(
							"h-8 whitespace-nowrap rounded-lg border px-2.5 text-xs font-bold transition-colors",
							shortcut.active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50",
						)}
					>
						{shortcut.label}
					</button>
				) : null}
				<span className="flex h-8 items-center rounded-lg border border-border p-0.5">
					{(["VALOR", "PERCENTUAL"] as const).map((mode) => (
						<button
							key={mode}
							type="button"
							aria-pressed={adjustment.mode === mode}
							aria-label={mode === "VALOR" ? `${label} em reais` : `${label} em percentual`}
							// Trocar a unidade zera o valor: 10 reais não viram 10%.
							onClick={() => adjustment.mode !== mode && onChange({ mode, amount: 0, raw: null })}
							className={cn(
								"h-full rounded-md px-2 text-xs font-bold transition-colors",
								adjustment.mode === mode ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
							)}
						>
							{mode === "VALOR" ? "R$" : "%"}
						</button>
					))}
				</span>
				<input
					inputMode="decimal"
					aria-label={`${label} (${isPercent ? "%" : "R$"})`}
					placeholder="0,00"
					value={adjustment.raw ?? (adjustment.amount > 0 ? formatInput(adjustment.amount) : "")}
					onChange={(event) => {
						const parsed = Math.max(0, parseInput(event.target.value));
						onChange({ ...adjustment, raw: event.target.value, amount: isPercent ? Math.min(100, parsed) : parsed });
					}}
					onBlur={() => onChange({ ...adjustment, raw: null })}
					className="h-8 w-20 rounded-lg border border-border bg-transparent px-2 text-right text-sm font-bold tabular-nums outline-none focus:border-primary"
				/>
			</span>
		</div>
	);
}
