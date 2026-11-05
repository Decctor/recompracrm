"use client";

import DateInput from "@/components/Inputs/DateInput";
import DateTimeInput from "@/components/Inputs/DateTimeInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import TextInput from "@/components/Inputs/TextInput";
import ResponsiveMenu from "@/components/Utils/ResponsiveMenu";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TCreateCreditCardPaymentInput } from "@/app/api/finances/credit-card-invoices/payment/route";
import type { TGetCreditCardInvoiceOutput } from "@/app/api/finances/credit-card-invoices/route";
import type { TGetFinancialAccountsOutputDefault } from "@/app/api/finances/financial-accounts/route";
import { getErrorMessage } from "@/lib/errors";
import { invalidateFinanceQueries } from "@/lib/finances/invalidate-finance-queries";
import { formatDateForInputValue, formatDateOnInputChange, formatToMoney } from "@/lib/formatting";
import { createCreditCardPayment } from "@/lib/mutations/finances";
import { FinancialAccountTypeOptions } from "@/utils/select-options";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CircleDollarSign, FileText, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type TAccount = TGetFinancialAccountsOutputDefault["accounts"][number];
type TPaymentState = TCreateCreditCardPaymentInput["payment"];

export default function NewCreditCardPayment({
	invoice,
	cardAccount,
	accounts,
	closeMenu,
}: {
	invoice: TGetCreditCardInvoiceOutput;
	cardAccount: TAccount;
	accounts: TAccount[];
	closeMenu: () => void;
}) {
	const queryClient = useQueryClient();
	const dueDate = useMemo(() => new Date(`${invoice.dataVencimento}T12:00:00`), [invoice.dataVencimento]);
	const [state, setState] = useState<TPaymentState>(() => ({
		titulo: `Pagamento fatura ${invoice.dataVencimento}`,
		anotacoes: null,
		contaCartaoId: cardAccount.id,
		contaFinanceiraOrigemId: cardAccount.configuracao?.categoria === "CARTAO_CREDITO" ? cardAccount.configuracao.contaPagamentoPadraoId : null,
		valor: invoice.saldoAberto,
		dataVencimento: dueDate,
		dataEfetivacao: new Date(),
		idempotencyKey: crypto.randomUUID(),
	}));
	const sourceOptions = accounts
		.filter((account) => account.tipo === "CAIXA" || account.tipo === "BANCO" || account.tipo === "CARTEIRA_DIGITAL")
		.map((account) => ({
			id: account.id,
			value: account.id,
			label: account.nome,
			startContent: FinancialAccountTypeOptions.find((option) => option.value === account.tipo)?.icon,
		}));

	const { mutate, isPending } = useMutation({
		mutationKey: ["create-credit-card-payment"],
		mutationFn: createCreditCardPayment,
		onSuccess: (result) => {
			toast.success(result.message);
			void invalidateFinanceQueries(queryClient);
			closeMenu();
		},
		onError: (error) => toast.error(getErrorMessage(error)),
	});

	function updateState(patch: Partial<TPaymentState>) {
		setState((previous) => ({ ...previous, ...patch }));
	}

	return (
		<ResponsiveMenu
			menuTitle="PAGAR FATURA DO CARTÃO"
			menuDescription={`Fatura de ${cardAccount.nome} com vencimento em ${invoice.dataVencimento}.`}
			menuActionButtonText="REGISTRAR PAGAMENTO"
			menuCancelButtonText="CANCELAR"
			actionFunction={() => mutate({ payment: state })}
			actionIsLoading={isPending}
			closeMenu={closeMenu}
			stateIsLoading={false}
		>
			<ResponsiveMenuSection title="IDENTIFICAÇÃO" icon={<FileText className="h-4 w-4" />}>
				<TextInput
					label="TÍTULO"
					placeholder="Informe o título do pagamento..."
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
				<div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
					Cartão: <strong>{cardAccount.nome}</strong>
				</div>
				<SelectInput
					label="CONTA DE ORIGEM"
					value={state.contaFinanceiraOrigemId ?? ""}
					options={sourceOptions}
					resetOptionLabel="Selecione a conta que fará o pagamento"
					onReset={() => updateState({ contaFinanceiraOrigemId: null })}
					handleChange={(contaFinanceiraOrigemId) => updateState({ contaFinanceiraOrigemId })}
					required
				/>
			</ResponsiveMenuSection>
			<ResponsiveMenuSection title="VALORES E DATAS" icon={<CalendarDays className="h-4 w-4" />}>
				<NumberInput
					label="VALOR DO PAGAMENTO"
					placeholder="Informe o valor do pagamento..."
					value={state.valor}
					handleChange={(valor) => updateState({ valor })}
					required
				/>
				<DateInput
					label="VENCIMENTO DA FATURA"
					value={formatDateForInputValue(state.dataVencimento)}
					handleChange={(value) => updateState({ dataVencimento: formatDateOnInputChange(value, "date") ?? state.dataVencimento })}
					required
				/>
				<DateTimeInput
					label="DATA E HORA DO PAGAMENTO"
					value={formatDateForInputValue(state.dataEfetivacao, "datetime")}
					handleChange={(value) => updateState({ dataEfetivacao: formatDateOnInputChange(value, "date") ?? state.dataEfetivacao })}
					required
				/>
			</ResponsiveMenuSection>
			<ResponsiveMenuSection title="RESUMO" icon={<CircleDollarSign className="h-4 w-4" />}>
				<div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm">
					<span className="text-muted-foreground">Saldo em aberto</span>
					<strong>{formatToMoney(invoice.saldoAberto)}</strong>
				</div>
			</ResponsiveMenuSection>
		</ResponsiveMenu>
	);
}
