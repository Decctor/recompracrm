"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ACQUISITION_NATURE_LABELS } from "@/lib/purchase/entry-rules";
import type { TAcquisitionNatureEnum, TPurchaseCostModifierKeyEnum, TPurchaseCostTreatmentEnum, TPurchaseEntryTaxRegimeEnum } from "@/schemas/enums";
import type { TUseInternalFiscalSettingsState } from "@/state-hooks/use-internal-fiscal-settings-state";

type PurchaseEntrySettingsProps = {
	fiscalConfig: TUseInternalFiscalSettingsState["state"]["fiscalConfiguracao"];
	updateFiscalConfig: TUseInternalFiscalSettingsState["updateFiscalConfig"];
	disabled: boolean;
};

const REGIME_OPTIONS: { value: TPurchaseEntryTaxRegimeEnum; label: string }[] = [
	{ value: "SIMPLES_NACIONAL", label: "Simples Nacional" },
	{ value: "LUCRO_PRESUMIDO", label: "Lucro Presumido" },
	{ value: "LUCRO_REAL", label: "Lucro Real" },
];

const TAX_ROWS: { chave: TPurchaseCostModifierKeyEnum; label: string }[] = [
	{ chave: "IMPOSTOS_ICMS", label: "ICMS (embutido)" },
	{ chave: "IMPOSTOS_ICMS_SN", label: "Crédito de ICMS do Simples (embutido)" },
	{ chave: "IMPOSTOS_PIS", label: "PIS (embutido)" },
	{ chave: "IMPOSTOS_COFINS", label: "COFINS (embutido)" },
	{ chave: "IMPOSTOS_IPI", label: "IPI" },
	{ chave: "IMPOSTOS_ICMS_ST", label: "ICMS-ST" },
	{ chave: "IMPOSTOS_FCP_ST", label: "FCP-ST" },
];

const DESTINATIONS: TAcquisitionNatureEnum[] = ["REVENDA", "INSUMO", "USO_CONSUMO"];

const TREATMENT_OPTIONS: { value: "" | TPurchaseCostTreatmentEnum; label: string }[] = [
	{ value: "", label: "Preset do regime" },
	{ value: "CUSTO_ESTOQUE", label: "Custo" },
	{ value: "CREDITO_TRIBUTARIO", label: "Crédito" },
	{ value: "DESPESA_PERIODO", label: "Despesa" },
];

/**
 * Regras de entrada de compras (ADR-0002, decisão 7): o regime decide o preset; a matriz são as
 * exceções da organização. Sem regime, os tributos ficam pendentes de revisão no builder.
 */
export function PurchaseEntrySettings({ fiscalConfig, updateFiscalConfig, disabled }: PurchaseEntrySettingsProps) {
	const entrada = fiscalConfig.entrada;
	const overrides = (entrada.tratamentos ?? {}) as Partial<
		Record<TAcquisitionNatureEnum, Partial<Record<TPurchaseCostModifierKeyEnum, TPurchaseCostTreatmentEnum>>>
	>;

	const setOverride = (destinacao: TAcquisitionNatureEnum, chave: TPurchaseCostModifierKeyEnum, value: "" | TPurchaseCostTreatmentEnum) => {
		const current = { ...overrides[destinacao] };
		if (value) current[chave] = value;
		else delete current[chave];
		updateFiscalConfig({ entrada: { ...entrada, tratamentos: { ...overrides, [destinacao]: current } } });
	};

	return (
		<div className="space-y-3 rounded-lg border p-4">
			<div>
				<Label>ENTRADA DE COMPRAS</Label>
				<p className="text-sm text-muted-foreground">
					Como os tributos das notas de compra são tratados: no custo do produto, como crédito a compensar ou como despesa. Confirme com a sua
					contabilidade.
				</p>
			</div>
			<div className="flex flex-col gap-3 lg:flex-row lg:items-end">
				<label className="flex w-full flex-col gap-1 lg:w-64">
					<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regime de apuração</span>
					<select
						disabled={disabled}
						value={entrada.regimeApuracao ?? ""}
						onChange={(event) =>
							updateFiscalConfig({ entrada: { ...entrada, regimeApuracao: (event.target.value || null) as TPurchaseEntryTaxRegimeEnum | null } })
						}
						className="h-9 rounded-md border border-border bg-background px-2 text-sm"
					>
						<option value="">Não definido · tributos ficam para revisão</option>
						{REGIME_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 lg:w-96">
					<div>
						<p className="text-sm font-semibold">Contribuinte de IPI</p>
						<p className="text-xs text-muted-foreground">Indústria ou equiparado: o IPI das compras vira crédito no Presumido e no Real.</p>
					</div>
					<Switch
						checked={entrada.contribuinteIpi}
						disabled={disabled}
						onCheckedChange={(checked) => updateFiscalConfig({ entrada: { ...entrada, contribuinteIpi: checked } })}
					/>
				</div>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full text-xs">
					<thead>
						<tr className="text-left text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
							<th className="py-1.5 pr-2">Tributo</th>
							{DESTINATIONS.map((destinacao) => (
								<th key={destinacao} className="py-1.5 pr-2">
									{ACQUISITION_NATURE_LABELS[destinacao]}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{TAX_ROWS.map((row) => (
							<tr key={row.chave} className="border-t border-border">
								<td className="py-1.5 pr-2 font-medium">{row.label}</td>
								{DESTINATIONS.map((destinacao) => (
									<td key={destinacao} className="py-1.5 pr-2">
										<select
											disabled={disabled}
											value={overrides[destinacao]?.[row.chave] ?? ""}
											onChange={(event) => setOverride(destinacao, row.chave, event.target.value as "" | TPurchaseCostTreatmentEnum)}
											className="h-8 w-full rounded-md border border-border bg-background px-1.5 text-xs"
										>
											{TREATMENT_OPTIONS.map((option) => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="text-xs text-muted-foreground">
				Exceções valem sobre o preset. Fornecedor do Simples Nacional nunca transfere crédito de ICMS, PIS ou COFINS próprios, só o crédito presumido.
			</p>
		</div>
	);
}
