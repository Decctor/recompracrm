"use client";
import SelectInput from "@/components/Inputs/SelectInput";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatToMoney } from "@/lib/formatting";
import { receiveTabPayment } from "@/lib/mutations/tabs";
import { usePOSFinancialAccounts } from "@/lib/queries/pos";
import { getTabPartialPaymentBlockReason, resolveTabPartialPaymentCap } from "@/lib/tabs/partial-payments";
import { cn } from "@/lib/utils";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, HandCoins, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	PaymentMethodPicker,
	SalesSessionPicker,
	formatInput,
	likelyNotes,
	parseInput,
	roundCents,
	useOpenSalesSessionSelection,
} from "./payment-shared";

// ============================================================================
// Recebimento parcial: alguem da mesa vai embora antes e paga a parte dela. Por
// valor, nao por itens — atalhos 1/N do consumo e "tudo o que falta". Um
// recebimento = um metodo; Joao pagando metade em Pix e metade em dinheiro sao
// dois recebimentos. O dinheiro entra no caixa na hora; o fechamento cobra o resto.
// ============================================================================

type PartialPaymentPaneProps = {
	tabId: string;
	tabLabel: string;
	/** Consumo da conta (liquido dos itens). */
	consumo: number;
	/** Soma dos parciais ativos. */
	jaPago: number;
	onBack: () => void;
	onReceived: () => void;
};

const SPLIT_SHORTCUTS = [2, 3, 4] as const;

export function PartialPaymentPane({ tabId, tabLabel, consumo, jaPago, onBack, onReceived }: PartialPaymentPaneProps) {
	const cap = resolveTabPartialPaymentCap({ consumo, jaPago });
	const [valor, setValor] = useState(0);
	const [raw, setRaw] = useState<string | null>(null);
	const [metodo, setMetodo] = useState<TPaymentMethodEnum>("PIX");
	const [contaFinanceiraId, setContaFinanceiraId] = useState<string | null>(null);
	const [payerName, setPayerName] = useState("");
	const [recebido, setRecebido] = useState<number | null>(null);
	const { openSessions, sessaoVendaId, setSessaoVendaId, selectedSession } = useOpenSalesSessionSelection();
	const { data: financialAccounts } = usePOSFinancialAccounts();
	const accountOptions = (financialAccounts?.contas ?? []).map((conta) => ({ id: conta.id, value: conta.id, label: conta.nome }));
	const methodsWithEditableAccount = financialAccounts?.metodosComContaEditavel ?? [];

	const { mutate, isPending } = useMutation({
		mutationKey: ["receive-tab-payment", tabId],
		mutationFn: receiveTabPayment,
		onSuccess: (data) => {
			toast.success(data.message);
			onReceived();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	const blockReason = valor > 0 ? getTabPartialPaymentBlockReason({ consumo, jaPago, valor }) : null;
	const canSubmit = valor > 0 && !blockReason && !isPending;
	const isCash = metodo === "DINHEIRO";
	const change = recebido !== null ? Math.max(0, roundCents(recebido - valor)) : null;
	const restanteDepois = roundCents(Math.max(0, cap - valor));

	function pick(value: number) {
		setValor(roundCents(value));
		setRaw(null);
		setRecebido(null);
	}

	function submit() {
		if (!canSubmit) return;
		mutate({
			tabId,
			payment: { metodo, valor, contaFinanceiraId, observacoes: null },
			payerName: payerName.trim() || null,
			sessaoVendaId,
		});
	}

	// Atalhos: fracoes do CONSUMO (o que a mesa dividiria), nao do restante — quem sai primeiro
	// paga a parte dele do todo. Limitados ao que ainda cabe.
	const shortcuts = [
		...SPLIT_SHORTCUTS.map((people) => ({ label: `1/${people}`, value: Math.min(cap, Math.floor((consumo / people) * 100) / 100) })),
		{ label: "Tudo", value: cap },
	].filter((shortcut, index, list) => shortcut.value > 0 && list.findIndex((other) => Math.abs(other.value - shortcut.value) < 0.005) === index);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3.5">
				<Button size="icon" variant="ghost" className="size-8 rounded-lg" aria-label="Voltar aos pedidos" title="Voltar aos pedidos" onClick={onBack}>
					<ArrowLeft className="size-4" />
				</Button>
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="whitespace-nowrap text-xs font-bold uppercase tracking-wide">Receber parcial</span>
					<span className="truncate text-xs text-muted-foreground">{tabLabel}</span>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
				<div className="flex flex-col gap-2 rounded-xl bg-warning-surface p-4 text-warning-surface-foreground">
					<div className="flex items-end justify-between gap-3">
						<div className="flex flex-col gap-1.5">
							<span className="text-xs font-bold uppercase tracking-wide">Falta receber</span>
							<span className="text-3xl font-bold leading-none tracking-tight text-foreground tabular-nums">{formatToMoney(cap)}</span>
						</div>
					</div>
					<div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold tabular-nums">
						<span>Consumo {formatToMoney(consumo)}</span>
						{jaPago > 0 ? <span>Já pago −{formatToMoney(jaPago)}</span> : null}
					</div>
					<span className="text-xs">Desconto e taxa de serviço entram só no fechamento. O parcial abate do total da conta.</span>
				</div>

				<div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs">
					<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Valor</span>
					<div className="flex flex-wrap gap-1.5">
						{shortcuts.map((shortcut) => {
							const active = Math.abs(shortcut.value - valor) < 0.005;
							return (
								<button
									key={shortcut.label}
									type="button"
									aria-pressed={active}
									onClick={() => pick(shortcut.value)}
									className={cn(
										"flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-colors",
										active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50",
									)}
								>
									{shortcut.label}
									<span className={cn("font-semibold tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
										{formatToMoney(shortcut.value)}
									</span>
								</button>
							);
						})}
					</div>
					<label className="flex h-11 items-center gap-2 rounded-xl border border-border px-3.5 focus-within:border-primary">
						<span className="text-sm font-bold text-muted-foreground">R$</span>
						<input
							inputMode="decimal"
							aria-label="Valor do recebimento"
							autoFocus
							value={raw ?? (valor > 0 ? formatInput(valor) : "")}
							placeholder="0,00"
							onChange={(event) => {
								setRaw(event.target.value);
								setValor(parseInput(event.target.value));
								setRecebido(null);
							}}
							onBlur={() => setRaw(null)}
							className="min-w-0 flex-1 bg-transparent text-lg font-bold tabular-nums outline-none"
						/>
					</label>
					{blockReason ? (
						<div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
							<CircleAlert className="size-4 shrink-0" />
							{blockReason}
						</div>
					) : valor > 0 ? (
						<span className="text-xs font-semibold text-muted-foreground tabular-nums">
							Depois deste recebimento faltam {formatToMoney(restanteDepois)}.
						</span>
					) : null}
				</div>

				<div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-2xs">
					<span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Forma de pagamento</span>
					<PaymentMethodPicker
						value={metodo}
						onChange={(method) => {
							setMetodo(method);
							setContaFinanceiraId(null);
							setRecebido(null);
						}}
					/>
					{isCash && valor > 0 ? (
						<div className="flex flex-col gap-2 rounded-xl bg-secondary/40 px-3 py-2.5">
							<div className="flex items-center justify-between gap-2">
								<span className="text-xs font-bold text-muted-foreground">Recebido em mãos</span>
								<div className="flex gap-1">
									{[
										{ label: "Exato", value: valor },
										...likelyNotes(valor).map((note) => ({ label: formatToMoney(note).replace(/,00$/, ""), value: note })),
									].map((note) => {
										const active = recebido !== null && Math.abs(recebido - note.value) <= 0.001;
										return (
											<button
												key={note.label}
												type="button"
												aria-pressed={active}
												onClick={() => setRecebido(note.value)}
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
					{methodsWithEditableAccount.includes(metodo) && accountOptions.length > 0 ? (
						<SelectInput
							label="CONTA FINANCEIRA"
							value={contaFinanceiraId}
							options={accountOptions}
							resetOptionLabel="CONTA PADRÃO DO MÉTODO"
							handleChange={(value) => setContaFinanceiraId(value)}
							onReset={() => setContaFinanceiraId(null)}
						/>
					) : null}
				</div>

				<label className="flex h-11 items-center gap-2 rounded-xl border border-border px-3.5 focus-within:border-primary">
					<UserRound className="size-4 shrink-0 text-muted-foreground" />
					<input
						aria-label="Quem pagou (opcional)"
						value={payerName}
						maxLength={80}
						placeholder="Quem pagou? (opcional)"
						onChange={(event) => setPayerName(event.target.value)}
						className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:font-medium placeholder:text-muted-foreground"
					/>
				</label>

				<SalesSessionPicker openSessions={openSessions} selectedSession={selectedSession} onSelect={setSessaoVendaId} />
			</div>

			<div className="flex flex-col gap-2.5 border-t border-border bg-card px-4 pt-3 pb-4">
				<Button variant="brand" size="lg" disabled={!canSubmit} onClick={submit}>
					<HandCoins className="size-4" />
					{isPending ? "Registrando..." : valor > 0 ? `Receber ${formatToMoney(valor)}` : "Receber"}
				</Button>
			</div>
		</div>
	);
}
