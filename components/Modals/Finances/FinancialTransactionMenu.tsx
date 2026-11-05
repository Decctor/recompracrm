"use client";

import type { TGetFinancialAccountsOutputDefault } from "@/app/api/finances/financial-accounts/route";
import type { TGetFinancialTransactionsOutputById } from "@/app/api/finances/financial-transactions/route";
import FinancialTransactionEffectBlock from "@/components/Modals/Finances/Blocks/Effect";
import FinancialTransactionRelationsBlock from "@/components/Modals/Finances/Blocks/Relations";
import FinancialTransactionSummaryBlock from "@/components/Modals/Finances/Blocks/Summary";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import { getErrorMessage } from "@/lib/errors";
import { invalidateFinanceQueries } from "@/lib/finances/invalidate-finance-queries";
import { formatDateForInputValue, formatDateOnInputChange } from "@/lib/formatting";
import { effectFinancialTransaction, updateFinancialTransaction } from "@/lib/mutations/finances";
import { useFinancesAccounts, useFinancialTransactionById } from "@/lib/queries/finances";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

type FinancialTransactionMenuProps = {
	transactionId: string;
	closeMenu: () => void;
	callbacks?: {
		onMutate?: () => void;
		onSuccess?: () => void;
		onError?: () => void;
		onSettled?: () => void;
	};
};

type LoadedFinancialTransactionMenuProps = FinancialTransactionMenuProps & {
	transaction: TGetFinancialTransactionsOutputById;
	financialAccounts: TGetFinancialAccountsOutputDefault["accounts"];
};

export default function FinancialTransactionMenu({ transactionId, closeMenu, callbacks }: FinancialTransactionMenuProps) {
	const transactionQuery = useFinancialTransactionById(transactionId);
	const financialAccountsQuery = useFinancesAccounts({ initialFilters: { activeOnly: true, stats: false } });
	const isLoading = transactionQuery.isLoading || financialAccountsQuery.isLoading;
	const stateError = transactionQuery.isError
		? getErrorMessage(transactionQuery.error)
		: financialAccountsQuery.isError
			? getErrorMessage(financialAccountsQuery.error)
			: null;

	if (transactionQuery.data && financialAccountsQuery.data && !isLoading && !stateError) {
		return (
			<LoadedFinancialTransactionMenu
				key={transactionQuery.data.id}
				transactionId={transactionId}
				transaction={transactionQuery.data}
				financialAccounts={financialAccountsQuery.data.accounts}
				closeMenu={closeMenu}
				callbacks={callbacks}
			/>
		);
	}

	return (
		<ResponsiveMenu
			menuTitle="MOVIMENTAÇÃO FINANCEIRA"
			menuDescription="Carregando os dados da movimentação financeira."
			menuActionButtonText="SALVAR"
			menuCancelButtonText="CANCELAR"
			closeMenu={closeMenu}
			actionFunction={() => undefined}
			actionIsLoading={false}
			menuActionButtonDisabled
			stateIsLoading={isLoading}
			stateError={stateError}
		>
			{null}
		</ResponsiveMenu>
	);
}

function LoadedFinancialTransactionMenu({
	transactionId,
	transaction,
	financialAccounts,
	closeMenu,
	callbacks,
}: LoadedFinancialTransactionMenuProps) {
	const queryClient = useQueryClient();
	// Pendente abre no momento atual, não na previsão: efetivar sem mexer no campo gravaria o
	// vencimento como se fosse o dia do recebimento.
	const [effectDate, setEffectDate] = useState<string | undefined>(() => formatDateForInputValue(transaction.dataEfetivacao ?? new Date(), "datetime"));
	const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => transaction.contaFinanceira?.id ?? null);
	const [selectedMethod, setSelectedMethod] = useState<TPaymentMethodEnum>(() =>
		transaction.metodo === "A_DEFINIR" ? "DINHEIRO" : transaction.metodo,
	);
	const isEffective = !!transaction.dataEfetivacao;
	const canChangeMethodOnEffect = transaction.metodo === "A_DEFINIR";

	function invalidateQueries() {
		void invalidateFinanceQueries(queryClient, { transactionId, accountingEntryId: transaction.lancamentoContabil?.id });
	}

	const { mutate: mutateEffectTransaction, isPending: isEffecting } = useMutation({
		mutationKey: ["effect-financial-transaction", transactionId],
		mutationFn: effectFinancialTransaction,
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			invalidateQueries();
			closeMenu();
		},
		onError: (error) => {
			callbacks?.onError?.();
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	const { mutate: mutateUpdateTransaction, isPending: isUpdating } = useMutation({
		mutationKey: ["update-financial-transaction", transactionId],
		mutationFn: updateFinancialTransaction,
		onMutate: () => callbacks?.onMutate?.(),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			invalidateQueries();
			closeMenu();
		},
		onError: (error) => {
			callbacks?.onError?.();
			toast.error(getErrorMessage(error));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	function buildTransactionPayload() {
		return {
			dataEfetivacao: effectDate ? formatDateOnInputChange(effectDate, "date") : null,
			contaFinanceiraId: selectedAccountId,
			metodo: isEffective || canChangeMethodOnEffect ? selectedMethod : ("A_DEFINIR" as const),
		};
	}

	function handleSave() {
		if (isEffective) {
			mutateUpdateTransaction({ transactionId: transaction.id, transaction: buildTransactionPayload() });
			return;
		}
		mutateEffectTransaction({ transactionId: transaction.id, transaction: buildTransactionPayload() });
	}

	return (
		<ResponsiveMenu
			menuTitle="MOVIMENTAÇÃO FINANCEIRA"
			menuDescription={isEffective ? "Ajuste os dados de efetivação desta movimentação." : "Revise os vínculos e confirme a efetivação."}
			menuActionButtonText={isEffective ? "SALVAR" : "EFETIVAR"}
			menuCancelButtonText="CANCELAR"
			closeMenu={closeMenu}
			actionFunction={handleSave}
			actionIsLoading={isEffecting || isUpdating}
			stateIsLoading={false}
		>
			<FinancialTransactionEffectBlock
				financialAccounts={financialAccounts}
				effectDate={effectDate}
				setEffectDate={setEffectDate}
				selectedAccountId={selectedAccountId}
				setSelectedAccountId={setSelectedAccountId}
				selectedMethod={selectedMethod}
				setSelectedMethod={setSelectedMethod}
				allowMethodChange={isEffective || canChangeMethodOnEffect}
			/>
			<FinancialTransactionSummaryBlock transaction={transaction} />
			<FinancialTransactionRelationsBlock transaction={transaction} />
		</ResponsiveMenu>
	);
}
