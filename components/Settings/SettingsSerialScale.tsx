"use client";

import SelectInput from "@/components/Inputs/SelectInput";
import { Button } from "@/components/ui/button";
import { useSerialScale, useSerialScaleLiveReading } from "@/lib/hooks/use-serial-scale";
import type { TSerialScalePairingOutcome } from "@/lib/pos/serial-scale-connection";
import {
	DEFAULT_SERIAL_SCALE_SETTINGS,
	describeSerialScaleSettings,
	formatScaleWeight,
	SERIAL_SCALE_BAUD_RATES,
	type TScaleFrame,
	type TSerialScaleCommand,
	type TSerialScaleParity,
} from "@/lib/pos/serial-scale-protocol";
import { ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const BAUD_OPTIONS = SERIAL_SCALE_BAUD_RATES.map((rate) => ({ id: rate, value: String(rate), label: `${rate} bps` }));
const DATA_BITS_OPTIONS = [7, 8].map((bits) => ({ id: bits, value: String(bits), label: `${bits} bits` }));
const PARITY_OPTIONS: { id: TSerialScaleParity; value: TSerialScaleParity; label: string }[] = [
	{ id: "NENHUMA", value: "NENHUMA", label: "Nenhuma" },
	{ id: "PAR", value: "PAR", label: "Par" },
	{ id: "IMPAR", value: "IMPAR", label: "Ímpar" },
];
const STOP_BITS_OPTIONS = [1, 2].map((bits) => ({ id: bits, value: String(bits), label: `${bits} ${bits === 1 ? "bit" : "bits"}` }));
const COMMAND_OPTIONS: { id: TSerialScaleCommand; value: TSerialScaleCommand; label: string }[] = [
	{ id: "ENQ", value: "ENQ", label: "ENQ (Toledo, Filizola, Urano, Elgin…)" },
	{ id: "W", value: "W", label: "W (Magellan)" },
	{ id: "P", value: "P", label: "P (Magna)" },
	{ id: "CONTINUO", value: "CONTINUO", label: "Nenhum (transmissão contínua)" },
];
const WEIGHT_DECIMAL_OPTIONS = [2, 3].map((places) => ({ id: places, value: String(places), label: `${places} casas` }));

function describeTestFrame(frame: TScaleFrame | null) {
	if (!frame) return "Aguardando a balança…";
	switch (frame.kind) {
		case "STABLE":
			return formatScaleWeight(frame.weightKg);
		case "UNSTABLE":
			return "Peso instável";
		case "NEGATIVE":
			return "Peso negativo — zere a balança";
		case "OVERLOAD":
			return "Sobrecarga";
	}
}

/**
 * A balança é deste computador, não da organização: o pareamento escolhe a porta, descobre sozinho
 * como a balança fala (velocidade, enquadramento e comando) e guarda neste navegador. Não muda nada
 * da organização, então não depende da permissão de editar a empresa — quem opera o caixa pareia.
 */
export default function SettingsSerialScale() {
	const scale = useSerialScale({ enabled: true });
	const live = useSerialScaleLiveReading();
	const [isBusy, setIsBusy] = useState(false);
	const [showManual, setShowManual] = useState(false);

	if (!scale.isSupported) {
		return (
			<p className="text-muted-foreground py-3 text-xs">
				Este navegador não acessa a porta serial. Abra esta tela no Google Chrome ou no Microsoft Edge do computador ligado à balança para pareá-la.
			</p>
		);
	}

	async function run(task: () => Promise<unknown>) {
		setIsBusy(true);
		try {
			await task();
		} finally {
			setIsBusy(false);
		}
	}

	function reportPairing(outcome: TSerialScalePairingOutcome) {
		if (outcome.kind === "FOUND") toast.success(`Balança encontrada: ${describeSerialScaleSettings(outcome.settings)}.`);
		else if (outcome.kind === "FAILED") toast.error(outcome.error);
		else if (outcome.kind === "NOT_FOUND") {
			toast.error("A balança não respondeu em nenhum protocolo conhecido. Confira o cabo e se ela está ligada, ou ajuste manualmente.");
			setShowManual(true);
		}
	}

	const pair = () => run(async () => reportPairing(await scale.pair()));
	const redetect = () => run(async () => reportPairing(await scale.redetect()));

	const settings = scale.settings ?? DEFAULT_SERIAL_SCALE_SETTINGS;
	const isConnected = scale.status === "CONNECTED";
	const hasAnswered = isConnected && live.receivedAt !== null;

	return (
		<div className="flex flex-col gap-3 py-3">
			<p className="text-muted-foreground text-xs">
				Ligue a balança ao computador do caixa pela porta serial (ou por um adaptador USB-serial) e pareie aqui, neste computador. O PDV lê o peso direto
				do navegador e reconhece o protocolo das balanças de varejo mais comuns (Toledo, Filizola, Urano, Elgin, Magna, Magellan e as compatíveis). Na
				Toledo Prix, use o cabo serial da Toledo. No cadastro, o produto vendido por peso usa a unidade <strong>KG</strong>. Computadores sem balança
				pareada não mostram nada dela no PDV.
			</p>

			<div className="bg-muted/40 flex flex-col gap-2 rounded-lg border border-dashed p-3">
				<span className="text-xs font-medium tracking-tight">BALANÇA DESTE COMPUTADOR</span>

				{scale.detecting ? (
					<span className="text-muted-foreground flex items-center gap-2 text-sm">
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
						Procurando a balança… {scale.detecting}
					</span>
				) : scale.isPaired ? (
					<div className="flex flex-col gap-1">
						<span className="text-2xl font-extrabold tabular-nums">
							{isConnected ? describeTestFrame(live.frame) : scale.status === "CONNECTING" ? "Conectando…" : "Desconectada"}
						</span>
						<span className="text-muted-foreground text-xs">
							{describeSerialScaleSettings(settings)}
							{isConnected && !hasAnswered ? " — a porta abriu, mas a balança ainda não respondeu." : null}
							{hasAnswered ? " — coloque um peso conhecido no prato e confira." : null}
						</span>
					</div>
				) : (
					<span className="text-muted-foreground text-sm">Nenhuma balança pareada neste computador.</span>
				)}

				{scale.error && !scale.detecting ? <span className="text-destructive text-xs">{scale.error}</span> : null}

				<div className="flex flex-wrap gap-2">
					{scale.isPaired ? (
						<>
							{isConnected ? (
								<Button type="button" variant="outline" size="sm" onClick={() => void redetect()} disabled={isBusy}>
									DETECTAR DE NOVO
								</Button>
							) : (
								<Button type="button" variant="outline" size="sm" onClick={() => void run(scale.reconnect)} disabled={isBusy}>
									RECONECTAR
								</Button>
							)}
							<Button type="button" variant="outline" size="sm" onClick={() => void pair()} disabled={isBusy}>
								TROCAR PORTA
							</Button>
							<Button type="button" variant="ghost" size="sm" onClick={() => void run(scale.forget)} disabled={isBusy}>
								ESQUECER BALANÇA
							</Button>
						</>
					) : (
						<Button type="button" variant="outline" size="sm" onClick={() => void pair()} disabled={isBusy}>
							{isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
							CONECTAR BALANÇA
						</Button>
					)}
				</div>
			</div>

			{scale.isPaired || showManual ? (
				<div className="flex flex-col gap-2">
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs font-medium"
						onClick={() => setShowManual((current) => !current)}
						aria-expanded={showManual}
					>
						AJUSTE MANUAL
						<ChevronDown className={showManual ? "h-3.5 w-3.5 rotate-180 transition-transform" : "h-3.5 w-3.5 transition-transform"} />
					</button>
					{showManual ? (
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							<SelectInput
								label="CASAS DECIMAIS DO PESO"
								value={String(settings.casasDecimais)}
								options={WEIGHT_DECIMAL_OPTIONS}
								resetOptionLabel="3 casas"
								editable={!isBusy}
								handleChange={(value) => void scale.updateSettings({ casasDecimais: value === "2" ? 2 : 3 })}
								onReset={() => void scale.updateSettings({ casasDecimais: 3 })}
							/>
							<SelectInput
								label="COMANDO DE PESO"
								value={settings.comando}
								options={COMMAND_OPTIONS}
								resetOptionLabel="ENQ"
								editable={!isBusy}
								handleChange={(value) => {
									const comando = COMMAND_OPTIONS.find((option) => option.value === value)?.value ?? "ENQ";
									void scale.updateSettings({ comando });
								}}
								onReset={() => void scale.updateSettings({ comando: "ENQ" })}
							/>
							<SelectInput
								label="VELOCIDADE"
								value={String(settings.velocidade)}
								options={BAUD_OPTIONS}
								resetOptionLabel={`${DEFAULT_SERIAL_SCALE_SETTINGS.velocidade} bps`}
								editable={!isBusy}
								handleChange={(value) => void scale.updateSettings({ velocidade: Number(value) })}
								onReset={() => void scale.updateSettings({ velocidade: DEFAULT_SERIAL_SCALE_SETTINGS.velocidade })}
							/>
							<SelectInput
								label="BITS DE DADOS"
								value={String(settings.bitsDados)}
								options={DATA_BITS_OPTIONS}
								resetOptionLabel="8 bits"
								editable={!isBusy}
								handleChange={(value) => void scale.updateSettings({ bitsDados: value === "7" ? 7 : 8 })}
								onReset={() => void scale.updateSettings({ bitsDados: 8 })}
							/>
							<SelectInput
								label="PARIDADE"
								value={settings.paridade}
								options={PARITY_OPTIONS}
								resetOptionLabel="Nenhuma"
								editable={!isBusy}
								handleChange={(value) => void scale.updateSettings({ paridade: value === "PAR" || value === "IMPAR" ? value : "NENHUMA" })}
								onReset={() => void scale.updateSettings({ paridade: "NENHUMA" })}
							/>
							<SelectInput
								label="BITS DE PARADA"
								value={String(settings.bitsParada)}
								options={STOP_BITS_OPTIONS}
								resetOptionLabel="1 bit"
								editable={!isBusy}
								handleChange={(value) => void scale.updateSettings({ bitsParada: value === "2" ? 2 : 1 })}
								onReset={() => void scale.updateSettings({ bitsParada: 1 })}
							/>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
