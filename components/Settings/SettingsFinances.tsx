"use client";

import NumberInput from "@/components/Inputs/NumberInput";
import SelectInput from "@/components/Inputs/SelectInput";
import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { useAccountCharts, useFinancesAccounts } from "@/lib/queries/finances";
import { cn } from "@/lib/utils";
import type { TOrganizationDefaults, TOrganizationPaymentMethodDefaults } from "@/schemas/organizations";
import { SalePaymentMethodsOptions } from "@/utils/select-options";
import { Calculator, ChevronDown, Database, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOrganizationSectionForm } from "./Organization/use-organization-section-form";
import { SettingsFormCard, SettingsFormSection } from "./SettingsFormCard";
import SettingsSectionActions from "./SettingsSectionActions";

type TFinancesDraft = Pick<TOrganizationDefaults, "contabilidade" | "pagamentos">;

const ACCOUNTING_ENTRY_KIND_LABELS = {
	vendas: "Vendas",
	compras: "Compras",
	perdasEstoque: "Perdas de Estoque",
	taxasCanal: "Taxas de Canal",
} as const;
type TAccountOption = { id: string; value: string; label: string };

// ---------------------------------------------------------------------------
// PaymentMethodCard
// ---------------------------------------------------------------------------
type PaymentMethodCardProps = {
	methodOption: (typeof SalePaymentMethodsOptions)[number];
	methodData: TOrganizationPaymentMethodDefaults;
	financialAccountOptions: TAccountOption[];
	editable: boolean;
	onChange: (key: string, data: TOrganizationPaymentMethodDefaults) => void;
};

function PaymentMethodCard({ methodOption, methodData, financialAccountOptions, editable, onChange }: PaymentMethodCardProps) {
	const { value, label, icon } = methodOption;

	function update(partial: Partial<TOrganizationPaymentMethodDefaults>) {
		onChange(value, { ...methodData, ...partial });
	}

	function updateParcelamento(partial: Partial<TOrganizationPaymentMethodDefaults["parcelamento"]>) {
		onChange(value, { ...methodData, parcelamento: { ...methodData.parcelamento, ...partial } });
	}

	const selectedAccount = financialAccountOptions.find((option) => option.value === methodData.contaFinanceiraPadraoId) ?? null;

	return (
		<Collapsible className="border-border bg-card rounded-lg border">
			<div className="flex items-center justify-between px-4 py-3">
				<div className="flex items-center gap-3">
					{icon}
					<span className="text-sm font-semibold tracking-tight">{label}</span>
					{methodData.suportado ? null : (
						<span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">DESATIVADO</span>
					)}
				</div>
				<div className="flex items-center gap-3">
					<Switch checked={methodData.suportado} onCheckedChange={(checked) => editable && update({ suportado: checked })} disabled={!editable} />
					<CollapsibleTrigger asChild>
						<Button variant="ghost" size="icon" className="h-7 w-7">
							<ChevronDown className="h-4 w-4 transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
						</Button>
					</CollapsibleTrigger>
				</div>
			</div>

			<CollapsibleContent>
				<div className="flex w-full flex-col gap-3 p-3">
					<SelectInput
						label="CONTA FINANCEIRA PADRÃO"
						value={selectedAccount?.value ?? null}
						options={financialAccountOptions}
						resetOptionLabel="Nenhuma conta"
						editable={editable}
						handleChange={(selected) => {
							const account = financialAccountOptions.find((option) => option.value === selected);
							update({ contaFinanceiraPadraoId: account?.value ?? null, contaFinanceiraPadraoKey: account?.label ?? null });
						}}
						onReset={() => update({ contaFinanceiraPadraoId: null, contaFinanceiraPadraoKey: null })}
					/>

					<div className="flex items-center justify-between gap-3">
						<div className="flex flex-col">
							<span className="text-foreground/80 text-sm font-medium tracking-tight">EDITÁVEL NA VENDA</span>
							<span className="text-muted-foreground text-xs">
								Permite ao operador trocar a conta deste método no PDV. A conta padrão segue pré-selecionada.
							</span>
						</div>
						<Switch
							checked={methodData.contaFinanceiraEditavel ?? false}
							onCheckedChange={(checked) => editable && update({ contaFinanceiraEditavel: checked })}
							disabled={!editable}
						/>
					</div>

					<div className="flex flex-col gap-1">
						<h3 className="text-foreground/80 text-sm font-medium tracking-tight">EFETIVAÇÃO PADRÃO</h3>
						<div className="flex items-center gap-2">
							{(["IMEDIATA", "PENDENTE"] as const).map((tipo) => (
								<Button
									key={tipo}
									variant={methodData.efetivacaoTipoPadrao === tipo ? "default" : "ghost"}
									size="fit"
									className={cn("rounded-lg px-2 py-1 text-xs", methodData.efetivacaoTipoPadrao === tipo ? "opacity-100" : "opacity-50")}
									onClick={() => editable && update({ efetivacaoTipoPadrao: tipo })}
									disabled={!editable}
								>
									{tipo}
								</Button>
							))}
						</div>
					</div>

					{methodData.efetivacaoTipoPadrao === "PENDENTE" ? (
						<NumberInput
							label="DELAY (DIAS)"
							value={methodData.delayDiasPadrao}
							placeholder="Número de dias..."
							handleChange={(delay) => update({ delayDiasPadrao: delay })}
							editable={editable}
						/>
					) : null}

					<div className="border-border bg-muted/30 mt-4 flex flex-col gap-3 rounded-lg border border-dashed p-3">
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">PARCELAMENTO</span>
							<div className="flex items-center gap-2">
								<Label className="text-muted-foreground text-xs">{methodData.parcelamento.permitido ? "PERMITIDO" : "NÃO PERMITIDO"}</Label>
								<Switch
									checked={methodData.parcelamento.permitido}
									onCheckedChange={(checked) => editable && updateParcelamento({ permitido: checked })}
									disabled={!editable}
								/>
							</div>
						</div>
						{methodData.parcelamento.permitido ? (
							<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
								<NumberInput
									label="MÍN. PARCELAS"
									value={methodData.parcelamento.minParcelas}
									placeholder="Ex: 2"
									handleChange={(parcelas) => updateParcelamento({ minParcelas: parcelas ?? 1 })}
									editable={editable}
								/>
								<NumberInput
									label="MÁX. PARCELAS"
									value={methodData.parcelamento.maxParcelas}
									placeholder="Ex: 12"
									handleChange={(parcelas) => updateParcelamento({ maxParcelas: parcelas })}
									editable={editable}
								/>
								<NumberInput
									label="INTERVALO (MESES)"
									value={methodData.parcelamento.intervaloMeses}
									placeholder="Ex: 1"
									handleChange={(intervalo) => updateParcelamento({ intervaloMeses: intervalo })}
									editable={editable}
								/>
							</div>
						) : null}
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
type SettingsFinancesProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

export default function SettingsFinances({ membership }: SettingsFinancesProps) {
	const { organization, isLoading, isError, isSuccess, error, save, isSaving } = useOrganizationSectionForm();
	const { data: accountChartsData } = useAccountCharts({ initialFilters: { search: "" } });
	const { data: financialAccountsData } = useFinancesAccounts({ initialFilters: { activeOnly: true, stats: false } });
	const [draft, setDraft] = useState<TFinancesDraft | null>(null);

	useEffect(() => {
		if (organization) {
			const contabilidade = organization.configuracao.defaults.contabilidade;
			setDraft({
				contabilidade: {
					...contabilidade,
					lancamentosPadrao: {
						...contabilidade.lancamentosPadrao,
						// Configs persistidas antes do bloco existir não passaram pelo default do Zod.
						perdasEstoque: contabilidade.lancamentosPadrao.perdasEstoque ?? {
							debitoContaId: null,
							debitoContaKey: null,
							creditoContaId: null,
							creditoContaKey: null,
						},
						taxasCanal: contabilidade.lancamentosPadrao.taxasCanal ?? {
							debitoContaId: null,
							debitoContaKey: null,
							creditoContaId: null,
							creditoContaKey: null,
						},
					},
				},
				pagamentos: organization.configuracao.defaults.pagamentos,
			});
		}
	}, [organization]);

	const accountChartsOptions = useMemo<TAccountOption[]>(
		() => (accountChartsData ?? []).map((account) => ({ id: account.id, value: account.id, label: account.nome })),
		[accountChartsData],
	);
	const financialAccountOptions = useMemo<TAccountOption[]>(
		() => (financialAccountsData?.accounts ?? []).map((account) => ({ id: account.id, value: account.id, label: account.nome })),
		[financialAccountsData],
	);

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!isSuccess || !organization || !draft) return null;

	// Capability do plano, não permissão do usuário: sem ERP não há lançamento automático para ajustar.
	if (!organization.configuracao.recursos.erp.acesso) {
		return (
			<div className="border-border flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-12 text-center">
				<Database className="text-muted-foreground h-8 w-8" />
				<p className="text-sm font-bold">O módulo ERP não está no seu plano</p>
				<p className="text-muted-foreground max-w-md text-sm">
					Com o ERP ativo, cada venda e cada compra gera lançamento contábil e financeiro sozinha, usando as contas e os métodos de pagamento definidos
					aqui. Fale com a gente para habilitar.
				</p>
			</div>
		);
	}

	const canEdit = membership.permissoes.empresa.editar;

	function updateAccounting(
		tipo: "vendas" | "compras" | "perdasEstoque" | "taxasCanal",
		partial: Partial<TOrganizationDefaults["contabilidade"]["lancamentosPadrao"]["compras"]>,
	) {
		setDraft((current) =>
			current
				? {
						...current,
						contabilidade: {
							...current.contabilidade,
							lancamentosPadrao: {
								...current.contabilidade.lancamentosPadrao,
								[tipo]: { ...current.contabilidade.lancamentosPadrao[tipo], ...partial },
							},
						},
					}
				: current,
		);
	}

	function updatePaymentMethod(key: string, data: TOrganizationPaymentMethodDefaults) {
		setDraft((current) =>
			current ? { ...current, pagamentos: { ...current.pagamentos, metodos: { ...current.pagamentos.metodos, [key]: data } } } : current,
		);
	}

	return (
		<SettingsFormCard
			footer={
				canEdit ? (
					<SettingsSectionActions
						isSaving={isSaving}
						onReset={() =>
							setDraft({ contabilidade: organization.configuracao.defaults.contabilidade, pagamentos: organization.configuracao.defaults.pagamentos })
						}
						onSave={() => save({ configuracao: { defaults: draft } })}
					/>
				) : undefined
			}
		>
			<SettingsFormSection title="LANÇAMENTOS CONTÁBEIS PADRÃO" icon={<Calculator className="h-4 w-4" />}>
				<p className="text-muted-foreground text-xs">Contas de débito e crédito usadas na geração automática de lançamentos.</p>
				{(["vendas", "compras", "perdasEstoque", "taxasCanal"] as const).map((tipo) => {
					const entry = draft.contabilidade.lancamentosPadrao[tipo];
					return (
						<div key={tipo} className="border-border bg-muted/20 flex flex-col gap-3 rounded-lg border p-4">
							<span className="text-foreground text-xs font-semibold tracking-wider uppercase">{ACCOUNTING_ENTRY_KIND_LABELS[tipo]}</span>
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<SelectInput
									label="CONTA DE DÉBITO PADRÃO"
									value={entry.debitoContaId ?? null}
									options={accountChartsOptions}
									resetOptionLabel="Nenhuma conta"
									editable={canEdit}
									handleChange={(selected) => {
										const account = accountChartsOptions.find((option) => option.value === selected);
										updateAccounting(tipo, { debitoContaId: account?.value ?? null, debitoContaKey: account?.label ?? null });
									}}
									onReset={() => updateAccounting(tipo, { debitoContaId: null, debitoContaKey: null })}
								/>
								<SelectInput
									label="CONTA DE CRÉDITO PADRÃO"
									value={entry.creditoContaId ?? null}
									options={accountChartsOptions}
									resetOptionLabel="Nenhuma conta"
									editable={canEdit}
									handleChange={(selected) => {
										const account = accountChartsOptions.find((option) => option.value === selected);
										updateAccounting(tipo, { creditoContaId: account?.value ?? null, creditoContaKey: account?.label ?? null });
									}}
									onReset={() => updateAccounting(tipo, { creditoContaId: null, creditoContaKey: null })}
								/>
							</div>
							{/* Só a compra reparte o débito: o que o fornecedor cobra vira estoque, crédito tributário
							    ou despesa do período conforme o tratamento de cada item. */}
							{tipo === "compras" ? (
								<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
									<SelectInput
										label="CONTA DE CRÉDITO TRIBUTÁRIO"
										value={draft.contabilidade.lancamentosPadrao.compras.debitoCreditoTributarioContaId ?? null}
										options={accountChartsOptions}
										resetOptionLabel="Nenhuma conta"
										editable={canEdit}
										handleChange={(selected) => {
											const account = accountChartsOptions.find((option) => option.value === selected);
											updateAccounting(tipo, {
												debitoCreditoTributarioContaId: account?.value ?? null,
												debitoCreditoTributarioContaKey: account?.label ?? null,
											});
										}}
										onReset={() => updateAccounting(tipo, { debitoCreditoTributarioContaId: null, debitoCreditoTributarioContaKey: null })}
									/>
									<SelectInput
										label="CONTA DE DESPESAS DO PERÍODO"
										value={draft.contabilidade.lancamentosPadrao.compras.debitoDespesaPeriodoContaId ?? null}
										options={accountChartsOptions}
										resetOptionLabel="Nenhuma conta"
										editable={canEdit}
										handleChange={(selected) => {
											const account = accountChartsOptions.find((option) => option.value === selected);
											updateAccounting(tipo, {
												debitoDespesaPeriodoContaId: account?.value ?? null,
												debitoDespesaPeriodoContaKey: account?.label ?? null,
											});
										}}
										onReset={() => updateAccounting(tipo, { debitoDespesaPeriodoContaId: null, debitoDespesaPeriodoContaKey: null })}
									/>
									{/* Débito do custo por destinação do item (ADR-0002): revenda usa a conta de débito padrão. */}
									{(
										[
											["INSUMO", "CONTA DE ESTOQUE DE INSUMOS"],
											["USO_CONSUMO", "CONTA DE MATERIAL DE USO E CONSUMO"],
										] as const
									).map(([destinacao, label]) => {
										const porDestinacao = draft.contabilidade.lancamentosPadrao.compras.contasDebitoPorDestinacao;
										return (
											<SelectInput
												key={destinacao}
												label={label}
												value={porDestinacao?.[destinacao]?.contaId ?? null}
												options={accountChartsOptions}
												resetOptionLabel="Conta padrão do plano"
												editable={canEdit}
												handleChange={(selected) => {
													const account = accountChartsOptions.find((option) => option.value === selected);
													updateAccounting(tipo, {
														contasDebitoPorDestinacao: {
															...porDestinacao,
															[destinacao]: { contaId: account?.value ?? null, contaKey: account?.label ?? null },
														},
													});
												}}
												onReset={() =>
													updateAccounting(tipo, {
														contasDebitoPorDestinacao: { ...porDestinacao, [destinacao]: { contaId: null, contaKey: null } },
													})
												}
											/>
										);
									})}
								</div>
							) : null}
						</div>
					);
				})}
			</SettingsFormSection>

			<SettingsFormSection title="MÉTODOS DE PAGAMENTO" icon={<Wallet className="h-4 w-4" />}>
				<p className="text-muted-foreground text-xs">Padrões de cada método de pagamento usado na organização.</p>
				<div className="flex flex-col gap-2">
					{SalePaymentMethodsOptions.map((option) => {
						const methodData = draft.pagamentos.metodos[option.value];
						if (!methodData) return null;
						return (
							<PaymentMethodCard
								key={option.value}
								methodOption={option}
								methodData={methodData}
								financialAccountOptions={financialAccountOptions}
								editable={canEdit}
								onChange={updatePaymentMethod}
							/>
						);
					})}
				</div>
			</SettingsFormSection>
		</SettingsFormCard>
	);
}
