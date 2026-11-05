"use client";

import type { TGetFinancialAccountsOutputDefault } from "@/app/api/finances/financial-accounts/route";
import DateTimeInput from "@/components/Inputs/DateTimeInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import { FinancialAccountTypeOptions, SalePaymentMethodsOptions } from "@/utils/select-options";
import { CheckCircle2 } from "lucide-react";
import { useMemo } from "react";

type FinancialTransactionEffectBlockProps = {
	financialAccounts: TGetFinancialAccountsOutputDefault["accounts"];
	effectDate: string | undefined;
	setEffectDate: (value: string | undefined) => void;
	selectedAccountId: string | null;
	setSelectedAccountId: (value: string | null) => void;
	selectedMethod: TPaymentMethodEnum;
	setSelectedMethod: (value: TPaymentMethodEnum) => void;
	allowMethodChange: boolean;
};

export default function FinancialTransactionEffectBlock({
	financialAccounts,
	effectDate,
	setEffectDate,
	selectedAccountId,
	setSelectedAccountId,
	selectedMethod,
	setSelectedMethod,
	allowMethodChange,
}: FinancialTransactionEffectBlockProps) {
	const financialAccountOptions = useMemo(
		() =>
			financialAccounts.map((account) => {
				const typeConfig = FinancialAccountTypeOptions.find((option) => option.value === account.tipo);
				return {
					id: account.id,
					value: account.id,
					label: account.nome,
					startContent: typeConfig?.icon,
				};
			}),
		[financialAccounts],
	);

	const paymentMethodOptions = useMemo(
		() =>
			SalePaymentMethodsOptions.filter((option) => option.value !== "A_DEFINIR").map((option) => ({
				id: option.id,
				value: option.value,
				label: option.label,
				startContent: option.icon,
			})),
		[],
	);

	return (
		<ResponsiveMenuSection title="EFETIVAÇÃO" icon={<CheckCircle2 className="h-4 w-4 min-h-4 min-w-4" />}>
			<DateTimeInput label="DATA E HORA DA EFETIVAÇÃO" value={effectDate} handleChange={setEffectDate} />
			<SelectInput
				label="CONTA FINANCEIRA"
				value={selectedAccountId}
				resetOptionLabel="Sem conta"
				options={financialAccountOptions}
				handleChange={(value) => setSelectedAccountId(value)}
				onReset={() => setSelectedAccountId(null)}
			/>
			<SelectInput
				label="MÉTODO FINAL"
				value={selectedMethod}
				resetOptionLabel="Selecione o método"
				options={paymentMethodOptions}
				handleChange={(value) => setSelectedMethod(value as TPaymentMethodEnum)}
				onReset={() => setSelectedMethod("DINHEIRO")}
				editable={allowMethodChange}
			/>
		</ResponsiveMenuSection>
	);
}
