"use client";

import ErrorComponent from "@/components/Layouts/ErrorComponent";
import LoadingComponent from "@/components/Layouts/LoadingComponent";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/errors";
import { syncFiscalCompany, updateFiscalSettings } from "@/lib/mutations/fiscal";
import { useFiscalSettings } from "@/lib/queries/fiscal";
import { useInternalFiscalSettingsState } from "@/state-hooks/use-internal-fiscal-settings-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, RefreshCcw, Save } from "lucide-react";
import { useQueryState } from "nuqs";
import { useEffect } from "react";
import { toast } from "sonner";
import { AutoEmissionDelaySettings } from "./components/auto-emission-delay-settings";
import { AutoEmissionPaymentMethodExceptions } from "./components/auto-emission-payment-method-exceptions";
import { CompanyBasicInformation } from "./components/company-basic-information";
import { CompanyFiscalOperationProfiles } from "./components/company-fiscal-operation-profiles";
import { CompanyFiscalSeries } from "./components/company-fiscal-series";
import { CompanyFiscalTaxGroups } from "./components/company-fiscal-tax-groups";
import { ExceptionalPresenceClassificationSettings } from "./components/exceptional-presence-classification-settings";
import { FiscalEnvironmentSwitcher } from "./components/fiscal-environment-switcher";
import { InboundDfeSettings } from "./components/inbound-dfe-settings";

type FiscalConfigurationViewProps = {
	canEdit: boolean;
};

/**
 * Aba Configuracao: ambiente, emissao automatica, DF-e, empresa fiscal (com certificado),
 * series, perfis de operacao e grupos tributarios. `?section=` (vindo de uma CTA de problema)
 * rola ate o bloco certo depois que os dados chegam.
 */
export function FiscalConfigurationView({ canEdit }: FiscalConfigurationViewProps) {
	const queryClient = useQueryClient();
	const { data, isLoading, isError, error, queryKey } = useFiscalSettings();
	const [section] = useQueryState("section");
	useEffect(() => {
		if (!section || !data) return;
		const timeout = window.setTimeout(() => {
			window.document.getElementById(`fiscal-section-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
		}, 150);
		return () => window.clearTimeout(timeout);
	}, [section, data]);
	const { state, redefineState, updateSettings, updateFiscalConfig } = useInternalFiscalSettingsState({
		initialState: {
			fiscalProvedor: data?.fiscalProvedor ?? "SPEDY",
			fiscalEmissaoAutomatica: data?.fiscalEmissaoAutomatica ?? false,
			fiscalConfiguracao: data?.fiscalConfiguracao ?? undefined,
		},
	});

	const handleOnMutate = async () => await queryClient.cancelQueries({ queryKey: queryKey });
	const handleOnSettled = async () => await queryClient.invalidateQueries({ queryKey: queryKey });
	useEffect(() => {
		if (data) {
			redefineState({
				fiscalProvedor: data.fiscalProvedor ?? "SPEDY",
				fiscalEmissaoAutomatica: data.fiscalEmissaoAutomatica ?? false,
				fiscalConfiguracao: data.fiscalConfiguracao ?? state.fiscalConfiguracao,
			});
		}
	}, [data, redefineState]);

	const saveMutation = useMutation({
		mutationFn: () =>
			updateFiscalSettings({
				fiscalProvedor: state.fiscalProvedor,
				fiscalEmissaoAutomatica: state.fiscalEmissaoAutomatica,
				fiscalConfiguracao: state.fiscalConfiguracao,
			}),
		onMutate: () => {
			handleOnMutate();
		},
		onSuccess: (response) => {
			toast.success(response.message);
			handleOnSettled();
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	const syncMutation = useMutation({
		mutationFn: syncFiscalCompany,
		onSuccess: (response) => {
			toast.success(response.message);
		},
		onError: (mutationError) => toast.error(getErrorMessage(mutationError)),
	});

	if (isLoading) return <LoadingComponent />;
	if (isError) return <ErrorComponent msg={getErrorMessage(error)} />;

	return (
		<div className="flex w-full flex-col gap-6">
			<div className="w-full flex items-center gap-2 justify-end">
				<Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending || !canEdit}>
					<RefreshCcw className="mr-2 h-4 w-4" />
					SINCRONIZAR EMPRESA
				</Button>
				<Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !canEdit}>
					<Save className="mr-2 h-4 w-4" />
					SALVAR
				</Button>
			</div>

			<Section.Root>
				<Section.Header>
					<Section.Icon>
						<BadgeCheck className="h-4 w-4" />
					</Section.Icon>
					<Section.Title>OPERACIONAL</Section.Title>
				</Section.Header>
				<Section.Body>
					<FiscalEnvironmentSwitcher fiscalConfig={state.fiscalConfiguracao} updateFiscalConfig={updateFiscalConfig} disabled={!canEdit} />
					<div className="flex items-center justify-between rounded-lg border p-4">
						<div>
							<Label>EMISSÃO AUTOMÁTICA</Label>
							<p className="text-sm text-muted-foreground">Dispara emissão ao confirmar a venda.</p>
						</div>
						<Switch
							checked={state.fiscalEmissaoAutomatica}
							disabled={!canEdit}
							onCheckedChange={(checked) => updateSettings({ fiscalEmissaoAutomatica: checked })}
						/>
					</div>
					{state.fiscalEmissaoAutomatica ? (
						<>
							<AutoEmissionDelaySettings fiscalConfig={state.fiscalConfiguracao} updateFiscalConfig={updateFiscalConfig} disabled={!canEdit} />
							<AutoEmissionPaymentMethodExceptions fiscalConfig={state.fiscalConfiguracao} updateFiscalConfig={updateFiscalConfig} />
						</>
					) : null}
					<InboundDfeSettings fiscalConfig={state.fiscalConfiguracao} updateFiscalConfig={updateFiscalConfig} />
					<ExceptionalPresenceClassificationSettings fiscalConfig={state.fiscalConfiguracao} updateFiscalConfig={updateFiscalConfig} disabled={!canEdit} />
				</Section.Body>
			</Section.Root>

			<CompanyBasicInformation
				fiscalConfig={state.fiscalConfiguracao}
				updateFiscalConfig={updateFiscalConfig}
				callbacks={{ onMutate: handleOnMutate, onSettled: handleOnSettled }}
			/>
			<CompanyFiscalSeries />
			<CompanyFiscalOperationProfiles />
			<CompanyFiscalTaxGroups />
		</div>
	);
}
