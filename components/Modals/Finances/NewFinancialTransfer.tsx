"use client";

import DateTimeInput from "@/components/Inputs/DateTimeInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TCreateFinancialTransferInput } from "@/app/api/finances/financial-transactions/transfer/route";
import { getErrorMessage } from "@/lib/errors";
import { invalidateFinanceQueries } from "@/lib/finances/invalidate-finance-queries";
import { formatDateForInputValue, formatDateOnInputChange, formatToMoney } from "@/lib/formatting";
import { createFinancialTransfer } from "@/lib/mutations/finances";
import { useFinancesAccounts } from "@/lib/queries/finances";
import { FinancialAccountTypeOptions } from "@/utils/select-options";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, CalendarDays, CircleDollarSign, FileText, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type TFinancialTransferState = TCreateFinancialTransferInput["transfer"];

type NewFinancialTransferProps = {
	closeMenu: () => void;
	callbacks?: {
		onMutate?: (variables: TCreateFinancialTransferInput) => void;
		onSuccess?: () => void;
		onError?: (error: Error) => void;
		onSettled?: () => void;
	};
};

function getDefaultState(): TFinancialTransferState {
	return {
		titulo: "Transferência entre contas",
		anotacoes: "",
		contaFinanceiraOrigemId: "",
		contaFinanceiraDestinoId: "",
		valor: 0,
		dataEfetivacao: new Date(),
	};
}

export default function NewFinancialTransfer({ closeMenu, callbacks }: NewFinancialTransferProps) {
	const queryClient = useQueryClient();
	const [state, setState] = useState<TFinancialTransferState>(getDefaultState);
	const { data: financialAccountsData, isLoading, isError, error } = useFinancesAccounts({ initialFilters: { activeOnly: true, stats: false } });
	const financialAccounts = financialAccountsData?.accounts ?? [];

	const financialAccountOptions = useMemo(
		() =>
			financialAccounts.map((account) => ({
				id: account.id,
				value: account.id,
				label: account.nome,
				startContent: FinancialAccountTypeOptions.find((option) => option.value === account.tipo)?.icon,
			})),
		[financialAccounts],
	);

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-financial-transfer"],
		mutationFn: createFinancialTransfer,
		onMutate: (variables) => callbacks?.onMutate?.(variables),
		onSuccess: (data) => {
			callbacks?.onSuccess?.();
			toast.success(data.message);
			void invalidateFinanceQueries(queryClient);
			closeMenu();
		},
		onError: (mutationError) => {
			callbacks?.onError?.(mutationError);
			toast.error(getErrorMessage(mutationError));
		},
		onSettled: () => callbacks?.onSettled?.(),
	});

	function updateState(patch: Partial<TFinancialTransferState>) {
		setState((previous) => ({ ...previous, ...patch }));
	}

	function handleSubmit() {
		if (state.contaFinanceiraOrigemId === state.contaFinanceiraDestinoId) {
			toast.error("As contas financeiras de origem e destino precisam ser diferentes.");
			return;
		}
		mutate({ transfer: state });
	}

	const sourceAccount = financialAccounts.find((account) => account.id === state.contaFinanceiraOrigemId);
	const destinationAccount = financialAccounts.find((account) => account.id === state.contaFinanceiraDestinoId);
	const stateError = isError ? getErrorMessage(error) : null;

	return (
		<ResponsiveMenu
			menuTitle="NOVA TRANSFERÊNCIA"
			menuDescription="Movimente recursos imediatamente entre duas contas financeiras."
			menuActionButtonText="TRANSFERIR"
			menuCancelButtonText="CANCELAR"
			actionFunction={handleSubmit}
			actionIsLoading={isPending}
			stateIsLoading={isLoading}
			stateError={stateError}
			closeMenu={closeMenu}
		>
			<ResponsiveMenuSection title="IDENTIFICAÇÃO" icon={<FileText className="h-4 w-4" />}>
				<TextInput
					label="TÍTULO"
					placeholder="Informe o título da transferência..."
					value={state.titulo}
					handleChange={(titulo) => updateState({ titulo })}
					required
				/>
				<TextareaInput
					label="ANOTAÇÕES"
					placeholder="Adicione uma observação opcional..."
					value={state.anotacoes ?? ""}
					handleChange={(anotacoes) => updateState({ anotacoes })}
				/>
			</ResponsiveMenuSection>

			<ResponsiveMenuSection title="CONTAS FINANCEIRAS" icon={<WalletCards className="h-4 w-4" />}>
				<SelectInput
					label="CONTA DE ORIGEM"
					value={state.contaFinanceiraOrigemId}
					options={financialAccountOptions}
					resetOptionLabel="Selecione a conta de origem"
					onReset={() => updateState({ contaFinanceiraOrigemId: "" })}
					handleChange={(contaFinanceiraOrigemId) => updateState({ contaFinanceiraOrigemId })}
					required
				/>
				<div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
					<ArrowRightLeft className="h-4 w-4 text-primary" />
					<span>A saída e a entrada serão registradas juntas.</span>
				</div>
				<SelectInput
					label="CONTA DE DESTINO"
					value={state.contaFinanceiraDestinoId}
					options={financialAccountOptions}
					resetOptionLabel="Selecione a conta de destino"
					onReset={() => updateState({ contaFinanceiraDestinoId: "" })}
					handleChange={(contaFinanceiraDestinoId) => updateState({ contaFinanceiraDestinoId })}
					required
				/>
			</ResponsiveMenuSection>

			<ResponsiveMenuSection title="EFETIVAÇÃO IMEDIATA" icon={<CalendarDays className="h-4 w-4" />}>
				<NumberInput
					label="VALOR"
					value={state.valor}
					handleChange={(valor) => updateState({ valor })}
					placeholder="Informe o valor da transferência..."
					required
				/>
				<DateTimeInput
					label="DATA E HORA DA TRANSFERÊNCIA"
					value={formatDateForInputValue(state.dataEfetivacao, "datetime")}
					handleChange={(value) => updateState({ dataEfetivacao: formatDateOnInputChange(value, "date") ?? state.dataEfetivacao })}
					required
				/>
			</ResponsiveMenuSection>

			{sourceAccount && destinationAccount && state.valor > 0 ? (
				<ResponsiveMenuSection title="RESUMO" icon={<CircleDollarSign className="h-4 w-4" />}>
					<div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm">
						<div className="flex items-center justify-between gap-3">
							<span className="text-muted-foreground">Origem</span>
							<strong>{sourceAccount.nome}</strong>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="text-muted-foreground">Destino</span>
							<strong>{destinationAccount.nome}</strong>
						</div>
						<div className="flex items-center justify-between gap-3 border-t border-border pt-2">
							<span className="text-muted-foreground">Valor transferido</span>
							<strong>{formatToMoney(state.valor)}</strong>
						</div>
					</div>
				</ResponsiveMenuSection>
			) : null}
		</ResponsiveMenu>
	);
}
