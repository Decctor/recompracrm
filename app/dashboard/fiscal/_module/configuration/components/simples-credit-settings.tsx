"use client";
import NewFiscalCreditRate from "@/components/Modals/FiscalTaxGroup/NewFiscalCreditRate";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Section } from "@/components/ui/section";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";
import { getFiscalCreditCompetence } from "@/lib/fiscal/simples-credit";
import { useFiscalCreditRates } from "@/lib/queries/fiscal-credit-rates";
import { useFiscalTaxGroups } from "@/lib/queries/fiscal";
import { useState } from "react";
import type { TUseInternalFiscalSettingsState } from "@/state-hooks/use-internal-fiscal-settings-state";

export function SimplesCreditSettings({
	fiscalConfig,
	updateFiscalConfig,
	disabled,
}: {
	fiscalConfig: TUseInternalFiscalSettingsState["state"]["fiscalConfiguracao"];
	updateFiscalConfig: TUseInternalFiscalSettingsState["updateFiscalConfig"];
	disabled: boolean;
}) {
	return (
		<Field orientation="horizontal">
			<div className="flex flex-1 flex-col gap-1">
				<FieldLabel htmlFor="enable-resale-credit">Operações de revenda e crédito de ICMS do Simples</FieldLabel>
				<FieldDescription>
					Exibe destinação da compra e tratamento do crédito no fechamento e na emissão manual. Ative para empresas que precisam revisar essas informações
					por operação. Antes de ativar, revise os perfis de operação, os tratamentos dos grupos e os percentuais da competência.
				</FieldDescription>
			</div>
			<Switch
				id="enable-resale-credit"
				checked={fiscalConfig.operacoesRevenda?.habilitada ?? false}
				disabled={disabled}
				onCheckedChange={(habilitada) => updateFiscalConfig({ operacoesRevenda: { habilitada } })}
			/>
		</Field>
	);
}

export function SimplesCreditRates({ enabled, canEdit }: { enabled: boolean; canEdit: boolean }) {
	const rates = useFiscalCreditRates(enabled);
	const groups = useFiscalTaxGroups();
	const [open, setOpen] = useState(false);
	if (!enabled) return null;
	const competence = getFiscalCreditCompetence();
	return (
		<Section.Root>
			<Section.Header>
				<Section.Title>Crédito de ICMS por competência</Section.Title>
				<Section.Actions>
					<Button variant="outline" onClick={() => setOpen(true)} disabled={!canEdit}>
						Cadastrar percentual
					</Button>
				</Section.Actions>
			</Section.Header>
			<Section.Body>
				<span id="fiscal-section-credit-rates" />
				<p className="text-sm text-muted-foreground">
					Competência atual: {competence}. O percentual deve ser informado pela contabilidade. Revisões anteriores ficam no histórico; não há
					reaproveitamento automático entre meses.
				</p>
				{rates.isLoading ? <p role="status">Carregando percentuais…</p> : null}
				{rates.isError ? (
					<p role="alert" className="text-sm text-destructive">
						{getErrorMessage(rates.error)}
					</p>
				) : null}
				{rates.data?.length === 0 ? <p className="text-sm">Nenhum percentual cadastrado. Cadastre a competência antes de emitir com crédito.</p> : null}
				{rates.data?.length ? (
					<details>
						<summary className="cursor-pointer text-sm font-medium">Consultar percentuais e histórico</summary>
						<ul className="mt-3 flex max-h-80 flex-col gap-3 overflow-auto">
							{rates.data.map((rate, index, rows) => {
								const current = !rows
									.slice(0, index)
									.some((other) => other.competencia === rate.competencia && other.grupoTributarioId === rate.grupoTributarioId);
								return (
									<li key={rate.id} className="flex flex-col gap-1 text-sm">
										<span>
											{groups.data?.find((group) => group.id === rate.grupoTributarioId)?.nome ?? "Grupo tributário"} · {rate.competencia} ·{" "}
											{rate.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%{current ? "" : " · Revisão anterior"}
										</span>
										<span className="text-xs text-muted-foreground">
											{new Date(rate.dataInsercao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · Responsável: {rate.autorNome ?? "Não informado"}
										</span>
										{rate.observacao ? <p className="text-xs text-muted-foreground">{rate.observacao}</p> : null}
									</li>
								);
							})}
						</ul>
					</details>
				) : null}
				{open ? <NewFiscalCreditRate closeModal={() => setOpen(false)} /> : null}
			</Section.Body>
		</Section.Root>
	);
}
