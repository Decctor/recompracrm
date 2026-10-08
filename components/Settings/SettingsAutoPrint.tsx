"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getErrorMessage } from "@/lib/errors";
import { organizationHasPrinterForFinalidade, useAgentPrinters } from "@/lib/queries/desktop-agent";
import type { TOrganizationAutoPrintRule, TOrganizationPrintPreferences } from "@/schemas/organizations";
import { AlertTriangle, Minus, Plus, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { useOrganizationSectionForm } from "./Organization/use-organization-section-form";
import SettingsPanelSection from "./SettingsPanelSection";
import SettingsSectionActions from "./SettingsSectionActions";

// Impressão automática (docs/dev-planning/auto-print-wiring-plan.md): política por finalidade em
// configuracao.preferencias.impressoes. A allowlist de canais usa chaves de política — canal
// interno cru ou INTEGRACAO-<canal> para vendas externas.

type TAutoPrintFinalidade = keyof TOrganizationPrintPreferences["automatica"];

const EMPTY_RULE: TOrganizationAutoPrintRule = { habilitada: false, canais: [], copias: 1 };

const CHANNEL_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "POS", label: "PDV" },
	{ value: "SHOP", label: "Loja digital" },
	{ value: "COMANDA", label: "Comandas" },
	{ value: "INTEGRACAO-IFOOD", label: "iFood" },
];

const FINALIDADE_METADATA: Array<{ key: TAutoPrintFinalidade; label: string; description: string }> = [
	{
		key: "CUPOM_VENDA",
		label: "CUPOM DE VENDA",
		description: "Imprime o cupom não fiscal automaticamente quando a venda é confirmada — no iFood, quando o pedido é aceito.",
	},
	{
		key: "TICKET_PREPARO",
		label: "TICKET DE PREPARO",
		description:
			"Imprime a via da cozinha (itens, adicionais e observações, sem preços) quando o pedido entra em preparo — cada pedido lançado numa conta, cada venda que precisa ser preparada.",
	},
	{
		key: "DANFE_NFCE",
		label: "DANFE — NFC-E",
		description: "Imprime a DANFE automaticamente quando a NFC-e é autorizada pela SEFAZ.",
	},
	{
		key: "DANFE_NFE",
		label: "DANFE — NF-E",
		description: "Imprime a DANFE automaticamente quando a NF-e é autorizada pela SEFAZ.",
	},
];

function toAutoPrintDraft(impressoes: TOrganizationPrintPreferences | undefined): TOrganizationPrintPreferences {
	return {
		automatica: {
			CUPOM_VENDA: { ...EMPTY_RULE, ...impressoes?.automatica?.CUPOM_VENDA },
			TICKET_PREPARO: { ...EMPTY_RULE, ...impressoes?.automatica?.TICKET_PREPARO },
			DANFE_NFCE: { ...EMPTY_RULE, ...impressoes?.automatica?.DANFE_NFCE },
			DANFE_NFE: { ...EMPTY_RULE, ...impressoes?.automatica?.DANFE_NFE },
		},
	};
}

type SettingsAutoPrintProps = {
	membership: NonNullable<TAuthUserSession["membership"]>;
};

export default function SettingsAutoPrint({ membership }: SettingsAutoPrintProps) {
	const { organization, isLoading, isError, isSuccess, error, save, isSaving } = useOrganizationSectionForm();
	const { data: printers } = useAgentPrinters();
	const [draft, setDraft] = useState<TOrganizationPrintPreferences | null>(null);

	useEffect(() => {
		if (organization) setDraft(toAutoPrintDraft(organization.configuracao.preferencias.impressoes));
	}, [organization]);

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;
	if (!isSuccess || !organization || !draft) return null;

	const canEdit = membership.permissoes.empresa.editar;

	function updateRule(finalidade: TAutoPrintFinalidade, partial: Partial<TOrganizationAutoPrintRule>) {
		setDraft((current) =>
			current ? { automatica: { ...current.automatica, [finalidade]: { ...current.automatica[finalidade], ...partial } } } : current,
		);
	}

	function toggleChannel(finalidade: TAutoPrintFinalidade, channel: string, checked: boolean) {
		if (!draft) return;
		const current = draft.automatica[finalidade].canais;
		updateRule(finalidade, { canais: checked ? [...current, channel] : current.filter((value) => value !== channel) });
	}

	return (
		<SettingsPanelSection
			title="IMPRESSÃO AUTOMÁTICA"
			icon={<Printer className="h-4 w-4 min-h-4 min-w-4" />}
			description="O que sai da impressora sozinho, sem ninguém clicar em imprimir."
		>
			{FINALIDADE_METADATA.map((finalidade) => {
				const rule = draft.automatica[finalidade.key];
				const missingPrinter = rule.habilitada && !organizationHasPrinterForFinalidade(printers, finalidade.key);
				// Canais fora das opções conhecidas (ex.: integração futura salva via API) continuam
				// visíveis — nada configurado fica invisível na UI.
				const extraChannels = rule.canais.filter((channel) => !CHANNEL_OPTIONS.some((option) => option.value === channel));
				return (
					<div key={finalidade.key} className="border-border bg-card rounded-xl border shadow-xs">
						<div className="flex items-center justify-between gap-4 px-4 py-3">
							<div className="flex flex-col gap-0.5">
								<span className="text-sm font-medium tracking-tight">{finalidade.label}</span>
								<span className="text-muted-foreground text-xs">{finalidade.description}</span>
							</div>
							<Switch
								checked={rule.habilitada}
								onCheckedChange={(value) => canEdit && updateRule(finalidade.key, { habilitada: value })}
								disabled={!canEdit}
							/>
						</div>
						{rule.habilitada ? (
							<div className="border-border flex flex-col gap-3 border-t px-4 py-3">
								<div className="flex flex-col gap-1.5">
									<span className="text-muted-foreground text-xs font-medium">CANAIS QUE IMPRIMEM AUTOMATICAMENTE</span>
									<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
										{CHANNEL_OPTIONS.map((option) => (
											<label key={option.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
												<Checkbox
													checked={rule.canais.includes(option.value)}
													onCheckedChange={(checked) => canEdit && toggleChannel(finalidade.key, option.value, checked === true)}
													disabled={!canEdit}
												/>
												{option.label}
											</label>
										))}
										{extraChannels.map((channel) => (
											<label key={channel} className="flex cursor-pointer items-center gap-1.5 text-sm">
												<Checkbox
													checked
													onCheckedChange={(checked) => canEdit && toggleChannel(finalidade.key, channel, checked === true)}
													disabled={!canEdit}
												/>
												{channel}
											</label>
										))}
									</div>
									{rule.canais.length === 0 ? (
										<span className="text-muted-foreground text-xs">Nenhum canal selecionado — nada será impresso automaticamente.</span>
									) : null}
								</div>
								<div className="flex items-center justify-between gap-4">
									<span className="text-muted-foreground text-xs font-medium">CÓPIAS POR IMPRESSÃO</span>
									<div className="flex items-center gap-2">
										<Button
											variant="outline"
											size="icon"
											className="h-7 w-7"
											disabled={!canEdit || rule.copias <= 1}
											onClick={() => updateRule(finalidade.key, { copias: Math.max(1, rule.copias - 1) })}
										>
											<Minus className="h-3.5 w-3.5" />
										</Button>
										<span className="w-6 text-center text-sm font-medium tabular-nums">{rule.copias}</span>
										<Button
											variant="outline"
											size="icon"
											className="h-7 w-7"
											disabled={!canEdit || rule.copias >= 5}
											onClick={() => updateRule(finalidade.key, { copias: Math.min(5, rule.copias + 1) })}
										>
											<Plus className="h-3.5 w-3.5" />
										</Button>
									</div>
								</div>
								{missingPrinter ? (
									<div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-amber-700 dark:text-amber-400">
										<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
										<p className="text-xs leading-relaxed">
											Nenhuma impressora ativa atende esta finalidade — os jobs não serão criados até que uma impressora seja configurada em um dispositivo.
										</p>
									</div>
								) : null}
							</div>
						) : null}
					</div>
				);
			})}

			{canEdit ? (
				<div className="border-border border-t pt-3">
					<SettingsSectionActions
						isSaving={isSaving}
						onReset={() => setDraft(toAutoPrintDraft(organization.configuracao.preferencias.impressoes))}
						onSave={() => save({ configuracao: { preferencias: { impressoes: draft } } })}
					/>
				</div>
			) : null}
		</SettingsPanelSection>
	);
}
