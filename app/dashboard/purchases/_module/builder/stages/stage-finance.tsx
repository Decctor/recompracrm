"use client";

import { StageShell } from "@/app/dashboard/growth/campaigns/_module/builder/components/stage-shell";
import DateInput from "@/components/Inputs/DateInput";
import NumberInput from "@/components/Inputs/NumberInput";
import PurchaseTransactionsTable from "@/components/Modals/Purchases/Blocks/Utils/PurchaseTransactionsTable";
import { Button } from "@/components/ui/button";
import { formatDateForInputValue, formatDateOnInputChange, formatToMoney } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import { CircleAlert, CircleCheck, Landmark } from "lucide-react";
import { BUILDER_STAGES } from "../helpers/stages";
import { useBuilder } from "../components/builder-provider";
import { FieldLabel, ReadBadge, SectionLabel, TONE_CLASSES } from "../components/builder-ui";
import { useBuilderSummary } from "../components/use-builder-summary";
import { getFiscoObligations } from "../helpers/review-lines";

export default function StageFinance() {
	const {
		back,
		next,
		state,
		updateAccountingEntry,
		addAccountingEntryTransaction,
		updateAccountingEntryTransaction,
		removeAccountingEntryTransaction,
		readFields,
		clearReadField,
		lines,
	} = useBuilder();
	const summary = useBuilderSummary();
	const fiscoObligations = getFiscoObligations(lines);
	const fiscoTotal = fiscoObligations.reduce((total, obligation) => total + obligation.valor, 0);
	const stage = BUILDER_STAGES.finance;
	const entry = state.lancamentoContabil;
	const activeTransactions = entry.transacoes.filter((transaction) => !transaction.deletar);
	const itemsDiverge = summary.itemsCount > 0 && !summary.totalsMatch;

	return (
		<StageShell>
			<StageShell.Title icon={stage.icon} label={stage.label} description={stage.description} />
			<StageShell.Body className="gap-5">
				<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
					<div className="flex flex-col gap-1">
						<FieldLabel read={readFields.has("valor")}>VALOR EFETIVO (A PAGAR)</FieldLabel>
						<NumberInput
							label="VALOR EFETIVO (A PAGAR)"
							showLabel={false}
							placeholder="Quanto será efetivamente pago..."
							value={entry.valor}
							handleChange={(value) => {
								clearReadField("valor");
								updateAccountingEntry({ valor: value });
							}}
						/>
					</div>
					<div className="flex flex-col gap-1">
						<span className="flex items-center gap-2 text-sm font-medium tracking-tight text-foreground/80">
							DATA DE COMPETÊNCIA
							<ReadBadge show={readFields.has("dataCompetencia")} label="Emissão da nota" />
						</span>
						<DateInput
							label="DATA DE COMPETÊNCIA"
							showLabel={false}
							value={formatDateForInputValue(entry.dataCompetencia)}
							handleChange={(value) => {
								clearReadField("dataCompetencia");
								updateAccountingEntry({ dataCompetencia: (formatDateOnInputChange(value, "date") as Date) || entry.dataCompetencia });
							}}
						/>
					</div>
					<NumberInput
						label="VALOR PREVISTO (ORÇADO)"
						placeholder="Opcional"
						value={entry.valorPrevisto ?? null}
						handleChange={(value) => updateAccountingEntry({ valorPrevisto: value })}
					/>
				</div>

				<div className="flex flex-col gap-2">
					<SectionLabel>Conferência</SectionLabel>
					<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
						<CheckCard
							ok={!itemsDiverge}
							title={summary.itemsCount === 0 ? "Compra sem itens" : itemsDiverge ? "Itens não batem com o valor efetivo" : "Itens somam o valor efetivo"}
							subtitle={
								summary.itemsCount === 0
									? "O valor efetivo vale por si (serviços, por exemplo)."
									: itemsDiverge
										? `Itens ${formatToMoney(summary.itemsTotal)} · a pagar ${formatToMoney(summary.entryValue)}`
										: formatToMoney(summary.itemsTotal)
							}
						/>
						<CheckCard
							ok={summary.transactionsBalanced}
							title={
								summary.transactionsBalanced
									? "Transações somam o valor efetivo"
									: summary.transactionsRemaining < 0
										? "Transações passam do valor efetivo"
										: "Transações não cobrem o valor efetivo"
							}
							subtitle={`${activeTransactions.length} ${activeTransactions.length === 1 ? "transação" : "transações"} = ${formatToMoney(summary.transactionsTotal)}`}
						/>
					</div>
					{itemsDiverge ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="w-fit"
							onClick={() => {
								clearReadField("valor");
								updateAccountingEntry({ valor: summary.itemsTotal });
							}}
						>
							USAR TOTAL DOS ITENS ({formatToMoney(summary.itemsTotal)})
						</Button>
					) : null}
				</div>

				{fiscoObligations.length > 0 ? (
					<div className="flex flex-col gap-2">
						<SectionLabel>Obrigações com o fisco</SectionLabel>
						<div className="flex flex-col gap-2 rounded-xl border border-border p-3.5">
							<div className="flex items-center gap-2.5">
								<span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TONE_CLASSES.info)}>
									<Landmark className="h-4 w-4" />
								</span>
								<div className="flex flex-col">
									<p className="text-sm font-semibold">{formatToMoney(fiscoTotal)} a recolher à SEFAZ, fora do valor do fornecedor</p>
									<p className="text-xs text-muted-foreground">
										Ao receber a compra, vira um lançamento próprio (origem "Tributo de compra") com uma guia a pagar. Não entra nas transações abaixo.
									</p>
								</div>
							</div>
							<ul className="flex flex-col gap-1 text-xs">
								{fiscoObligations.map((obligation) => (
									<li key={obligation.chave} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-1.5">
										<span className="text-muted-foreground">
											{obligation.descricao ?? obligation.chave} · {obligation.linhas} {obligation.linhas === 1 ? "linha" : "linhas"}
										</span>
										<span className="font-mono font-semibold">{formatToMoney(obligation.valor)}</span>
									</li>
								))}
							</ul>
						</div>
					</div>
				) : null}

				<div className="flex flex-col gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-sm font-medium tracking-tight text-foreground/80">TRANSAÇÕES FINANCEIRAS</p>
						<ReadBadge show={readFields.has("transacoes")} label="Duplicatas da nota" />
					</div>
					<PurchaseTransactionsTable
						entryValue={entry.valor}
						competenceDate={entry.dataCompetencia}
						transactions={entry.transacoes}
						addTransaction={(transaction) => {
							clearReadField("transacoes");
							addAccountingEntryTransaction(transaction);
						}}
						updateTransaction={(params) => {
							clearReadField("transacoes");
							updateAccountingEntryTransaction(params);
						}}
						removeTransaction={(index) => {
							clearReadField("transacoes");
							removeAccountingEntryTransaction({ index });
						}}
					/>
				</div>
			</StageShell.Body>
			<StageShell.Footer
				onBack={back}
				onNext={next}
				nextDisabled={!summary.activeValidation.valid}
				nextDisabledReason={summary.activeValidation.reason}
			/>
		</StageShell>
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
