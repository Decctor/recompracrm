"use client";

import DateInput from "@/components/Inputs/DateInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import DeleteRowButton from "@/components/Spreadsheet/DeleteRowButton";
import EditableDateCell from "@/components/Spreadsheet/EditableDateCell";
import EditableNumberCell from "@/components/Spreadsheet/EditableNumberCell";
import EditableTextCell from "@/components/Spreadsheet/EditableTextCell";
import MobileEditableField from "@/components/Spreadsheet/MobileEditableField";
import SpreadsheetCellWrapper from "@/components/Spreadsheet/SpreadsheetCellWrapper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ACCOUNTING_ENTRY_BALANCE_TOLERANCE, distributeTotalEqually, getActiveTransactionsTotal } from "@/lib/finances/accounting-entry-balance";
import { formatDateForInputValue, formatDateOnInputChange, formatToMoney } from "@/lib/formatting";
import { useFinancesAccounts } from "@/lib/queries/finances";
import {
	consumeProgrammaticSpreadsheetFocus,
	handleSpreadsheetNavigationKeyDown,
	SPREADSHEET_TABLE_ATTR,
	type SpreadsheetGridBounds,
} from "@/lib/spreadsheet-navigation";
import { cn } from "@/lib/utils";
import type { TFinancialTransaction } from "@/schemas/financial";
import { FinancialTransactionTypeOptions, SalePaymentMethodsOptions } from "@/utils/select-options";
import dayjs from "dayjs";
import { ArrowDown, ArrowUp, BadgeDollarSign, CheckCircle2, CircleAlert, Layers3, Plus, TriangleAlert } from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";
import { toast } from "sonner";

const TRANSACTION_GRID_COL = {
	TITLE: 0,
	TYPE: 1,
	METHOD: 2,
	ACCOUNT: 3,
	FORECAST: 4,
	EFFECTED: 5,
	VALUE: 6,
} as const;

const TRANSACTION_GRID_COL_COUNT = 7;

const CELL_TRIGGER_CLASSNAME =
	"h-8 justify-between rounded-md border-transparent bg-transparent px-2 text-xs font-medium shadow-none hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40";

const PAYMENT_METHOD_OPTIONS = SalePaymentMethodsOptions.map((option) => ({
	id: option.id,
	value: option.value,
	label: option.label,
	startContent: option.icon,
}));

type TAccountOption = { id: string; value: string; label: string };

type TNewAccountingEntryTransaction = Omit<TFinancialTransaction, "organizacaoId" | "lancamentoContabilId" | "autorId" | "dataInsercao">;

export type TAccountingEntryTransactionRow = TNewAccountingEntryTransaction & {
	id?: string | null;
	deletar?: boolean | null;
};

type TAccountingEntryTransactionPatch = Partial<Omit<TAccountingEntryTransactionRow, "id" | "deletar">>;

type PurchaseTransactionsTableProps = {
	entryValue: number;
	competenceDate: Date;
	transactions: TAccountingEntryTransactionRow[];
	addTransaction: (transaction: TNewAccountingEntryTransaction) => void;
	updateTransaction: (params: { index: number; item: TAccountingEntryTransactionPatch }) => void;
	removeTransaction: (index: number) => void;
	defaultTransactionType?: TAccountingEntryTransactionRow["tipo"];
	editable?: boolean;
};

function getTransactionValuePatch(valor: number): TAccountingEntryTransactionPatch {
	return {
		valor,
		valorBase: valor,
		valorJuros: 0,
		valorMulta: 0,
		valorTaxas: 0,
		valorDesconto: 0,
		modificadoresMetadata: null,
	};
}

/**
 * Tabela inline das transações financeiras que quitam o lançamento contábil da compra.
 * Segue o mesmo padrão da tabela de itens: células editáveis com navegação por teclado e uma
 * linha rascunho que se confirma quando os campos mínimos estão preenchidos.
 */
export default function PurchaseTransactionsTable({
	entryValue,
	competenceDate,
	transactions,
	addTransaction,
	updateTransaction,
	removeTransaction,
	defaultTransactionType = "SAIDA",
	editable = true,
}: PurchaseTransactionsTableProps) {
	const { data: financialAccountsData } = useFinancesAccounts({
		initialFilters: { activeOnly: true, stats: false },
	});
	const accountOptions: TAccountOption[] = useMemo(
		() =>
			(financialAccountsData?.accounts ?? []).map((account) => ({
				id: account.id,
				value: account.id,
				label: account.nome,
			})),
		[financialAccountsData],
	);

	const visibleTransactions = useMemo(
		() => transactions.map((transaction, index) => ({ transaction, index })).filter(({ transaction }) => !transaction.deletar),
		[transactions],
	);
	const transactionsTotal = getActiveTransactionsTotal(transactions);
	const missingTotal = entryValue - transactionsTotal;
	const hasTransactions = visibleTransactions.length > 0;
	const entryValueIsDefined = entryValue > 0;
	const isBalanced = hasTransactions && Math.abs(missingTotal) <= ACCOUNTING_ENTRY_BALANCE_TOLERANCE;
	const hasExceededTotal = hasTransactions && missingTotal < -ACCOUNTING_ENTRY_BALANCE_TOLERANCE;
	const progressValue = entryValueIsDefined ? Math.min(100, Math.max(0, (transactionsTotal / entryValue) * 100)) : 0;
	// A barra satura em 100%, então o excedente precisa ser dito com número, não com preenchimento.
	const overflowRatio = entryValueIsDefined && hasExceededTotal ? transactionsTotal / entryValue : 1;

	const status: "SEM TRANSAÇÕES" | "BALANCEADO" | "EXCEDENTE" | "PENDENTE" = !hasTransactions
		? "SEM TRANSAÇÕES"
		: isBalanced
			? "BALANCEADO"
			: hasExceededTotal
				? "EXCEDENTE"
				: "PENDENTE";

	const gridBounds: SpreadsheetGridBounds = useMemo(
		() => ({
			rowCount: visibleTransactions.length + (editable && entryValueIsDefined ? 1 : 0),
			colCount: TRANSACTION_GRID_COL_COUNT,
		}),
		[visibleTransactions.length, entryValueIsDefined, editable],
	);

	function handleRemove(index: number) {
		const removed = transactions[index];
		removeTransaction(index);
		if (!removed) return;
		toast.success(`Transação "${removed.titulo || "sem título"}" removida.`, {
			action: {
				label: "DESFAZER",
				// A remoção de uma transação já persistida é soft-delete (deletar: true), então desfazer é
				// limpar a flag; para uma linha nova, reinserimos ao final.
				onClick: () => (removed.id ? updateTransaction({ index, item: { deletar: false } }) : addTransaction(removed)),
			},
		});
	}

	function handleGenerateInstallments(config: { count: number; intervalDays: number; firstDate: Date }) {
		const remaining = missingTotal;
		if (remaining <= 0) {
			toast.error("Não há valor restante para parcelar.");
			return;
		}
		const amounts = distributeTotalEqually(remaining, config.count);
		const startingParcel = visibleTransactions.length;
		for (const [index, amount] of amounts.entries()) {
			addTransaction({
				contaFinanceiraId: null,
				titulo: `Parcela ${startingParcel + index + 1}/${startingParcel + config.count}`,
				tipo: defaultTransactionType,
				valor: amount,
				metodo: "A_DEFINIR",
				dataPrevisao: dayjs(config.firstDate)
					.add(index * config.intervalDays, "day")
					.toDate(),
				dataEfetivacao: null,
				parcela: startingParcel + index + 1,
				totalParcelas: startingParcel + config.count,
			});
		}
		toast.success(`${config.count} parcelas geradas somando ${formatToMoney(remaining)}.`);
	}

	return (
		<div className="flex w-full flex-col gap-2">
			<div
				className={cn("flex w-full flex-col gap-3 rounded-md border p-3", {
					"border-border bg-muted/30": !hasTransactions || isBalanced,
					// O estado que bloqueia o salvamento não pode ser o mais discreto da tela.
					"border-destructive/40 bg-destructive/5": hasTransactions && !isBalanced,
				})}
			>
				<div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex min-w-0 flex-col gap-1">
						<div className="flex flex-wrap items-center gap-2">
							<p className="text-sm font-semibold tracking-tight text-foreground">Cobertura financeira</p>
							<Badge
								variant={isBalanced ? "secondary" : hasTransactions ? "destructive" : "outline"}
								className={cn("flex h-fit items-center gap-1.5 rounded-md py-1", {
									"bg-green-500/10 text-green-700 dark:text-green-400": isBalanced,
								})}
							>
								{isBalanced ? (
									<CheckCircle2 className="h-4 min-h-4 w-4 min-w-4" />
								) : hasTransactions ? (
									<CircleAlert className="h-4 min-h-4 w-4 min-w-4" />
								) : (
									<TriangleAlert className="h-4 min-h-4 w-4 min-w-4" />
								)}
								{status}
							</Badge>
						</div>
						<p aria-live="polite" className="text-xs font-medium text-muted-foreground">
							{formatToMoney(transactionsTotal)} de {formatToMoney(entryValue)} em {visibleTransactions.length}{" "}
							{visibleTransactions.length === 1 ? "transação" : "transações"}
							{hasExceededTotal ? ` (${overflowRatio.toFixed(1)}x o lançamento)` : ""}
						</p>
					</div>
					<div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
						<p
							className={cn("text-xs font-semibold tabular-nums", {
								"text-green-700 dark:text-green-400": isBalanced,
								"text-destructive": hasTransactions && !isBalanced,
								"text-muted-foreground": !hasTransactions,
							})}
						>
							{isBalanced
								? "SEM DIFERENÇA"
								: hasExceededTotal
									? `${formatToMoney(Math.abs(missingTotal))} ACIMA`
									: hasTransactions
										? `FALTAM ${formatToMoney(missingTotal)}`
										: "PAGAMENTO NÃO PROGRAMADO"}
						</p>
						{editable && entryValueIsDefined && missingTotal > ACCOUNTING_ENTRY_BALANCE_TOLERANCE ? (
							<InstallmentGeneratorPopover remaining={missingTotal} competenceDate={competenceDate} onGenerate={handleGenerateInstallments} />
						) : null}
					</div>
				</div>
				<div
					role="progressbar"
					aria-label="Cobertura do lançamento contábil pelas transações financeiras"
					aria-valuemin={0}
					aria-valuemax={entryValue}
					aria-valuenow={transactionsTotal}
					aria-valuetext={`${formatToMoney(transactionsTotal)} de ${formatToMoney(entryValue)}`}
					className="h-2 w-full overflow-hidden rounded-full bg-background ring-1 ring-border/70"
				>
					{/* scaleX em vez de width: transform é composto, width dispara layout a cada frame. */}
					<div
						className={cn("h-full w-full origin-left rounded-full transition-transform duration-200 ease-out", {
							"bg-green-600": isBalanced,
							"bg-destructive": hasExceededTotal,
							"bg-primary": !isBalanced && !hasExceededTotal,
						})}
						style={{ transform: `scaleX(${progressValue / 100})` }}
					/>
				</div>
			</div>

			<div
				{...{ [SPREADSHEET_TABLE_ATTR]: "true" }}
				inert={!editable}
				className={cn("flex w-full flex-col overflow-hidden rounded-md border border-border bg-background", !editable && "opacity-80")}
			>
				<div className="hidden min-h-9 w-full items-center border-b border-border bg-muted/60 px-2 py-1.5 text-[0.68rem] font-medium uppercase text-muted-foreground lg:flex">
					<p className="w-[21%] px-2 text-start">Título</p>
					<p className="w-[9%] px-2 text-center">Tipo</p>
					<p className="w-[15%] px-2 text-center">Método</p>
					<p className="w-[15%] px-2 text-center">Conta financeira</p>
					<p className="w-[12%] px-2 text-center">Previsão</p>
					<p className="w-[12%] px-2 text-center">Efetivação</p>
					<p className="w-[11%] px-2 text-center">Valor</p>
					<p className="w-[5%] px-2 text-center">Ações</p>
				</div>

				<div className="flex w-full flex-col bg-background">
					{visibleTransactions.map(({ transaction, index }, rowIndex) => (
						<PurchaseTransactionTableRow
							key={transaction.id ?? `nova-${index}`}
							transaction={transaction}
							accountOptions={accountOptions}
							gridRow={rowIndex}
							gridBounds={gridBounds}
							handleUpdate={(item) => updateTransaction({ index, item })}
							handleRemove={() => handleRemove(index)}
							editable={editable}
						/>
					))}
					{editable && entryValueIsDefined ? (
						<DraftPurchaseTransactionRow
							accountOptions={accountOptions}
							suggestedValue={missingTotal > 0 ? missingTotal : 0}
							competenceDate={competenceDate}
							gridRow={visibleTransactions.length}
							gridBounds={gridBounds}
							addTransaction={addTransaction}
							defaultTransactionType={defaultTransactionType}
						/>
					) : null}
					{!entryValueIsDefined ? (
						<div className="flex w-full flex-col items-center gap-1 border-t border-border px-3 py-3">
							<p className="text-center text-xs font-medium tracking-tight text-foreground/80">Informe o VALOR EFETIVO do lançamento acima.</p>
							<p className="text-center text-xs text-muted-foreground">É ele que define quanto há para programar em pagamentos.</p>
						</div>
					) : hasTransactions ? (
						<div className="flex w-full items-center justify-center border-t border-border px-2 py-2">
							<div className="flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium tabular-nums text-foreground/80">
								<BadgeDollarSign size={15} />
								<p>Total das transações: {formatToMoney(transactionsTotal)}</p>
							</div>
						</div>
					) : (
						<div className="flex w-full items-center justify-center border-t border-border px-3 py-3">
							<p className="text-center text-xs font-medium tracking-tight text-muted-foreground">
								Preencha o título e confirme o valor na linha em branco para programar o pagamento.
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

type PurchaseTransactionTableRowProps = {
	transaction: TAccountingEntryTransactionRow;
	accountOptions: TAccountOption[];
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
	handleUpdate: (item: TAccountingEntryTransactionPatch) => void;
	handleRemove: () => void;
	editable: boolean;
};

function PurchaseTransactionTableRow({
	transaction,
	accountOptions,
	gridRow,
	gridBounds,
	handleUpdate,
	handleRemove,
	editable,
}: PurchaseTransactionTableRowProps) {
	const installmentLabel = transaction.parcela && transaction.totalParcelas ? `${transaction.parcela}/${transaction.totalParcelas}` : null;

	return (
		<div className="border-t border-border first:border-t-0">
			<div className="hidden min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40 lg:flex">
				<div className="w-[21%] px-1">
					<EditableTextCell
						value={transaction.titulo}
						ariaLabel="Editar título da transação"
						gridRow={gridRow}
						gridCol={TRANSACTION_GRID_COL.TITLE}
						gridBounds={gridBounds}
						emptyDisplay="Sem título"
						onCommit={(titulo) => handleUpdate({ titulo })}
					/>
					{installmentLabel ? <p className="px-2 text-[0.68rem] text-muted-foreground">Parcela {installmentLabel}</p> : null}
				</div>
				<div className="flex w-[9%] justify-center px-1">
					<TransactionTypeCell transaction={transaction} gridRow={gridRow} gridBounds={gridBounds} handleUpdate={handleUpdate} />
				</div>
				<div className="w-[15%] px-1">
					<TransactionMethodCell transaction={transaction} gridRow={gridRow} gridBounds={gridBounds} handleUpdate={handleUpdate} />
				</div>
				<div className="w-[15%] px-1">
					<TransactionAccountCell
						transaction={transaction}
						accountOptions={accountOptions}
						gridRow={gridRow}
						gridBounds={gridBounds}
						handleUpdate={handleUpdate}
					/>
				</div>
				<div className="w-[12%] px-1">
					<EditableDateCell
						value={transaction.dataPrevisao}
						ariaLabel="Editar previsão da transação"
						gridRow={gridRow}
						gridCol={TRANSACTION_GRID_COL.FORECAST}
						gridBounds={gridBounds}
						onCommit={(dataPrevisao) => {
							if (dataPrevisao) handleUpdate({ dataPrevisao });
						}}
					/>
				</div>
				<div className="w-[12%] px-1">
					<EditableDateCell
						value={transaction.dataEfetivacao}
						ariaLabel="Editar efetivação da transação"
						gridRow={gridRow}
						gridCol={TRANSACTION_GRID_COL.EFFECTED}
						gridBounds={gridBounds}
						emptyDisplay="Em aberto"
						allowEmpty
						onCommit={(dataEfetivacao) => handleUpdate({ dataEfetivacao })}
					/>
				</div>
				<div className="w-[11%] px-1">
					<EditableNumberCell
						value={transaction.valor}
						ariaLabel="Editar valor da transação"
						min={0}
						gridRow={gridRow}
						gridCol={TRANSACTION_GRID_COL.VALUE}
						gridBounds={gridBounds}
						format={(value) => (value > 0 ? formatToMoney(value) : "-")}
						onCommit={(valor) => handleUpdate(getTransactionValuePatch(valor))}
					/>
				</div>
				<div className="flex w-[5%] justify-center px-1">
					{editable ? <DeleteRowButton onRemove={handleRemove} ariaLabel="Remover transação financeira do lançamento" /> : null}
				</div>
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex w-full items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<EditableTextCell
							value={transaction.titulo}
							ariaLabel="Editar título da transação"
							emptyDisplay="Sem título"
							onCommit={(titulo) => handleUpdate({ titulo })}
						/>
						{installmentLabel ? <p className="px-2 text-[0.68rem] text-muted-foreground">Parcela {installmentLabel}</p> : null}
					</div>
					{editable ? <DeleteRowButton onRemove={handleRemove} ariaLabel="Remover transação financeira do lançamento" /> : null}
				</div>
				<div className="grid w-full grid-cols-2 gap-2">
					<MobileEditableField label="Tipo">
						<TransactionTypeCell transaction={transaction} handleUpdate={handleUpdate} />
					</MobileEditableField>
					<MobileEditableField label="Valor">
						<EditableNumberCell
							value={transaction.valor}
							ariaLabel="Editar valor da transação"
							min={0}
							format={(value) => (value > 0 ? formatToMoney(value) : "-")}
							onCommit={(valor) => handleUpdate(getTransactionValuePatch(valor))}
						/>
					</MobileEditableField>
					<MobileEditableField label="Método">
						<TransactionMethodCell transaction={transaction} handleUpdate={handleUpdate} />
					</MobileEditableField>
					<MobileEditableField label="Previsão">
						<EditableDateCell
							value={transaction.dataPrevisao}
							ariaLabel="Editar previsão da transação"
							onCommit={(dataPrevisao) => {
								if (dataPrevisao) handleUpdate({ dataPrevisao });
							}}
						/>
					</MobileEditableField>
					<MobileEditableField label="Efetivação">
						<EditableDateCell
							value={transaction.dataEfetivacao}
							ariaLabel="Editar efetivação da transação"
							emptyDisplay="Em aberto"
							allowEmpty
							onCommit={(dataEfetivacao) => handleUpdate({ dataEfetivacao })}
						/>
					</MobileEditableField>
				</div>
				<MobileEditableField label="Conta financeira">
					<TransactionAccountCell transaction={transaction} accountOptions={accountOptions} handleUpdate={handleUpdate} />
				</MobileEditableField>
			</div>
		</div>
	);
}

function DraftPurchaseTransactionRow({
	accountOptions,
	suggestedValue,
	competenceDate,
	gridRow,
	gridBounds,
	addTransaction,
	defaultTransactionType,
}: {
	accountOptions: TAccountOption[];
	suggestedValue: number;
	competenceDate: Date;
	gridRow: number;
	gridBounds: SpreadsheetGridBounds;
	addTransaction: (transaction: TNewAccountingEntryTransaction) => void;
	defaultTransactionType: TAccountingEntryTransactionRow["tipo"];
}) {
	const [draft, setDraft] = useState<TNewAccountingEntryTransaction>(() => createEmptyTransaction(competenceDate, defaultTransactionType));
	// Enquanto o valor não é confirmado, a célula mostra o restante do lançamento como sugestão e a linha
	// não se confirma. Nenhum pagamento é programado por um valor que o usuário não aceitou.
	const [valueIsConfirmed, setValueIsConfirmed] = useState(false);
	const effectiveValue = valueIsConfirmed ? draft.valor : suggestedValue;

	function commitIfReady(nextDraft: TNewAccountingEntryTransaction, nextValueIsConfirmed: boolean) {
		const value = nextValueIsConfirmed ? nextDraft.valor : suggestedValue;
		if (!nextDraft.titulo.trim() || !nextValueIsConfirmed || value <= 0) {
			setDraft(nextDraft);
			setValueIsConfirmed(nextValueIsConfirmed);
			return;
		}

		addTransaction({ ...nextDraft, valor: value });
		setDraft(createEmptyTransaction(competenceDate, defaultTransactionType));
		setValueIsConfirmed(false);
	}

	function updateDraft(item: Partial<TNewAccountingEntryTransaction>) {
		commitIfReady({ ...draft, ...item }, valueIsConfirmed);
	}

	function confirmDraftValue(valor: number) {
		commitIfReady({ ...draft, valor }, true);
	}

	return (
		<div className="border-t border-dashed border-border bg-muted/20">
			<div className="hidden min-h-11 w-full items-center px-2 py-1 text-xs transition-colors hover:bg-muted/40 lg:flex">
				<div className="flex w-[21%] items-center gap-1 px-1">
					<Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<EditableTextCell
							value={draft.titulo}
							ariaLabel="Editar título da nova transação"
							gridRow={gridRow}
							gridCol={TRANSACTION_GRID_COL.TITLE}
							gridBounds={gridBounds}
							emptyDisplay="NOVA TRANSAÇÃO"
							onCommit={(titulo) => updateDraft({ titulo })}
						/>
					</div>
				</div>
				<div className="flex w-[9%] justify-center px-1">
					<TransactionTypeCell transaction={draft} gridRow={gridRow} gridBounds={gridBounds} handleUpdate={updateDraft} />
				</div>
				<div className="w-[15%] px-1">
					<TransactionMethodCell transaction={draft} gridRow={gridRow} gridBounds={gridBounds} handleUpdate={updateDraft} />
				</div>
				<div className="w-[15%] px-1">
					<TransactionAccountCell
						transaction={draft}
						accountOptions={accountOptions}
						gridRow={gridRow}
						gridBounds={gridBounds}
						handleUpdate={updateDraft}
					/>
				</div>
				<div className="w-[12%] px-1">
					<EditableDateCell
						value={draft.dataPrevisao}
						ariaLabel="Editar previsão da nova transação"
						gridRow={gridRow}
						gridCol={TRANSACTION_GRID_COL.FORECAST}
						gridBounds={gridBounds}
						onCommit={(dataPrevisao) => {
							if (dataPrevisao) updateDraft({ dataPrevisao });
						}}
					/>
				</div>
				<div className="w-[12%] px-1">
					<EditableDateCell
						value={draft.dataEfetivacao}
						ariaLabel="Editar efetivação da nova transação"
						gridRow={gridRow}
						gridCol={TRANSACTION_GRID_COL.EFFECTED}
						gridBounds={gridBounds}
						emptyDisplay="Em aberto"
						allowEmpty
						onCommit={(dataEfetivacao) => updateDraft({ dataEfetivacao })}
					/>
				</div>
				<div className="w-[11%] px-1">
					<DraftValueCell value={effectiveValue} isSuggestion={!valueIsConfirmed} gridRow={gridRow} gridBounds={gridBounds} onCommit={confirmDraftValue} />
				</div>
				<div className="w-[5%]" />
			</div>

			<div className="flex w-full flex-col gap-2 p-2 lg:hidden">
				<div className="flex w-full items-start gap-2">
					<Plus className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<EditableTextCell
							value={draft.titulo}
							ariaLabel="Editar título da nova transação"
							emptyDisplay="Nova transação"
							onCommit={(titulo) => updateDraft({ titulo })}
						/>
					</div>
				</div>
				<div className="grid w-full grid-cols-2 gap-2">
					<MobileEditableField label="Tipo">
						<TransactionTypeCell transaction={draft} handleUpdate={updateDraft} />
					</MobileEditableField>
					<MobileEditableField label={valueIsConfirmed ? "Valor" : "Valor (sugerido)"}>
						<DraftValueCell value={effectiveValue} isSuggestion={!valueIsConfirmed} onCommit={confirmDraftValue} />
					</MobileEditableField>
					<MobileEditableField label="Método">
						<TransactionMethodCell transaction={draft} handleUpdate={updateDraft} />
					</MobileEditableField>
					<MobileEditableField label="Previsão">
						<EditableDateCell
							value={draft.dataPrevisao}
							ariaLabel="Editar previsão da nova transação"
							onCommit={(dataPrevisao) => {
								if (dataPrevisao) updateDraft({ dataPrevisao });
							}}
						/>
					</MobileEditableField>
				</div>
			</div>
		</div>
	);
}

/**
 * Célula de valor da linha rascunho. Mostra o restante do lançamento como sugestão até ser confirmada,
 * e passa o mesmo número como `value` para que o editor nunca discorde do que está exibido.
 */
function DraftValueCell({
	value,
	isSuggestion,
	gridRow,
	gridBounds,
	onCommit,
}: {
	value: number;
	isSuggestion: boolean;
	gridRow?: number;
	gridBounds?: SpreadsheetGridBounds;
	onCommit: (value: number) => void;
}) {
	return (
		<div className="flex flex-col items-stretch">
			<EditableNumberCell
				value={value}
				ariaLabel={isSuggestion ? "Confirmar valor sugerido da nova transação" : "Editar valor da nova transação"}
				min={0}
				gridRow={gridRow}
				gridCol={gridRow !== undefined ? TRANSACTION_GRID_COL.VALUE : undefined}
				gridBounds={gridBounds}
				format={(item) => (item > 0 ? formatToMoney(item) : "-")}
				onCommit={onCommit}
			/>
			{isSuggestion && value > 0 ? <span className="px-2 text-[0.68rem] text-muted-foreground">sugerido</span> : null}
		</div>
	);
}

type CellProps = {
	transaction: TAccountingEntryTransactionRow;
	gridRow?: number;
	gridBounds?: SpreadsheetGridBounds;
	handleUpdate: (item: TAccountingEntryTransactionPatch) => void;
};

/** Props de navegação por grid para gatilhos que não são células editáveis (selects e o toggle de tipo). */
function getGridTriggerProps({ gridRow, gridCol, gridBounds }: { gridRow?: number; gridCol: number; gridBounds?: SpreadsheetGridBounds }) {
	const hasGridNavigation = gridRow !== undefined && gridBounds !== undefined;
	if (!hasGridNavigation) return { hasGridNavigation, triggerProps: undefined };

	return {
		hasGridNavigation,
		triggerProps: {
			onFocus: () => {
				consumeProgrammaticSpreadsheetFocus();
			},
			onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
				if (event.key === "Enter" || event.key === " ") return;
				handleSpreadsheetNavigationKeyDown(event, {
					coords: { row: gridRow, col: gridCol },
					bounds: gridBounds,
				});
			},
		},
	};
}

function TransactionTypeCell({ transaction, gridRow, gridBounds, handleUpdate }: CellProps) {
	const isInbound = transaction.tipo === "ENTRADA";
	const option = FinancialTransactionTypeOptions.find((item) => item.value === transaction.tipo);
	const { hasGridNavigation, triggerProps } = getGridTriggerProps({
		gridRow,
		gridCol: TRANSACTION_GRID_COL.TYPE,
		gridBounds,
	});

	const toggle = (
		<button
			type="button"
			aria-label={`Alternar tipo da transação, atualmente ${option?.label ?? transaction.tipo}`}
			onClick={() => handleUpdate({ tipo: isInbound ? "SAIDA" : "ENTRADA" })}
			{...triggerProps}
			className={cn(
				"flex h-8 w-full items-center justify-center gap-1 rounded-md border text-[0.68rem] font-semibold transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40",
				isInbound
					? "border-green-500/40 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400"
					: "border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-400",
			)}
		>
			{isInbound ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
			{option?.label ?? transaction.tipo}
		</button>
	);

	if (!hasGridNavigation || gridRow === undefined) return toggle;

	return (
		<SpreadsheetCellWrapper gridRow={gridRow} gridCol={TRANSACTION_GRID_COL.TYPE} className="w-full">
			{toggle}
		</SpreadsheetCellWrapper>
	);
}

function TransactionMethodCell({ transaction, gridRow, gridBounds, handleUpdate }: CellProps) {
	const { hasGridNavigation, triggerProps } = getGridTriggerProps({
		gridRow,
		gridCol: TRANSACTION_GRID_COL.METHOD,
		gridBounds,
	});

	const select = (
		<SelectInput
			label="Método da transação"
			showLabel={false}
			resetOptionLabel="A DEFINIR"
			options={PAYMENT_METHOD_OPTIONS}
			value={transaction.metodo}
			holderClassName={CELL_TRIGGER_CLASSNAME}
			triggerProps={triggerProps}
			handleChange={(metodo) =>
				handleUpdate({
					metodo: metodo as TAccountingEntryTransactionRow["metodo"],
				})
			}
			onReset={() => handleUpdate({ metodo: "A_DEFINIR" })}
		/>
	);

	if (!hasGridNavigation || gridRow === undefined) return select;

	return (
		<SpreadsheetCellWrapper gridRow={gridRow} gridCol={TRANSACTION_GRID_COL.METHOD}>
			{select}
		</SpreadsheetCellWrapper>
	);
}

function TransactionAccountCell({
	transaction,
	accountOptions,
	gridRow,
	gridBounds,
	handleUpdate,
}: CellProps & { accountOptions: TAccountOption[] }) {
	const { hasGridNavigation, triggerProps } = getGridTriggerProps({
		gridRow,
		gridCol: TRANSACTION_GRID_COL.ACCOUNT,
		gridBounds,
	});

	const select = (
		<SelectInput
			label="Conta financeira da transação"
			showLabel={false}
			resetOptionLabel="SEM CONTA"
			options={accountOptions}
			value={transaction.contaFinanceiraId || ""}
			holderClassName={CELL_TRIGGER_CLASSNAME}
			triggerProps={triggerProps}
			handleChange={(contaFinanceiraId) => handleUpdate({ contaFinanceiraId })}
			onReset={() => handleUpdate({ contaFinanceiraId: null })}
		/>
	);

	if (!hasGridNavigation || gridRow === undefined) return select;

	return (
		<SpreadsheetCellWrapper gridRow={gridRow} gridCol={TRANSACTION_GRID_COL.ACCOUNT}>
			{select}
		</SpreadsheetCellWrapper>
	);
}

/**
 * Gerador de parcelas: distribui o restante do lançamento em N vencimentos e joga as linhas na própria
 * tabela, que segue editável. A tabela é a prévia, então não há passo de confirmação separado.
 */
function InstallmentGeneratorPopover({
	remaining,
	competenceDate,
	onGenerate,
}: {
	remaining: number;
	competenceDate: Date;
	onGenerate: (config: { count: number; intervalDays: number; firstDate: Date }) => void;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [count, setCount] = useState(2);
	const [intervalDays, setIntervalDays] = useState(30);
	const [firstDate, setFirstDate] = useState<Date>(competenceDate);

	const normalizedCount = Math.min(24, Math.max(2, Math.round(count || 2)));
	const preview = distributeTotalEqually(remaining, normalizedCount);

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger
				render={
					<Button type="button" size="sm" variant="secondary" className="gap-1.5 text-xs">
						<Layers3 className="h-3.5 w-3.5" />
						PARCELAR RESTANTE
					</Button>
				}
			/>
			<PopoverContent align="end" className="z-60 flex w-80 flex-col gap-3 p-3">
				<div className="flex flex-col gap-0.5">
					<p className="text-sm font-semibold tracking-tight">Parcelar {formatToMoney(remaining)}</p>
					<p className="text-xs text-muted-foreground">As parcelas entram na tabela e seguem editáveis.</p>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<label className="flex flex-col gap-1 text-xs font-medium text-foreground/80">
						PARCELAS
						<Input type="number" min={2} max={24} value={count} onChange={(event) => setCount(Number(event.target.value) || 2)} className="h-8 text-xs" />
					</label>
					<NumberInput
						label="INTERVALO (DIAS)"
						value={intervalDays}
						handleChange={(value) => setIntervalDays(Math.max(0, Math.round(value || 0)))}
						placeholder="Dias entre parcelas..."
					/>
				</div>
				<DateInput
					label="PRIMEIRO VENCIMENTO"
					value={formatDateForInputValue(firstDate)}
					handleChange={(value) => setFirstDate((formatDateOnInputChange(value, "date") as Date) ?? firstDate)}
				/>
				<p className="text-xs tabular-nums text-muted-foreground">
					{normalizedCount}x de {formatToMoney(preview[0] ?? 0)}
					{preview.some((amount) => amount !== preview[0]) ? ` (última de ${formatToMoney(preview[preview.length - 1] ?? 0)})` : ""}
				</p>
				<Button
					type="button"
					size="sm"
					className="text-xs"
					onClick={() => {
						onGenerate({ count: normalizedCount, intervalDays, firstDate });
						setIsOpen(false);
					}}
				>
					GERAR PARCELAS
				</Button>
			</PopoverContent>
		</Popover>
	);
}

function createEmptyTransaction(
	competenceDate: Date,
	defaultTransactionType: TAccountingEntryTransactionRow["tipo"],
): TNewAccountingEntryTransaction {
	return {
		contaFinanceiraId: null,
		titulo: "",
		tipo: defaultTransactionType,
		valor: 0,
		metodo: "A_DEFINIR",
		dataPrevisao: competenceDate,
		dataEfetivacao: null,
		parcela: null,
		totalParcelas: null,
	};
}
