"use client";

import { getPurchaseDestinationLabel, PurchaseDestinationSelect } from "@/app/dashboard/purchases/components/PurchaseDestinationSelect";
import DateInput from "@/components/Inputs/DateInput";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { invalidateFinanceQueries } from "@/lib/finances/invalidate-finance-queries";
import { formatDateAsLocale, formatDateForInputValue, formatDateOnInputChange, formatToMoney } from "@/lib/formatting";
import { cancelPurchase } from "@/lib/mutations/purchases";
import {
	getDefaultCancellationResolution,
	getResolvableTransactions,
	isTransactionPaid,
	PURCHASE_CANCELLATION_PAID_RESOLUTIONS,
	PURCHASE_CANCELLATION_PENDING_RESOLUTIONS,
	PURCHASE_CANCELLATION_RESOLUTION_LABELS,
	planPurchaseCancellation,
} from "@/lib/purchase-processing/purchase-cancellation";
import { usePurchaseDestinationAccounts } from "@/lib/queries/purchases";
import { cn } from "@/lib/utils";
import type { TPurchaseCancellationTransactionResolutionEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TONE_CLASSES } from "../../builder/components/builder-ui";
import type { TPurchaseById } from "../helpers/hydrate";

type CancelPurchaseDialogProps = {
	purchase: TPurchaseById;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function addDays(date: Date, days: number) {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

/**
 * Cancelar uma compra estorna o lançamento contábil e pede uma decisão para cada parcela: a pendente é
 * cancelada ou mantida; a paga volta como devolução a receber ou fica como perda. O que fica com a
 * organização sem contrapartida (mantidas + perdas) é o custo do cancelamento, lançado na conta escolhida.
 * Ver lib/purchase-processing/purchase-cancellation.ts.
 */
export default function CancelPurchaseDialog({ purchase, open, onOpenChange }: CancelPurchaseDialogProps) {
	const queryClient = useQueryClient();
	const isReceived = purchase.status === "RECEBIDA";
	const transactions = useMemo(() => getResolvableTransactions(purchase.lancamentoContabil?.transacoesFinanceiras ?? []), [purchase]);
	const [resolutions, setResolutions] = useState<Record<string, TPurchaseCancellationTransactionResolutionEnum>>(() =>
		Object.fromEntries(transactions.map((transaction) => [transaction.id, getDefaultCancellationResolution(transaction)])),
	);
	const [refundDates, setRefundDates] = useState<Record<string, Date>>(() =>
		Object.fromEntries(transactions.map((transaction) => [transaction.id, addDays(new Date(), 7)])),
	);
	const [reason, setReason] = useState("");
	const [lossAccountId, setLossAccountId] = useState<string | null>(null);
	const { data: accounts } = usePurchaseDestinationAccounts({ enabled: open });
	const effectiveLossAccountId = lossAccountId ?? accounts?.contaPerdaPadraoId ?? null;

	const plan = useMemo(() => {
		try {
			return planPurchaseCancellation({ transactions, resolutions: new Map(Object.entries(resolutions)) });
		} catch {
			return null;
		}
	}, [transactions, resolutions]);
	const needsLossAccount = !!plan && plan.valorRetido > 0;
	const missingLossAccount = needsLossAccount && !effectiveLossAccountId;

	const { mutate, isPending } = useMutation({
		mutationKey: ["cancel-purchase", purchase.id],
		mutationFn: cancelPurchase,
		onSuccess: async (data) => {
			toast.success(data.message);
			onOpenChange(false);
			void invalidateFinanceQueries(queryClient, { accountingEntryId: purchase.lancamentoContabilId ?? undefined });
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["purchase-by-id", purchase.id] }),
				queryClient.invalidateQueries({ queryKey: ["purchases"] }),
			]);
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function submit() {
		mutate({
			purchaseId: purchase.id,
			reason: reason.trim() || null,
			lossAccountId: needsLossAccount ? effectiveLossAccountId : null,
			transactionResolutions: transactions.map((transaction) => {
				const resolution = resolutions[transaction.id] ?? getDefaultCancellationResolution(transaction);
				return {
					transactionId: transaction.id,
					resolution,
					refundForecastDate: resolution === "DEVOLUCAO" ? (refundDates[transaction.id] ?? new Date()).toISOString() : null,
				};
			}),
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] max-w-xl flex-col">
				<DialogHeader>
					<DialogTitle>Cancelar compra</DialogTitle>
					<DialogDescription>
						{isReceived
							? "A entrada no estoque é estornada e os lotes são descartados (só é possível se nenhum lote desta compra foi usado)."
							: "A compra deixa de valer e não poderá mais ser editada."}{" "}
						O lançamento contábil é estornado. Decida o que acontece com cada parcela.
					</DialogDescription>
				</DialogHeader>

				<div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
					{transactions.length === 0 ? (
						<p className="text-xs text-muted-foreground">Esta compra não tem parcelas.</p>
					) : (
						<div className="flex flex-col overflow-hidden rounded-md border border-border">
							{transactions.map((transaction) => {
								const paid = isTransactionPaid(transaction);
								const options = paid ? PURCHASE_CANCELLATION_PAID_RESOLUTIONS : PURCHASE_CANCELLATION_PENDING_RESOLUTIONS;
								const current = resolutions[transaction.id] ?? getDefaultCancellationResolution(transaction);
								return (
									<div key={transaction.id} className="flex flex-col gap-2 border-t border-border px-3 py-2.5 first:border-t-0">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<div className="flex min-w-0 flex-col">
												<span className="truncate text-xs font-medium">{transaction.titulo}</span>
												<span className="text-[0.7rem] text-muted-foreground">
													{paid
														? `Paga em ${formatDateAsLocale(transaction.dataEfetivacao)}`
														: `Pendente · vence ${formatDateAsLocale(transaction.dataPrevisao)}`}
												</span>
											</div>
											<span className="font-mono text-xs font-semibold">{formatToMoney(transaction.valor)}</span>
										</div>
										<div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`O que fazer com ${transaction.titulo}`}>
											{options.map((option) => (
												<button
													key={option}
													type="button"
													role="radio"
													aria-checked={current === option}
													title={PURCHASE_CANCELLATION_RESOLUTION_LABELS[option].description}
													onClick={() => setResolutions((previous) => ({ ...previous, [transaction.id]: option }))}
													className={cn(
														"h-7 rounded-full border px-2.5 text-xs font-medium transition-colors",
														current === option ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted/50",
													)}
												>
													{PURCHASE_CANCELLATION_RESOLUTION_LABELS[option].label}
												</button>
											))}
										</div>
										<p className="text-[0.7rem] text-muted-foreground">{PURCHASE_CANCELLATION_RESOLUTION_LABELS[current].description}</p>
										{current === "DEVOLUCAO" ? (
											<div className="max-w-[220px]">
												<DateInput
													label="DEVOLUÇÃO PREVISTA PARA"
													labelClassName="text-[0.7rem]"
													value={formatDateForInputValue(refundDates[transaction.id] ?? new Date())}
													handleChange={(value) =>
														setRefundDates((previous) => ({
															...previous,
															[transaction.id]: (formatDateOnInputChange(value, "date") as Date | null) ?? new Date(),
														}))
													}
												/>
											</div>
										) : null}
									</div>
								);
							})}
						</div>
					)}

					{needsLossAccount ? (
						<div className="flex flex-col gap-1.5">
							<span className="text-[0.7rem] font-medium uppercase text-muted-foreground">Conta do custo do cancelamento</span>
							<PurchaseDestinationSelect
								value={effectiveLossAccountId}
								onChange={(accountId) => setLossAccountId(accountId)}
								accounts={accounts}
								allowStock={false}
								natures={["DESPESA", "CUSTO"]}
								placeholder={effectiveLossAccountId ? undefined : "Escolha uma conta"}
								size="sm"
								className="w-fit"
							/>
						</div>
					) : null}

					<Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo do cancelamento (opcional)" maxLength={500} />

					{plan ? (
						<ul className="flex flex-col gap-1 rounded-md bg-muted/60 px-3 py-2.5 text-xs">
							{isReceived ? <li>Os itens que entraram no estoque saem dele.</li> : null}
							{plan.valorCancelado > 0 ? <li>{formatToMoney(plan.valorCancelado)} deixam de ser devidos ao fornecedor.</li> : null}
							{plan.valorDevolucao > 0 ? <li>{formatToMoney(plan.valorDevolucao)} entram como devolução a receber.</li> : null}
							{plan.valorRetido > 0 ? (
								<li>
									{formatToMoney(plan.valorRetido)} ficam como custo do cancelamento
									{effectiveLossAccountId ? ` em ${getPurchaseDestinationLabel(effectiveLossAccountId, accounts)}` : ""}
									{plan.valorMantido > 0 ? ` (${formatToMoney(plan.valorMantido)} ainda a pagar)` : ""}.
								</li>
							) : null}
						</ul>
					) : null}
					{missingLossAccount ? (
						<p className={cn("flex gap-1.5 rounded-md px-3 py-2 text-xs", TONE_CLASSES.warn)}>
							<CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
							Escolha a conta que vai receber o custo do cancelamento.
						</p>
					) : null}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						VOLTAR
					</Button>
					<LoadingButton variant="destructive" loading={isPending} disabled={!plan || missingLossAccount} onClick={submit}>
						CANCELAR COMPRA
					</LoadingButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
