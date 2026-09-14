"use client";

import { HandCoins } from "lucide-react";
import { useMemo } from "react";
import type { TGetFinancialAccountsOutputDefault } from "@/app/api/finances/financial-accounts/route";
import DateInput from "@/components/Inputs/DateInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { formatDateAsLocale, formatToMoney } from "@/lib/formatting";
import type { TPaymentMethodEnum } from "@/schemas/enums";
import type { TUseInternalStoreCreditReceiptState } from "@/state-hooks/use-internal-store-credit-receipt-state";
import { FinancialAccountTypeOptions, SalePaymentMethodsOptions } from "@/utils/select-options";

/** Valor do destino quando o dinheiro vai para a gaveta da sessão aberta, e não para uma conta. */
export const STORE_CREDIT_SESSION_DESTINATION = "sessao-de-caixa";

export type TStoreCreditActiveSession = { id: string; dataAbertura: Date | string; contaFinanceiraId: string | null } | null;

type StoreCreditReceiptBlockProps = {
	state: TUseInternalStoreCreditReceiptState["state"];
	saldoTotal: number;
	temSaldoRemanescente: boolean;
	financialAccounts: TGetFinancialAccountsOutputDefault["accounts"];
	activeSession: TStoreCreditActiveSession;
	updateReceipt: TUseInternalStoreCreditReceiptState["updateReceipt"];
	updateValor: TUseInternalStoreCreditReceiptState["updateValor"];
	settleAll: TUseInternalStoreCreditReceiptState["settleAll"];
};

export default function StoreCreditReceiptBlock({
	state,
	saldoTotal,
	temSaldoRemanescente,
	financialAccounts,
	activeSession,
	updateReceipt,
	updateValor,
	settleAll,
}: StoreCreditReceiptBlockProps) {
	// Fiado não se recebe em fiado, e "a definir" não faz o dinheiro entrar em conta nenhuma.
	const paymentMethodOptions = useMemo(
		() =>
			SalePaymentMethodsOptions.filter((option) => option.value !== "A_DEFINIR" && option.value !== "FIADO_NOTA").map((option) => ({
				id: option.id,
				value: option.value,
				label: option.label,
				startContent: option.icon,
			})),
		[],
	);

	const destinationOptions = useMemo(() => {
		const accountOptions = financialAccounts.map((account) => {
			const typeConfig = FinancialAccountTypeOptions.find((option) => option.value === account.tipo);
			return { id: account.id, value: account.id, label: account.nome, startContent: typeConfig?.icon };
		});
		if (!activeSession) return accountOptions;
		return [
			{
				id: STORE_CREDIT_SESSION_DESTINATION,
				value: STORE_CREDIT_SESSION_DESTINATION,
				label: `Caixa aberto em ${formatDateAsLocale(activeSession.dataAbertura, true)}`,
				startContent: undefined,
			},
			...accountOptions,
		];
	}, [financialAccounts, activeSession]);

	const destinationValue = state.sessaoVendaId ? STORE_CREDIT_SESSION_DESTINATION : state.contaFinanceiraId;

	return (
		<ResponsiveMenuSection title="RECEBIMENTO" icon={<HandCoins className="h-4 w-4 min-h-4 min-w-4" />}>
			<div className="flex w-full flex-col gap-1">
				<NumberInput label="VALOR RECEBIDO" placeholder="0,00" value={state.valor} handleChange={updateValor} required />
				<div className="flex items-center justify-between gap-2">
					<span className="text-numeric text-[0.65rem] text-muted-foreground">Devido: {formatToMoney(saldoTotal)}</span>
					<button
						type="button"
						onClick={settleAll}
						className="rounded-md px-2 py-1 text-[0.65rem] font-medium text-primary transition-colors hover:bg-primary/10"
					>
						QUITAR TUDO
					</button>
				</div>
			</div>

			<DateInput
				label="DATA DO RECEBIMENTO"
				value={state.dataRecebimento}
				handleChange={(value) => updateReceipt({ dataRecebimento: value })}
				required
			/>

			<SelectInput
				label="FORMA DE RECEBIMENTO"
				value={state.metodo}
				resetOptionLabel="Selecione a forma"
				options={paymentMethodOptions}
				handleChange={(value) => updateReceipt({ metodo: value as TPaymentMethodEnum })}
				onReset={() => updateReceipt({ metodo: "DINHEIRO" })}
			/>

			<div className="flex w-full flex-col gap-1">
				<SelectInput
					label="DESTINO DO DINHEIRO"
					value={destinationValue}
					resetOptionLabel="Sem destino definido"
					options={destinationOptions}
					handleChange={(value) =>
						value === STORE_CREDIT_SESSION_DESTINATION
							? updateReceipt({ sessaoVendaId: activeSession?.id ?? null, contaFinanceiraId: null })
							: updateReceipt({ sessaoVendaId: null, contaFinanceiraId: value })
					}
					onReset={() => updateReceipt({ sessaoVendaId: null, contaFinanceiraId: null })}
				/>
				{state.sessaoVendaId ? (
					<span className="text-[0.65rem] text-muted-foreground">
						O valor entra no esperado de gaveta desta sessão — é lá que o dinheiro vai estar no fechamento.
					</span>
				) : null}
			</div>

			{/* Só aparece quando de fato vai nascer um saldo: perguntar a previsão de um remanescente
			    que não existe é pedir uma decisão sobre nada. */}
			{temSaldoRemanescente ? (
				<DateInput label="NOVA PREVISÃO DO SALDO" value={state.novaDataPrevisao} handleChange={(value) => updateReceipt({ novaDataPrevisao: value })} />
			) : null}

			<TextareaInput
				label="OBSERVAÇÕES"
				placeholder="Alguma observação sobre este recebimento?"
				value={state.observacoes}
				handleChange={(value) => updateReceipt({ observacoes: value })}
			/>
		</ResponsiveMenuSection>
	);
}
