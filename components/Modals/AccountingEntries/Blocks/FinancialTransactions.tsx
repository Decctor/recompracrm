"use client";

import PurchaseTransactionsTable from "@/components/Modals/Purchases/Blocks/Utils/PurchaseTransactionsTable";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TUseInternalAccountingEntryState } from "@/state-hooks/use-internal-accounting-entry-state";
import { WalletCards } from "lucide-react";

type AccountingEntryFinancialTransactionsBlockProps = {
	entryTotalValue: number;
	entryCompetenceDate: Date;
	entryFinancialTransactions: TUseInternalAccountingEntryState["state"]["entryFinancialTransactions"];
	addFinancialTransaction: TUseInternalAccountingEntryState["addFinancialTransaction"];
	updateFinancialTransaction: TUseInternalAccountingEntryState["updateFinancialTransaction"];
	removeFinancialTransaction: TUseInternalAccountingEntryState["removeFinancialTransaction"];
	editable?: boolean;
};

export default function AccountingEntryFinancialTransactionsBlock({
	entryTotalValue,
	entryCompetenceDate,
	entryFinancialTransactions,
	addFinancialTransaction,
	updateFinancialTransaction,
	removeFinancialTransaction,
	editable = true,
}: AccountingEntryFinancialTransactionsBlockProps) {
	return (
		<ResponsiveMenuSection title="TRANSAÇÕES FINANCEIRAS" icon={<WalletCards className="h-4 w-4" />}>
			<PurchaseTransactionsTable
				entryValue={entryTotalValue}
				competenceDate={entryCompetenceDate}
				transactions={entryFinancialTransactions}
				addTransaction={(transaction) => addFinancialTransaction(transaction)}
				updateTransaction={({ index, item }) => updateFinancialTransaction({ index, changes: item })}
				removeTransaction={removeFinancialTransaction}
				defaultTransactionType="ENTRADA"
				editable={editable}
			/>
		</ResponsiveMenuSection>
	);
}
