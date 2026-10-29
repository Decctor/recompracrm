"use client";

import DateInput from "@/components/Inputs/DateInput";
import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import TextInput from "@/components/Inputs/TextInput";
import TextareaInput from "@/components/Inputs/TextareaInput";
import ResponsiveMenuSection from "@/components/Utils/ResponsiveMenuSection";
import { useAccountCharts, useFinancesAccounts } from "@/lib/queries/finances";
import type { TFinancialAccountConfiguration } from "@/schemas/financial";
import { PaymentMethodEnum } from "@/schemas/enums";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments/labels";
import { getDefaultFinancialAccountReceipts } from "@/lib/finances/financial-account-configuration";
import type { TFinancialAccountTypeEnum } from "@/schemas/enums";
import type { TFinancialAccountFormState, TUseInternalFinancialAccountState } from "@/state-hooks/use-internal-financial-account-state";
import { FinancialAccountTypeOptions } from "@/utils/select-options";
import { Banknote, CreditCard, Info, Landmark, Wallet } from "lucide-react";
import { useMemo } from "react";

const ACCOUNT_TYPE_OPTIONS = FinancialAccountTypeOptions.map((option) => ({
	id: option.id,
	value: option.value,
	label: option.label,
	startContent: option.icon,
}));

const BANK_ACCOUNT_TYPE_OPTIONS = [
	{ id: "CORRENTE", value: "CORRENTE", label: "CONTA CORRENTE" },
	{ id: "POUPANCA", value: "POUPANCA", label: "CONTA POUPANÇA" },
	{ id: "PAGAMENTO", value: "PAGAMENTO", label: "CONTA DE PAGAMENTO" },
];

type FinancialAccountFormProps = {
	state: TFinancialAccountFormState;
	updateState: TUseInternalFinancialAccountState["updateState"];
	updateConfiguration: TUseInternalFinancialAccountState["updateConfiguration"];
	updateType: TUseInternalFinancialAccountState["updateType"];
	editable?: boolean;
	allowTypeChange?: boolean;
};

export default function FinancialAccountForm({
	state,
	updateState,
	updateConfiguration,
	updateType,
	editable = true,
	allowTypeChange = true,
}: FinancialAccountFormProps) {
	const { data: accountCharts } = useAccountCharts({ initialFilters: { search: "" } });
	const { data: accountsData } = useFinancesAccounts({ initialFilters: { activeOnly: true, stats: false } });
	const bankConfig = state.configuracao.categoria === "BANCO" ? state.configuracao : null;
	const creditCardConfig = state.configuracao.categoria === "CARTAO_CREDITO" ? state.configuracao : null;

	const accountChartOptions = useMemo(
		() =>
			(accountCharts ?? []).map((account) => ({
				id: account.id,
				value: account.id,
				label: `${account.codigo ? `${account.codigo} - ` : ""}${account.nome}`,
			})),
		[accountCharts],
	);

	const paymentAccountOptions = useMemo(
		() =>
			(accountsData?.accounts ?? [])
				.filter((account) => account.id !== state.id && ["CAIXA", "BANCO", "CARTEIRA_DIGITAL"].includes(account.tipo))
				.map((account) => ({
					id: account.id,
					value: account.id,
					label: account.nome,
					startContent: FinancialAccountTypeOptions.find((option) => option.value === account.tipo)?.icon,
				})),
		[accountsData?.accounts, state.id],
	);

	function updateConfig(patch: Partial<TFinancialAccountConfiguration>) {
		updateConfiguration(patch);
	}

	function updateTypeFromInput(value: string) {
		updateType(value as TFinancialAccountTypeEnum);
	}

	return (
		<div className="flex w-full flex-col gap-6">
			<ResponsiveMenuSection title="INFORMAÇÕES BÁSICAS" icon={<Info className="h-4 w-4" />}>
				<TextInput
					label="NOME DA CONTA"
					placeholder="Ex.: Banco principal"
					value={state.nome}
					handleChange={(nome) => updateState({ nome })}
					required
					editable={editable}
				/>
				<TextareaInput
					label="DESCRIÇÃO"
					placeholder="Descrição opcional da conta..."
					value={state.descricao ?? ""}
					handleChange={(descricao) => updateState({ descricao: descricao || null })}
					editable={editable}
				/>
				<SelectInput
					label="TIPO DE CONTA"
					value={state.tipo}
					options={ACCOUNT_TYPE_OPTIONS}
					resetOptionLabel="SELECIONE O TIPO"
					handleChange={updateTypeFromInput}
					onReset={() => updateType("BANCO")}
					required
					editable={editable && allowTypeChange}
				/>
				<SelectInput
					label="CONTA CONTÁBIL VINCULADA"
					value={state.contaContabilId}
					options={accountChartOptions}
					resetOptionLabel="NENHUMA CONTA"
					handleChange={(contaContabilId) => updateState({ contaContabilId })}
					onReset={() => updateState({ contaContabilId: null })}
					editable={editable}
				/>
				{state.chaveSistema ? <p className="text-xs text-muted-foreground">Conta gerenciada pelo sistema: {state.chaveSistema}.</p> : null}
			</ResponsiveMenuSection>

			<ResponsiveMenuSection title="SALDO INICIAL" icon={<Wallet className="h-4 w-4" />}>
				<NumberInput
					label="SALDO INICIAL (R$)"
					placeholder="0,00"
					value={state.saldoInicial}
					handleChange={(saldoInicial) => updateState({ saldoInicial })}
					editable={editable}
				/>
				<DateInput
					label="DATA DO SALDO INICIAL"
					value={formatDateForInputValue(state.dataSaldoInicial)}
					handleChange={(value) => updateState({ dataSaldoInicial: formatDateOnInputChange(value, "date") ?? state.dataSaldoInicial })}
					required
					editable={editable}
				/>
			</ResponsiveMenuSection>

			{bankConfig ? (
				<ResponsiveMenuSection title="DADOS BANCÁRIOS" icon={<Landmark className="h-4 w-4" />}>
					<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
						<TextInput
							label="CÓDIGO DO BANCO"
							placeholder="Ex.: 001"
							value={bankConfig.codigo ?? ""}
							handleChange={(codigo) => updateConfig({ codigo } as Partial<TFinancialAccountConfiguration>)}
							editable={editable}
						/>
						<TextInput
							label="NOME DO BANCO"
							placeholder="Ex.: Banco do Brasil"
							value={bankConfig.nome ?? ""}
							handleChange={(nome) => updateConfig({ nome } as Partial<TFinancialAccountConfiguration>)}
							editable={editable}
						/>
					</div>
					<div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
						<TextInput
							label="AGÊNCIA"
							placeholder="Ex.: 1234"
							value={bankConfig.agencia ?? ""}
							handleChange={(agencia) => updateConfig({ agencia } as Partial<TFinancialAccountConfiguration>)}
							editable={editable}
						/>
						<TextInput
							label="CONTA"
							placeholder="Ex.: 12345"
							value={bankConfig.contaNumero ?? ""}
							handleChange={(contaNumero) => updateConfig({ contaNumero } as Partial<TFinancialAccountConfiguration>)}
							editable={editable}
						/>
						<TextInput
							label="DÍGITO"
							placeholder="Ex.: 0"
							value={bankConfig.contaDigito ?? ""}
							handleChange={(contaDigito) => updateConfig({ contaDigito } as Partial<TFinancialAccountConfiguration>)}
							editable={editable}
						/>
					</div>
					<SelectInput
						label="TIPO DE CONTA BANCÁRIA"
						value={bankConfig.tipo ?? null}
						options={BANK_ACCOUNT_TYPE_OPTIONS}
						resetOptionLabel="SELECIONE O TIPO"
						handleChange={(tipo) => updateConfig({ tipo } as Partial<TFinancialAccountConfiguration>)}
						onReset={() => updateConfig({ tipo: "CORRENTE" } as Partial<TFinancialAccountConfiguration>)}
						editable={editable}
					/>
				</ResponsiveMenuSection>
			) : null}

			{creditCardConfig ? (
				<ResponsiveMenuSection title="CONFIGURAÇÃO DO CARTÃO" icon={<CreditCard className="h-4 w-4" />}>
					<NumberInput
						label="LIMITE DE CRÉDITO (R$)"
						placeholder="0,00"
						value={creditCardConfig.limiteCredito ?? 0}
						handleChange={(limiteCredito) => updateConfig({ limiteCredito: limiteCredito || null } as Partial<TFinancialAccountConfiguration>)}
						editable={editable}
					/>
					<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
						<NumberInput
							label="DIA DE FECHAMENTO"
							placeholder="25"
							value={creditCardConfig.diaFechamentoFatura}
							handleChange={(diaFechamentoFatura) => updateConfig({ diaFechamentoFatura } as Partial<TFinancialAccountConfiguration>)}
							editable={editable}
						/>
						<NumberInput
							label="DIA DE VENCIMENTO"
							placeholder="5"
							value={creditCardConfig.diaVencimentoFatura}
							handleChange={(diaVencimentoFatura) => updateConfig({ diaVencimentoFatura } as Partial<TFinancialAccountConfiguration>)}
							editable={editable}
						/>
					</div>
					<SelectInput
						label="CONTA PADRÃO PARA PAGAMENTO"
						value={creditCardConfig.contaPagamentoPadraoId ?? null}
						options={paymentAccountOptions}
						resetOptionLabel="NENHUMA CONTA"
						handleChange={(contaPagamentoPadraoId) => updateConfig({ contaPagamentoPadraoId } as Partial<TFinancialAccountConfiguration>)}
						onReset={() => updateConfig({ contaPagamentoPadraoId: null } as Partial<TFinancialAccountConfiguration>)}
						editable={editable}
					/>
					<div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
						<NumberInput
							label="JUROS MENSAL (%)"
							placeholder="0"
							value={creditCardConfig.taxaJurosMensal ?? 0}
							handleChange={(taxaJurosMensal) => updateConfig({ taxaJurosMensal: taxaJurosMensal || null } as Partial<TFinancialAccountConfiguration>)}
							editable={editable}
						/>
						<NumberInput
							label="MULTA (%)"
							placeholder="0"
							value={creditCardConfig.taxaMulta ?? 0}
							handleChange={(taxaMulta) => updateConfig({ taxaMulta: taxaMulta || null } as Partial<TFinancialAccountConfiguration>)}
							editable={editable}
						/>
						<NumberInput
							label="TAXA FIXA (R$)"
							placeholder="0,00"
							value={creditCardConfig.taxaFixa ?? 0}
							handleChange={(taxaFixa) => updateConfig({ taxaFixa: taxaFixa || null } as Partial<TFinancialAccountConfiguration>)}
							editable={editable}
						/>
					</div>
				</ResponsiveMenuSection>
			) : null}

			<ResponsiveMenuSection title="RECEBIMENTOS" icon={<CreditCard className="size-4" />}>
				<p className="text-sm text-muted-foreground">
					Defina como os pagamentos recebidos nesta conta geram transações. Esta regra é aplicada automaticamente nas vendas.
				</p>
				{PaymentMethodEnum.options.map((method) => {
					const receipts = state.configuracao.recebimentos ?? getDefaultFinancialAccountReceipts("TRANSACOES_PARCELADAS");
					const rule = receipts.metodos.find((entry) => entry.metodo === method);
					function changeBehavior(value: string) {
						updateConfiguration({ recebimentos: { metodos: [
							...receipts.metodos.filter((entry) => entry.metodo !== method),
							...(value === "DESABILITADO" ? [] : [{ metodo: method, comportamentoParcelas: value as "TRANSACAO_UNICA" | "TRANSACOES_PARCELADAS" }]),
						] } });
					}
					return <SelectInput
						key={method}
						label={PAYMENT_METHOD_LABELS[method]}
						value={rule?.comportamentoParcelas ?? "DESABILITADO"}
						options={[
							{ id: "DESABILITADO", value: "DESABILITADO", label: "NÃO RECEBER NESTA CONTA" },
							{ id: "TRANSACAO_UNICA", value: "TRANSACAO_UNICA", label: "TRANSAÇÃO ÚNICA — TOTAL NA CONFIRMAÇÃO" },
							...(method === "CARTAO_CREDITO" ? [{ id: "TRANSACOES_PARCELADAS", value: "TRANSACOES_PARCELADAS", label: "TRANSAÇÕES PARCELADAS — BAIXA INDIVIDUAL" }] : []),
						]}
						resetOptionLabel="NÃO RECEBER NESTA CONTA"
						handleChange={changeBehavior}
						onReset={() => changeBehavior("DESABILITADO")}
						editable={editable && !state.chaveSistema}
					/>;
				})}
				<p className="text-xs text-muted-foreground">Terminais integrados aguardam aprovação e confirmam uma transação pelo total. Taxas e repasses não são calculados nesta configuração.</p>
			</ResponsiveMenuSection>

			{state.id ? (
				<ResponsiveMenuSection title="STATUS" icon={<Banknote className="h-4 w-4" />}>
					<SelectInput
						label="STATUS DA CONTA"
						value={state.ativo ? "true" : "false"}
						options={[
							{ id: "true", value: "true", label: "ATIVA" },
							{ id: "false", value: "false", label: "INATIVA" },
						]}
						resetOptionLabel="SELECIONE O STATUS"
						handleChange={(value) => updateState({ ativo: value === "true" })}
						onReset={() => updateState({ ativo: true })}
						editable={editable && !state.chaveSistema}
					/>
				</ResponsiveMenuSection>
			) : null}
		</div>
	);
}

function formatDateForInputValue(date: Date | string) {
	return new Date(date).toISOString().slice(0, 10);
}

function formatDateOnInputChange(value: string | undefined, type: "date") {
	if (!value || type !== "date") return null;
	return new Date(`${value}T12:00:00`);
}
