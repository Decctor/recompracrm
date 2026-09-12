import DateInput from "@/components/Inputs/DateInput";
import NumberInput from "@/components/Inputs/NumberInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { Button } from "@/components/ui/button";
import { formatDateForInputValue, formatDateOnInputChange, formatToMoney } from "@/lib/formatting";
import type { TUsePurchaseState } from "@/state-hooks/use-purchase-state";
import { FileText } from "lucide-react";
import PurchaseTransactionsTable from "./Utils/PurchaseTransactionsTable";

type PurchaseAccountingEntryBlockProps = {
	accountingEntry: TUsePurchaseState["state"]["lancamentoContabil"];
	updateAccountingEntry: TUsePurchaseState["updateAccountingEntry"];
	addAccountingEntryTransaction: TUsePurchaseState["addAccountingEntryTransaction"];
	updateAccountingEntryTransaction: TUsePurchaseState["updateAccountingEntryTransaction"];
	removeAccountingEntryTransaction: TUsePurchaseState["removeAccountingEntryTransaction"];
	/** Soma financeira dos itens. O recebimento exige que o valor efetivo bata com ela. */
	itemsTotal: number;
	/** Compra recebida: o valor efetivo virou fato contábil e não é mais editável. */
	valueLocked?: boolean;
};

export default function PurchaseAccountingEntryBlock({
	accountingEntry,
	updateAccountingEntry,
	addAccountingEntryTransaction,
	updateAccountingEntryTransaction,
	removeAccountingEntryTransaction,
	itemsTotal,
	valueLocked = false,
}: PurchaseAccountingEntryBlockProps) {
	// Compras sem itens (serviços, por exemplo) têm valor próprio: só cobramos a igualdade quando há
	// composição para comparar.
	const itemsTotalDiverges = !valueLocked && itemsTotal > 0 && Math.round(itemsTotal * 100) !== Math.round(accountingEntry.valor * 100);
	return (
		<ResponsiveMenuSection title="INFORMAÇÕES DA CONTABILIDADE" icon={<FileText className="h-4 min-h-4 w-4 min-w-4" />}>
			<div className="flex w-full flex-col items-center gap-2 lg:flex-row">
				<div className="w-full lg:w-1/2">
					<TextInput
						label="TÍTULO DO LANÇAMENTO CONTÁBIL"
						placeholder="Preencha o título do lançamento contábil..."
						value={accountingEntry.titulo}
						handleChange={(value) => updateAccountingEntry({ titulo: value })}
					/>
				</div>
				<div className="w-full lg:w-1/2">
					<DateInput
						label="DATA DE COMPETÊNCIA"
						value={formatDateForInputValue(accountingEntry.dataCompetencia)}
						handleChange={(value) =>
							updateAccountingEntry({
								dataCompetencia: (formatDateOnInputChange(value, "date") as Date) || accountingEntry.dataCompetencia,
							})
						}
					/>
				</div>
			</div>
			<TextareaInput
				label="ANOTAÇÕES DO LANÇAMENTO CONTÁBIL"
				placeholder="Preencha as anotações do lançamento contábil..."
				value={accountingEntry.anotacoes ?? ""}
				handleChange={(value) => updateAccountingEntry({ anotacoes: value })}
			/>
			<div className="flex w-full flex-col items-center gap-2 lg:flex-row">
				<div className="w-full lg:w-1/2">
					<NumberInput
						label="VALOR PREVISTO (ORÇADO)"
						placeholder="Quanto se esperava gastar..."
						value={accountingEntry.valorPrevisto ?? 0}
						handleChange={(value) => updateAccountingEntry({ valorPrevisto: value })}
					/>
				</div>
				<div className="w-full lg:w-1/2">
					<NumberInput
						label="VALOR EFETIVO (A PAGAR)"
						placeholder="Quanto será efetivamente pago..."
						value={accountingEntry.valor}
						editable={!valueLocked}
						handleChange={(value) => updateAccountingEntry({ valor: value })}
					/>
				</div>
			</div>
			{/* Dois campos de dinheiro com a mesma forma, e só um governa a programação de pagamento. */}
			<p className="text-xs text-muted-foreground">
				As transações financeiras abaixo precisam somar o <strong className="font-semibold text-foreground/80">VALOR EFETIVO</strong>.
			</p>
			{valueLocked ? (
				<p className="text-xs text-muted-foreground">
					A compra já foi recebida: o valor efetivo está congelado junto com os itens. Para corrigi-lo, cancele a compra.
				</p>
			) : null}
			{/* O recebimento rejeita a divergência no servidor. Mostrar o delta e o atalho aqui evita que o
			    usuário tenha que descobrir o número somando os itens na mão. */}
			{itemsTotalDiverges ? (
				<div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-xs leading-relaxed text-amber-700 dark:text-amber-500">
						Os itens somam <strong className="font-semibold">{formatToMoney(itemsTotal)}</strong>, diferente do valor efetivo. A compra não poderá ser
						recebida enquanto os dois não baterem.
					</p>
					<Button type="button" variant="outline" size="sm" className="shrink-0 text-xs" onClick={() => updateAccountingEntry({ valor: itemsTotal })}>
						USAR TOTAL DOS ITENS
					</Button>
				</div>
			) : null}
			<div className="flex w-full flex-col gap-1.5">
				<p className="text-start text-sm font-medium tracking-tight text-foreground/80">TRANSAÇÕES FINANCEIRAS</p>
				<PurchaseTransactionsTable
					entryValue={accountingEntry.valor}
					competenceDate={accountingEntry.dataCompetencia}
					transactions={accountingEntry.transacoes}
					addTransaction={addAccountingEntryTransaction}
					updateTransaction={updateAccountingEntryTransaction}
					removeTransaction={(index) => removeAccountingEntryTransaction({ index })}
				/>
			</div>
		</ResponsiveMenuSection>
	);
}
