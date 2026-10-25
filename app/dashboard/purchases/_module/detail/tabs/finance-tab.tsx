"use client";

import DateInput from "@/components/Inputs/DateInput";
import NumberInput from "@/components/Inputs/NumberInput";
import PurchaseTransactionsTable from "@/components/Modals/Purchases/Blocks/Utils/PurchaseTransactionsTable";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { ACCOUNTING_ENTRY_BALANCE_TOLERANCE, getActiveTransactionsTotal } from "@/lib/finances/accounting-entry-balance";
import { formatDateForInputValue, formatDateOnInputChange, formatToMoney } from "@/lib/formatting";
import { appRoutes } from "@/lib/navigation/routes";
import { cn } from "@/lib/utils";
import type { TUsePurchaseState } from "@/state-hooks/use-purchase-state";
import { ArrowRightLeft, CircleAlert, CircleCheck, ExternalLink, FileText, Landmark, Lock } from "lucide-react";
import { formatDateAsLocale } from "@/lib/formatting";
import type { TPurchaseById } from "../helpers/hydrate";
import Link from "next/link";
import { TONE_CLASSES } from "../../builder/components/builder-ui";

type FinanceTabProps = {
	editor: TUsePurchaseState;
	editable: boolean;
	isReceived: boolean;
	itemsTotal: number;
	taxObligations: TPurchaseById["lancamentosTributos"];
};

export default function FinanceTab({ editor, editable, isReceived, itemsTotal, taxObligations }: FinanceTabProps) {
	const { state, updateAccountingEntry, addAccountingEntryTransaction, updateAccountingEntryTransaction, removeAccountingEntryTransaction } = editor;
	const entry = state.lancamentoContabil;
	const activeTransactions = entry.transacoes.filter((transaction) => !transaction.deletar);
	const transactionsTotal = getActiveTransactionsTotal(entry.transacoes);
	const remaining = Math.round((entry.valor - transactionsTotal) * 100) / 100;
	const balanced = Math.abs(remaining) <= ACCOUNTING_ENTRY_BALANCE_TOLERANCE;
	const hasItems = state.purchaseItems.some((item) => !item.deletar);
	const itemsMatch = !hasItems || Math.round(itemsTotal * 100) === Math.round(entry.valor * 100);
	// Once received, the value became stock and accounting lines: it is frozen with the items.
	const valueEditable = editable && !isReceived;

	return (
		<div className="flex w-full flex-col gap-6">
			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<FileText />
					</Section.Icon>
					<Section.Title>Lançamento contábil</Section.Title>
					{entry.id ? (
						<Section.Actions>
							<Button variant="ghost" size="xs" asChild className="flex items-center gap-1">
								<Link href={appRoutes.finance.entry(entry.id)}>
									<ExternalLink className="h-3 w-3" />
									ABRIR LANÇAMENTO
								</Link>
							</Button>
						</Section.Actions>
					) : null}
				</Section.Header>
				<Section.Body>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
						<div className="relative">
							<NumberInput
								label="VALOR EFETIVO (A PAGAR)"
								placeholder="Quanto será efetivamente pago..."
								value={entry.valor}
								editable={valueEditable}
								handleChange={(value) => updateAccountingEntry({ valor: value })}
							/>
							{isReceived ? <Lock className="pointer-events-none absolute right-3 bottom-2.5 h-3.5 w-3.5 text-muted-foreground" /> : null}
						</div>
						<DateInput
							label="DATA DE COMPETÊNCIA"
							value={formatDateForInputValue(entry.dataCompetencia)}
							editable={editable}
							handleChange={(value) => updateAccountingEntry({ dataCompetencia: (formatDateOnInputChange(value, "date") as Date) || entry.dataCompetencia })}
						/>
						<NumberInput
							label="VALOR PREVISTO (ORÇADO)"
							placeholder="Opcional"
							value={entry.valorPrevisto ?? null}
							editable={editable}
							handleChange={(value) => updateAccountingEntry({ valorPrevisto: value })}
						/>
					</div>
					<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
						<CheckCard
							ok={itemsMatch}
							title={!hasItems ? "Compra sem itens" : itemsMatch ? "Itens somam o valor efetivo" : "Itens não batem com o valor efetivo"}
							subtitle={
								!hasItems
									? "O valor efetivo vale por si (serviços, por exemplo)."
									: itemsMatch
										? formatToMoney(itemsTotal)
										: `Itens ${formatToMoney(itemsTotal)} · a pagar ${formatToMoney(entry.valor)}${isReceived ? "" : " · ajuste antes de receber"}`
							}
						/>
						<CheckCard
							ok={balanced}
							title={
								activeTransactions.length === 0
									? "Nenhuma transação programada"
									: balanced
										? "Transações somam o valor efetivo"
										: remaining < 0
											? "Transações passam do valor efetivo"
											: "Transações não cobrem o valor efetivo"
							}
							subtitle={`${activeTransactions.length} ${activeTransactions.length === 1 ? "transação" : "transações"} = ${formatToMoney(transactionsTotal)}`}
						/>
					</div>
					{!itemsMatch && valueEditable ? (
						<Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => updateAccountingEntry({ valor: itemsTotal })}>
							USAR TOTAL DOS ITENS ({formatToMoney(itemsTotal)})
						</Button>
					) : null}
				</Section.Body>
			</Section.Root>

			{taxObligations.length > 0 ? (
				<Section.Root>
					<Section.Header>
						<Section.Icon>
							<Landmark />
						</Section.Icon>
						<Section.Title>Obrigações com terceiros</Section.Title>
						<Section.Count>{taxObligations.length}</Section.Count>
					</Section.Header>
					<Section.Body>
						<p className="-mt-3 text-xs text-muted-foreground">
							DIFAL ou antecipação de ICMS (fisco) e frete de CT-e (transportadora) desta compra: lançamentos próprios, fora do valor do fornecedor.
							Vencimento e pagamento ficam no Financeiro.
						</p>
						{taxObligations.map((entry) => (
							<div key={entry.id} className="flex flex-col gap-1.5 rounded-xl border border-border px-3.5 py-3">
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<span className="text-sm font-semibold">{entry.titulo}</span>
									<span className="font-mono text-sm font-semibold">{formatToMoney(entry.valor)}</span>
								</div>
								{entry.transacoesFinanceiras.map((transaction) => (
									<div key={transaction.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
										<span>
											{transaction.titulo} · vence {formatDateAsLocale(transaction.dataPrevisao)}
										</span>
										<span className={cn("rounded-full px-2 py-0.5 font-semibold", transaction.dataEfetivacao ? TONE_CLASSES.ok : TONE_CLASSES.warn)}>
											{transaction.dataEfetivacao ? `Paga em ${formatDateAsLocale(transaction.dataEfetivacao)}` : "A pagar"}
										</span>
									</div>
								))}
							</div>
						))}
					</Section.Body>
				</Section.Root>
			) : null}

			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<ArrowRightLeft />
					</Section.Icon>
					<Section.Title>Transações financeiras</Section.Title>
					<Section.Count>{activeTransactions.length}</Section.Count>
				</Section.Header>
				<Section.Body>
					<p className="-mt-3 text-xs text-muted-foreground">
						{isReceived ? "A programação de pagamento continua editável depois do recebimento. " : ""}As transações precisam somar o{" "}
						<strong className="font-semibold text-foreground/80">VALOR EFETIVO</strong>.
					</p>
					<PurchaseTransactionsTable
						entryValue={entry.valor}
						competenceDate={entry.dataCompetencia}
						transactions={entry.transacoes}
						addTransaction={addAccountingEntryTransaction}
						updateTransaction={updateAccountingEntryTransaction}
						removeTransaction={(index) => removeAccountingEntryTransaction({ index })}
						editable={editable}
					/>
				</Section.Body>
			</Section.Root>
		</div>
	);
}

function CheckCard({ ok, title, subtitle }: { ok: boolean; title: string; subtitle: string }) {
	const Icon = ok ? CircleCheck : CircleAlert;
	return (
		<div className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2.5", ok ? TONE_CLASSES.ok : TONE_CLASSES.warn)}>
			<Icon className="h-4 w-4 shrink-0" />
			<div className="flex flex-col">
				<span className="text-xs font-semibold">{title}</span>
				<span className="text-[0.7rem]">{subtitle}</span>
			</div>
		</div>
	);
}
