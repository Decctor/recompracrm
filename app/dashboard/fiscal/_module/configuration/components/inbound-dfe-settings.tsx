"use client";

import DateInput from "@/components/Inputs/DateInput";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { TUseInternalFiscalSettingsState } from "@/state-hooks/use-internal-fiscal-settings-state";

type InboundDfeSettingsProps = {
	fiscalConfig: TUseInternalFiscalSettingsState["state"]["fiscalConfiguracao"];
	updateFiscalConfig: TUseInternalFiscalSettingsState["updateFiscalConfig"];
};

export function InboundDfeSettings({ fiscalConfig, updateFiscalConfig }: InboundDfeSettingsProps) {
	const dfe = fiscalConfig.dfe;

	const handleToggleHabilitado = (habilitado: boolean) => {
		updateFiscalConfig({
			dfe: {
				...dfe,
				habilitado,
				// Corte padrao ao habilitar: hoje (a SEFAZ retem ~90 dias de distribuicao).
				dataInicio: habilitado ? (dfe.dataInicio ?? new Date().toISOString()) : dfe.dataInicio,
			},
		});
	};

	return (
		<div className="space-y-3 rounded-lg border p-4">
			<div className="flex items-center justify-between">
				<div>
					<Label>NOTAS RECEBIDAS (DF-e)</Label>
					<p className="text-sm text-muted-foreground">Importa automaticamente as NF-e emitidas contra o CNPJ da empresa.</p>
				</div>
				<Switch checked={dfe.habilitado} onCheckedChange={handleToggleHabilitado} />
			</div>
			{dfe.habilitado ? (
				<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
					<div className="w-full lg:w-64">
						<DateInput
							label="IMPORTAR NOTAS A PARTIR DE"
							value={dfe.dataInicio ? dfe.dataInicio.slice(0, 10) : undefined}
							handleChange={(value) =>
								updateFiscalConfig({
									dfe: {
										...dfe,
										dataInicio: value ? new Date(value).toISOString() : null,
									},
								})
							}
						/>
						<p className="mt-1 text-xs text-muted-foreground">A SEFAZ disponibiliza cerca de 90 dias de histórico.</p>
					</div>
					<div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 lg:w-96">
						<div>
							<p className="text-sm font-semibold">Ciência automática</p>
							<p className="text-xs text-muted-foreground">Registra ciência ao receber novas notas, destravando o XML completo.</p>
						</div>
						<Switch checked={dfe.autoCiencia} onCheckedChange={(checked) => updateFiscalConfig({ dfe: { ...dfe, autoCiencia: checked } })} />
					</div>
				</div>
			) : null}
			{dfe.habilitado ? (
				<div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
					<div>
						<p className="text-sm font-semibold">Confirmar a operação ao receber a compra</p>
						<p className="text-xs text-muted-foreground">
							Quando uma compra lançada a partir de uma nota recebida for marcada como recebida, a nota é manifestada como confirmada na SEFAZ. A confirmação
							é definitiva.
						</p>
					</div>
					<Switch checked={dfe.confirmarAoReceber} onCheckedChange={(checked) => updateFiscalConfig({ dfe: { ...dfe, confirmarAoReceber: checked } })} />
				</div>
			) : null}
		</div>
	);
}
