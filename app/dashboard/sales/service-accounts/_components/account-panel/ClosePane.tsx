"use client";
import type { TGetSalesSessionsOutput } from "@/app/api/pos/sales-sessions/route";
import SelectInput from "@/components/Inputs/SelectInput";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { closeTab } from "@/lib/mutations/tabs";
import { usePOSFinancialAccounts } from "@/lib/queries/pos";
import { cn } from "@/lib/utils";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
	ArrowLeft,
	ArrowRightLeft,
	Banknote,
	ChevronsUpDown,
	CircleAlert,
	CircleCheck,
	CreditCard,
	Ellipsis,
	HandCoins,
	type LucideIcon,
	Minus,
	Plus,
	QrCode,
	Receipt,
	Ticket,
	Trash2,
	UsersRound,
	WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// ============================================================================
// Fechamento dentro do painel: total com a barra do que já foi informado,
// divisão igual, um cartão por forma de pagamento e a conferência com o total
// antes de confirmar. Os quatro métodos do salão têm tile próprio; os demais
// vivem em "Outro". A conta financeira só aparece quando o método deixa
// escolher — mesmo contrato do modal CloseTab/POS.
// ============================================================================

type TMethodMeta = { label: string; tile: string; icon: LucideIcon };

const METHOD_META: Partial<Record<TPaymentMethodEnum, TMethodMeta>> = {
	PIX: { label: "Pix", tile: "Pix", icon: QrCode },
	DINHEIRO: { label: "Dinheiro", tile: "Dinheiro", icon: Banknote },
	CARTAO_CREDITO: { label: "Cartão de crédito", tile: "Crédito", icon: CreditCard },
	CARTAO_DEBITO: { label: "Cartão de débito", tile: "Débito", icon: WalletCards },
	TRANSFERENCIA: { label: "Transferência", tile: "Transf.", icon: ArrowRightLeft },
	VALE: { label: "Vale", tile: "Vale", icon: Ticket },
	OUTRO: { label: "Outro", tile: "Outro", icon: Ellipsis },
};
const TILE_METHODS: TPaymentMethodEnum[] = ["PIX", "DINHEIRO", "CARTAO_CREDITO", "CARTAO_DEBITO"];
const OTHER_METHODS: TPaymentMethodEnum[] = ["TRANSFERENCIA", "VALE", "OUTRO"];

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

const roundCents = (value: number) => Math.round(value * 100) / 100;
const formatInput = (value: number) => value.toFixed(2).replace(".", ",");
const parseInput = (raw: string) => Number.parseFloat(raw.replace(/\./g, "").replace(",", ".")) || 0;

/** Notas prováveis acima do valor: arredondamentos para 10/50/100 e as notas comuns. */
function likelyNotes(valor: number) {
	const candidates = [Math.ceil(valor / 10) * 10, Math.ceil(valor / 50) * 50, Math.ceil(valor / 100) * 100, 50, 100, 200];
	return [...new Set(candidates)]
		.filter((note) => note > valor + 0.001)
		.sort((a, b) => a - b)
		.slice(0, 2);
}

async function fetchOpenSalesSessions() {
	const { data } = await axios.get<TGetSalesSessionsOutput>("/api/pos/sales-sessions?status=ABERTA");
	return data.data.default?.sessions ?? [];
}
type TOpenSalesSession = Awaited<ReturnType<typeof fetchOpenSalesSessions>>[number];

function describeSession(session: TOpenSalesSession) {
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

type ClosePaneProps = {
	tabId: string;
	tabLabel: string;
	total: number;
	orderCount: number;
	itemCount: number;
	onBack: () => void;
	onClosed: () => void;
};

export function ClosePane({ tabId, tabLabel, total, orderCount, itemCount, onBack, onClosed }: ClosePaneProps) {
	const [payments, setPayments] = useState<TPaymentRow[]>([
		{ key: 1, metodo: "PIX", valor: total, raw: null, contaFinanceiraId: null, recebido: null },
	]);
	const [splitPeople, setSplitPeople] = useState(SPLIT_MIN);
	const [sessaoVendaId, setSessaoVendaId] = useState<string | null>(null);

	const { data: openSessions } = useQuery({ queryKey: ["open-sales-sessions"], queryFn: fetchOpenSalesSessions });
	useEffect(() => {
		if (openSessions?.length === 1) setSessaoVendaId((current) => current ?? openSessions[0].id);
	}, [openSessions]);
	const { data: financialAccounts } = usePOSFinancialAccounts();
	const accountOptions = (financialAccounts?.contas ?? []).map((conta) => ({ id: conta.id, value: conta.id, label: conta.nome }));
	const methodsWithEditableAccount = financialAccounts?.metodosComContaEditavel ?? [];

	const { mutate, isPending } = useMutation({
		mutationKey: ["close-tab", tabId],
		mutationFn: closeTab,
		onSuccess: (data) => {
			toast.success(data.message);
			onClosed();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const paid = roundCents(payments.reduce((sum, payment) => sum + payment.valor, 0));
	const difference = roundCents(total - paid);
	const matches = Math.abs(difference) <= 0.01;
	const splitShare = Math.floor((total / splitPeople) * 100) / 100;

	function updatePayment(key: number, changes: Partial<TPaymentRow>) {
		setPayments((prev) => prev.map((payment) => (payment.key === key ? { ...payment, ...changes } : payment)));
	}

	function applySplit() {
		setPayments(
			Array.from({ length: splitPeople }, (_, index) => ({
				key: index + 1,
				metodo: "PIX" as const,
				// A última parte absorve o centavo que sobra da divisão.
				valor: index === splitPeople - 1 ? roundCents(total - splitShare * (splitPeople - 1)) : splitShare,
				raw: null,
				contaFinanceiraId: null,
				recebido: null,
			})),
		);
	}

	function confirm() {
		if (!matches) return;
		mutate({
			tabId,
			pagamentos: payments.map((payment) => ({
				metodo: payment.metodo,
				valor: payment.valor,
				efetivacaoTipo: "IMEDIATA",
				contaFinanceiraId: payment.contaFinanceiraId,
			})),
			sessaoVendaId,
		});
	}

	const selectedSession = (openSessions ?? []).find((session) => session.id === sessaoVendaId) ?? null;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3.5">
				<Button size="icon" variant="ghost" className="size-8 rounded-lg" aria-label="Voltar aos pedidos" title="Voltar aos pedidos" onClick={onBack}>
					<ArrowLeft className="size-4" />
				</Button>
				<div className="flex flex-col">
					<span className="whitespace-nowrap text-xs font-bold uppercase tracking-wide">Fechar conta</span>
					<span className="text-xs text-muted-foreground">{tabLabel}</span>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
				{/* Total + progresso do que já foi informado */}
				<div className="flex flex-col gap-3 rounded-xl bg-warning-surface p-4 text-warning-surface-foreground">
					<div className="flex items-end justify-between gap-3">
						<div className="flex flex-col gap-1.5">
							<span className="text-xs font-bold uppercase tracking-wide">Total a receber</span>
							<span className="text-3xl font-bold leading-none tracking-tight text-foreground tabular-nums">{formatToMoney(total)}</span>
						</div>
						<span className="whitespace-nowrap text-right text-xs font-semibold">
							{orderCount} {orderCount === 1 ? "pedido" : "pedidos"} · {itemCount} {itemCount === 1 ? "item" : "itens"}
						</span>
					</div>
					<div className="flex flex-col gap-1.5">
						<div
							className="h-1.5 overflow-hidden rounded-full bg-warning-surface-foreground/15"
							role="progressbar"
							aria-label="Valor informado"
							aria-valuemin={0}
							aria-valuemax={total}
							aria-valuenow={paid}
						>
							<div
								className={cn(
									"h-full rounded-full transition-[width] duration-250 ease-out",
									matches ? "bg-success" : difference < 0 ? "bg-destructive" : "bg-brand",
								)}
								style={{ width: `${Math.min(100, total ? (paid / total) * 100 : 0)}%` }}
							/>
						</div>
						<div className="flex justify-between gap-2 whitespace-nowrap text-xs font-bold">
							<span>Informado {formatToMoney(paid)}</span>
							<span>{matches ? "Tudo certo" : difference > 0 ? `Faltam ${formatToMoney(difference)}` : `Sobram ${formatToMoney(-difference)}`}</span>
						</div>
					</div>
				</div>

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
						const rest = Math.max(0, roundCents(total - others));
						const isOther = OTHER_METHODS.includes(payment.metodo);
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

								<div className="grid grid-cols-5 gap-1.5">
									{TILE_METHODS.map((method) => {
										const tileMeta = METHOD_META[method]!;
										return (
											<MethodTile
												key={method}
												icon={tileMeta.icon}
												label={tileMeta.tile}
												active={payment.metodo === method}
												// Trocar o método invalida a conta escolhida: ela pertencia ao método anterior.
												onClick={() => updatePayment(payment.key, { metodo: method, contaFinanceiraId: null, recebido: null })}
											/>
										);
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
													<DropdownMenuItem key={method} onClick={() => updatePayment(payment.key, { metodo: method, contaFinanceiraId: null, recebido: null })}>
														<OtherIcon className="size-4" />
														{otherMeta.label}
													</DropdownMenuItem>
												);
											})}
										</DropdownMenuContent>
									</DropdownMenu>
								</div>

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

				{(openSessions ?? []).length > 0 ? (
					<div className="flex flex-col gap-1.5">
						<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Sessão de caixa</span>
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
												<span className="text-sm font-bold text-muted-foreground">Sem sessão de caixa</span>
											</span>
										)}
										<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
									</button>
								}
							/>
							<DropdownMenuContent align="start" className="w-(--anchor-width)">
								{(openSessions ?? []).map((session) => (
									<DropdownMenuItem key={session.id} onClick={() => setSessaoVendaId(session.id)}>
										<SessionLine session={session} />
									</DropdownMenuItem>
								))}
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => setSessaoVendaId(null)}>Sem sessão de caixa</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				) : null}
			</div>

			<div className="flex flex-col gap-2.5 border-t border-border bg-card px-4 pt-3 pb-4">
				<div
					className={cn(
						"flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold",
						matches ? "bg-success-surface text-success-surface-foreground" : "bg-destructive/10 text-destructive",
					)}
				>
					{matches ? <CircleCheck className="size-4" /> : <CircleAlert className="size-4" />}
					{matches
						? "Pagamentos conferem com o total"
						: difference > 0
							? `Faltam ${formatToMoney(difference)}`
							: `Excedente de ${formatToMoney(-difference)}`}
				</div>
				<Button variant="brand" size="lg" disabled={!matches || isPending} onClick={confirm}>
					<Receipt className="size-4" />
					{isPending ? "Fechando..." : `Confirmar fechamento · ${formatToMoney(total)}`}
				</Button>
			</div>
		</div>
	);
}

type MethodTileProps = Omit<React.ComponentProps<"button">, "children"> & { icon: LucideIcon; label: string; active: boolean };

function MethodTile({ icon: Icon, label, active, className, ...props }: MethodTileProps) {
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

function SessionLine({ session }: { session: TOpenSalesSession }) {
	const { title, detail } = describeSession(session);
	return (
		<span className="flex min-w-0 items-center gap-2.5">
			<span className="size-2 shrink-0 rounded-full bg-success" aria-hidden />
			<span className="whitespace-nowrap text-sm font-bold">{title}</span>
			<span className="truncate text-xs text-muted-foreground">{detail}</span>
		</span>
	);
}
