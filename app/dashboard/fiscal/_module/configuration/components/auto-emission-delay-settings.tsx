"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTO_EMISSION_UI_MAX_DELAY_MINUTES } from "@/lib/fiscal/constants";
import { cn } from "@/lib/utils";
import type { TUseInternalFiscalSettingsState } from "@/state-hooks/use-internal-fiscal-settings-state";
import { Clock } from "lucide-react";

const AUTO_EMISSION_DELAY_PRESETS: Array<{ minutos: number; label: string }> = [
	{ minutos: 0, label: "Imediato" },
	{ minutos: 15, label: "15 min" },
	{ minutos: 30, label: "30 min" },
	{ minutos: 60, label: "1 h" },
	{ minutos: 120, label: "2 h" },
	{ minutos: 24 * 60, label: "24 h" },
];

function formatDelay(minutos: number) {
	if (minutos <= 0) return "imediatamente";
	if (minutos < 60) return `${minutos} min depois`;
	const horas = Math.floor(minutos / 60);
	const resto = minutos % 60;
	return resto === 0 ? `${horas} h depois` : `${horas} h ${resto} min depois`;
}

type AutoEmissionDelaySettingsProps = {
	fiscalConfig: TUseInternalFiscalSettingsState["state"]["fiscalConfiguracao"];
	updateFiscalConfig: TUseInternalFiscalSettingsState["updateFiscalConfig"];
	disabled: boolean;
};

export function AutoEmissionDelaySettings({ fiscalConfig, updateFiscalConfig, disabled }: AutoEmissionDelaySettingsProps) {
	const atrasoMinutos = fiscalConfig.emissaoAutomatica.atrasoMinutos;

	const setDelay = (minutos: number) => {
		const next = Math.min(Math.max(Math.floor(Number.isFinite(minutos) ? minutos : 0), 0), AUTO_EMISSION_UI_MAX_DELAY_MINUTES);
		// Espalha o objeto atual: `normalizeFiscalConfig` substitui `emissaoAutomatica` inteiro pelo patch.
		updateFiscalConfig({ emissaoAutomatica: { ...fiscalConfig.emissaoAutomatica, atrasoMinutos: next } });
	};

	return (
		<div className="space-y-3 rounded-lg border p-4">
			<div>
				<div className="flex items-center gap-2">
					<Clock className="h-4 w-4 text-muted-foreground" />
					<Label>ATRASO DA EMISSÃO AUTOMÁTICA</Label>
				</div>
				<p className="text-sm text-muted-foreground">
					Tempo de espera entre a venda ficar pronta para emitir (confirmada, entregue e paga) e a nota sair. Na janela, a venda pode ser corrigida ou
					cancelada e a nota reflete o estado final. A emissão manual continua imediata.
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				{AUTO_EMISSION_DELAY_PRESETS.map((preset) => (
					<Button
						key={preset.minutos}
						type="button"
						size="sm"
						variant={atrasoMinutos === preset.minutos ? "default" : "outline"}
						disabled={disabled}
						onClick={() => setDelay(preset.minutos)}
					>
						{preset.label}
					</Button>
				))}
			</div>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
				<div className="flex items-center gap-2">
					<Input
						type="number"
						inputMode="numeric"
						min={0}
						max={AUTO_EMISSION_UI_MAX_DELAY_MINUTES}
						step={1}
						value={atrasoMinutos}
						disabled={disabled}
						onChange={(event) => setDelay(Number(event.target.value))}
						className="w-28"
						aria-label="Atraso da emissão automática em minutos"
					/>
					<span className="text-sm text-muted-foreground">minutos (até {AUTO_EMISSION_UI_MAX_DELAY_MINUTES / 60} h)</span>
				</div>
				<p className={cn("text-sm font-medium", atrasoMinutos > 0 ? "text-foreground" : "text-muted-foreground")}>
					{atrasoMinutos > 0 ? `A nota sai ${formatDelay(atrasoMinutos)} da venda ficar pronta.` : "A nota sai imediatamente."}
				</p>
			</div>
		</div>
	);
}
