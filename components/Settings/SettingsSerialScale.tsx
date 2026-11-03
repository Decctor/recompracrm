"use client";

import SelectInput from "@/components/Inputs/SelectInput";
import { Button } from "@/components/ui/button";
import { useSerialScale, useSerialScaleLiveReading } from "@/lib/hooks/use-serial-scale";
import { DEFAULT_SERIAL_SCALE_CONFIG, formatScaleWeight, SERIAL_SCALE_BAUD_RATES, type TScaleFrame } from "@/lib/pos/serial-scale-protocol";
import type { TScaleSerialParityEnum } from "@/schemas/enums";
import type { TOrganizationSerialScaleConfig } from "@/schemas/organizations";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const BAUD_OPTIONS = SERIAL_SCALE_BAUD_RATES.map((rate) => ({ id: rate, value: String(rate), label: `${rate} bps` }));
const DATA_BITS_OPTIONS = [7, 8].map((bits) => ({ id: bits, value: String(bits), label: `${bits} bits` }));
const PARITY_OPTIONS: { id: TScaleSerialParityEnum; value: TScaleSerialParityEnum; label: string }[] = [
	{ id: "NENHUMA", value: "NENHUMA", label: "Nenhuma" },
	{ id: "PAR", value: "PAR", label: "Par" },
	{ id: "IMPAR", value: "IMPAR", label: "Ímpar" },
];
const STOP_BITS_OPTIONS = [1, 2].map((bits) => ({ id: bits, value: String(bits), label: `${bits} ${bits === 1 ? "bit" : "bits"}` }));
const WEIGHT_DECIMAL_OPTIONS = [2, 3].map((places) => ({ id: places, value: String(places), label: `${places} casas` }));

type SettingsSerialScaleProps = {
	balancaCaixa: TOrganizationSerialScaleConfig;
	updateBalancaCaixa: (partial: Partial<TOrganizationSerialScaleConfig>) => void;
	editable: boolean;
};

/**
 * Parâmetros da porta serial da balança do caixa, com teste ao vivo contra a balança real — o mesmo
 * papel do teste de máscara das etiquetas: é a leitura que diz se a configuração está certa.
 */
export default function SettingsSerialScale({ balancaCaixa, updateBalancaCaixa, editable }: SettingsSerialScaleProps) {
	return (
		<div className="flex flex-col gap-3 py-3">
			<p className="text-muted-foreground text-xs">
				A balança fica ligada ao computador do caixa pela porta serial (ou por um adaptador USB-serial) e o PDV lê o peso direto do navegador — use o
				Google Chrome ou o Microsoft Edge. Na <strong>Toledo Prix 3 Fit</strong>, use o cabo serial da Toledo (ele tem um conversor interno) e 4800 bps, 8
				bits, sem paridade, 1 bit de parada. No cadastro, o produto vendido por peso usa a unidade <strong>KG</strong>.
			</p>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<SelectInput
					label="VELOCIDADE"
					value={String(balancaCaixa.velocidade)}
					options={BAUD_OPTIONS}
					resetOptionLabel={`${DEFAULT_SERIAL_SCALE_CONFIG.velocidade} bps`}
					editable={editable}
					handleChange={(value) => updateBalancaCaixa({ velocidade: Number(value) })}
					onReset={() => updateBalancaCaixa({ velocidade: DEFAULT_SERIAL_SCALE_CONFIG.velocidade })}
				/>
				<SelectInput
					label="BITS DE DADOS"
					value={String(balancaCaixa.bitsDados)}
					options={DATA_BITS_OPTIONS}
					resetOptionLabel="8 bits"
					editable={editable}
					handleChange={(value) => updateBalancaCaixa({ bitsDados: value === "7" ? 7 : 8 })}
					onReset={() => updateBalancaCaixa({ bitsDados: 8 })}
				/>
				<SelectInput
					label="PARIDADE"
					value={balancaCaixa.paridade}
					options={PARITY_OPTIONS}
					resetOptionLabel="Nenhuma"
					editable={editable}
					handleChange={(value) => updateBalancaCaixa({ paridade: value === "PAR" || value === "IMPAR" ? value : "NENHUMA" })}
					onReset={() => updateBalancaCaixa({ paridade: "NENHUMA" })}
				/>
				<SelectInput
					label="BITS DE PARADA"
					value={String(balancaCaixa.bitsParada)}
					options={STOP_BITS_OPTIONS}
					resetOptionLabel="1 bit"
					editable={editable}
					handleChange={(value) => updateBalancaCaixa({ bitsParada: value === "2" ? 2 : 1 })}
					onReset={() => updateBalancaCaixa({ bitsParada: 1 })}
				/>
				<SelectInput
					label="CASAS DECIMAIS DO PESO"
					value={String(balancaCaixa.casasDecimais)}
					options={WEIGHT_DECIMAL_OPTIONS}
					resetOptionLabel="3 casas"
					editable={editable}
					handleChange={(value) => updateBalancaCaixa({ casasDecimais: value === "2" ? 2 : 3 })}
					onReset={() => updateBalancaCaixa({ casasDecimais: 3 })}
				/>
			</div>

			<SerialScaleTest balancaCaixa={balancaCaixa} updateBalancaCaixa={updateBalancaCaixa} editable={editable} />
		</div>
	);
}

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

/** O teste só abre a porta depois do clique: entrar na tela de configuração não toma a balança do PDV. */
function SerialScaleTest({ balancaCaixa, updateBalancaCaixa, editable }: SettingsSerialScaleProps) {
	const [isTesting, setIsTesting] = useState(false);
	const [isDetecting, setIsDetecting] = useState(false);
	const scale = useSerialScale({ config: { ...balancaCaixa, habilitado: true }, enabled: isTesting });
	const live = useSerialScaleLiveReading();

	if (!scale.isSupported) {
		return (
			<div className="bg-muted/40 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
				Este navegador não acessa a porta serial. Abra esta tela no Google Chrome ou no Microsoft Edge do computador ligado à balança para testar.
			</div>
		);
	}

	async function startTest() {
		setIsTesting(true);
		const connected = await scale.connect("INTERACTIVE");
		if (!connected) setIsTesting(false);
	}

	async function stopTest() {
		setIsTesting(false);
		await scale.disconnect();
	}

	async function detectBaudRate() {
		setIsDetecting(true);
		try {
			const found = await scale.detectBaudRate(SERIAL_SCALE_BAUD_RATES);
			if (found) {
				if (editable) updateBalancaCaixa({ velocidade: found });
				toast.success(`A balança respondeu a ${found} bps.${editable ? " Salve para usar no PDV." : ""}`);
			} else {
				toast.error("A balança não respondeu em nenhuma velocidade. Confira o cabo, se a balança está ligada e os bits de dados e a paridade.");
			}
		} finally {
			setIsDetecting(false);
		}
	}

	const isConnected = scale.status === "CONNECTED";
	const hasAnswered = isConnected && live.receivedAt !== null;

	return (
		<div className="bg-muted/40 flex flex-col gap-2 rounded-lg border border-dashed p-3">
			<span className="text-xs font-medium tracking-tight">TESTAR COM A BALANÇA</span>
			{isTesting && isConnected ? (
				<div className="flex flex-col gap-1">
					<span className="text-2xl font-extrabold tabular-nums">{describeTestFrame(live.frame)}</span>
					<span className="text-muted-foreground text-xs">
						{hasAnswered
							? `Recebendo leituras a ${scale.velocidade ?? balancaCaixa.velocidade} bps. Coloque um peso conhecido no prato e confira.`
							: "A porta abriu, mas a balança ainda não respondeu. Se continuar assim, detecte a velocidade."}
					</span>
				</div>
			) : null}
			{scale.error ? <span className="text-destructive text-xs">{scale.error}</span> : null}
			<div className="flex flex-wrap gap-2">
				{isTesting ? (
					<>
						<Button type="button" variant="outline" size="sm" onClick={() => void detectBaudRate()} disabled={!isConnected || isDetecting}>
							{isDetecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
							DETECTAR VELOCIDADE
						</Button>
						<Button type="button" variant="outline" size="sm" onClick={() => void scale.connect("CHOOSE")} disabled={isDetecting}>
							TROCAR PORTA
						</Button>
						<Button type="button" variant="ghost" size="sm" onClick={() => void stopTest()} disabled={isDetecting}>
							ENCERRAR TESTE
						</Button>
					</>
				) : (
					<Button type="button" variant="outline" size="sm" onClick={() => void startTest()}>
						CONECTAR E TESTAR
					</Button>
				)}
			</div>
		</div>
	);
}
