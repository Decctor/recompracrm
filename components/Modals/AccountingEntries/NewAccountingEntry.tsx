"use client";

import AccountingEntryLinesBlock, { getEntryLinesError } from "@/components/Modals/AccountingEntries/Blocks/Lines";
import AccountingEntryFinancialTransactionsBlock from "@/components/Modals/AccountingEntries/Blocks/FinancialTransactions";
import AccountingEntryGeneralBlock from "@/components/Modals/AccountingEntries/Blocks/General";
import AccountingEntryValuesBlock from "@/components/Modals/AccountingEntries/Blocks/Values";
import { AccountingEntryRecurrenceBlock } from "@/components/Modals/AccountingEntries/Blocks/Recurrence";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { invalidateFinanceQueries } from "@/lib/finances/invalidate-finance-queries";
import { createAccountingEntry } from "@/lib/mutations/finances";
import type { TFinancialRecurringRuleConfig } from "@/schemas/financial-recurring";
import { useInternalAccountingEntryState } from "@/state-hooks/use-internal-accounting-entry-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";

type NewAccountingEntryProps = {
	closeModal: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

export default function NewAccountingEntry({ closeModal, callbacks }: NewAccountingEntryProps) {
	const queryClient = useQueryClient();
	const {
		state,
		updateEntry,
		addEntryLine,
		updateEntryLine,
		removeEntryLine,
		addFinancialTransaction,
		updateFinancialTransaction,
		removeFinancialTransaction,
		resetState,
		getCreatePayload,
	} = useInternalAccountingEntryState();
	const [recurrenceConfig, setRecurrenceConfig] = useState<TFinancialRecurringRuleConfig | null>(null);

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-accounting-entry"],
		mutationFn: async ({
			entryPayload,
			config,
		}: {
			entryPayload: ReturnType<typeof getCreatePayload>;
			config: TFinancialRecurringRuleConfig | null;
		}) => {
			return createAccountingEntry({ ...entryPayload, recurrenceRule: config });
		},
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			resetState();
			setRecurrenceConfig(null);
			void invalidateFinanceQueries(queryClient);
			void queryClient.invalidateQueries({
				queryKey: ["finances-recurring-rules"],
			});
			closeModal();
		},
		onError: (error) => {
			callbacks?.onError?.(error as Error);
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	return (
		<ResponsiveMenu
			menuTitle="NOVO LANÇAMENTO CONTÁBIL"
			menuDescription="Preencha os dados do lançamento e, se necessário, vincule as transações financeiras."
			menuActionButtonText="CRIAR LANÇAMENTO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => {
				// O servidor rejeita partidas desbalanceadas; a tela já sabe o erro, então não gasta o round-trip.
				const linesError = getEntryLinesError(state.entry, state.entryLines);
				if (linesError) return toast.error(linesError);
				mutate({ entryPayload: getCreatePayload(), config: recurrenceConfig });
			}}
			actionIsLoading={isPending}
			stateIsLoading={false}
			closeMenu={closeModal}
			lockClose={isPending}
			dialogVariant="lg"
			drawerVariant="lg"
		>
			<AccountingEntryGeneralBlock entry={state.entry} updateEntry={updateEntry} />
			<AccountingEntryValuesBlock entry={state.entry} updateEntry={updateEntry} />
			<AccountingEntryLinesBlock
				entry={state.entry}
				entryLines={state.entryLines}
				updateEntry={updateEntry}
				addEntryLine={addEntryLine}
				updateEntryLine={updateEntryLine}
				removeEntryLine={removeEntryLine}
			/>
			<AccountingEntryFinancialTransactionsBlock
				entryTotalValue={state.entry.valor}
				entryCompetenceDate={state.entry.dataCompetencia}
				entryFinancialTransactions={state.entryFinancialTransactions}
				addFinancialTransaction={addFinancialTransaction}
				updateFinancialTransaction={updateFinancialTransaction}
				removeFinancialTransaction={removeFinancialTransaction}
			/>
			<AccountingEntryRecurrenceBlock config={recurrenceConfig} onChange={setRecurrenceConfig} />
		</ResponsiveMenu>
	);
}
