"use client";

import { Button } from "@/components/ui/button";
import { useSerialScaleDiagnostics } from "@/lib/hooks/use-serial-scale";
import {
	describeSerialReadError,
	describeSerialScaleDetectionAttempt,
	formatSerialBytesHex,
	formatSerialBytesText,
	judgeSerialScaleDetection,
} from "@/lib/pos/serial-scale-diagnostics";
import { Copy } from "lucide-react";
import { toast } from "sonner";

type SerialScaleDiagnosticsProps = {
	/** A porta está aberta agora: mostra o que está chegando nela. */
	isPortOpen: boolean;
	/** Resumo dos parâmetros com que a porta está aberta, para o texto copiado. */
	portSettingsLabel: string;
};

const SILENT_ADVICE =
	"Nenhum byte chegou em nenhuma combinação: a balança não está transmitindo para esta porta. Confira o cabo (TX e RX cruzados — na Toledo Prix, só o cabo serial da Toledo), se ele está na saída serial de PC da balança (não na de impressora) e se a comunicação com o computador está ligada no menu da balança.";
const UNRECOGNIZED_ADVICE =
	"A balança transmitiu, mas em nenhum formato que o sistema reconhece. Copie o diagnóstico e envie ao suporte junto com a marca e o modelo da balança.";

/**
 * O que chega na porta da balança, cru: separa "nada chega" (cabo, porta errada da balança, saída
 * serial desligada) de "chega, mas não reconheço" (formato novo) sem precisar abrir o DevTools.
 */
export default function SerialScaleDiagnostics({ isPortOpen, portSettingsLabel }: SerialScaleDiagnosticsProps) {
	const diagnostics = useSerialScaleDiagnostics();
	const { detection } = diagnostics;
	if (!isPortOpen && !detection) return null;

	const verdict = detection && detection.length > 0 ? judgeSerialScaleDetection(detection) : null;

	async function copyReport() {
		const lines = [`Diagnóstico da balança (${new Date().toLocaleString("pt-BR")})`, `Navegador: ${navigator.userAgent}`];
		if (detection) {
			lines.push("", "Última detecção:");
			for (const attempt of detection) {
				lines.push(`- ${attempt.label}: ${describeSerialScaleDetectionAttempt(attempt)}`);
				if (attempt.sample.length > 0) lines.push(`  ${formatSerialBytesHex(attempt.sample)}`);
			}
		}
		if (isPortOpen) {
			lines.push("", `Porta aberta agora (${portSettingsLabel}): ${diagnostics.totalBytes} bytes recebidos`);
			if (diagnostics.recentBytes.length > 0)
				lines.push(`  ${formatSerialBytesHex(diagnostics.recentBytes)}`, `  ${formatSerialBytesText(diagnostics.recentBytes)}`);
			for (const error of diagnostics.errors) lines.push(`  ${describeSerialReadError(error.name)} ×${error.count}`);
		}
		try {
			await navigator.clipboard.writeText(lines.join("\n"));
			toast.success("Diagnóstico copiado.");
		} catch {
			toast.error("Não foi possível copiar o diagnóstico.");
		}
	}

	return (
		<div className="flex flex-col gap-2 rounded-lg border p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="text-xs font-medium tracking-tight">DIAGNÓSTICO DA PORTA</span>
				<Button type="button" variant="ghost" size="sm" onClick={() => void copyReport()}>
					<Copy className="h-3.5 w-3.5" />
					COPIAR DIAGNÓSTICO
				</Button>
			</div>

			{isPortOpen ? (
				<div className="flex flex-col gap-1">
					<span className="text-muted-foreground text-xs">
						Recebido desde que a porta abriu ({portSettingsLabel}):{" "}
						<strong className="text-foreground tabular-nums">
							{diagnostics.totalBytes} {diagnostics.totalBytes === 1 ? "byte" : "bytes"}
						</strong>
					</span>
					{diagnostics.recentBytes.length > 0 ? (
						<div className="bg-muted/60 flex flex-col gap-0.5 rounded-md px-2 py-1.5 font-mono text-xs break-all">
							<span>{formatSerialBytesText(diagnostics.recentBytes)}</span>
							<span className="text-muted-foreground">{formatSerialBytesHex(diagnostics.recentBytes)}</span>
						</div>
					) : null}
					{diagnostics.errors.map((error) => (
						<span key={error.name} className="text-xs text-amber-600 dark:text-amber-400">
							{describeSerialReadError(error.name)} ×{error.count}
						</span>
					))}
				</div>
			) : null}

			{detection && detection.length > 0 ? (
				<div className="flex flex-col gap-1">
					<span className="text-muted-foreground text-xs font-medium">ÚLTIMA DETECÇÃO</span>
					<ul className="flex flex-col gap-1">
						{detection.map((attempt) => {
							const isActive = attempt.bytes > 0 || attempt.errors.length > 0;
							return (
								<li key={attempt.label} className="flex flex-col text-xs">
									<span className={isActive ? "font-medium" : "text-muted-foreground"}>
										{attempt.label} — {describeSerialScaleDetectionAttempt(attempt)}
									</span>
									{attempt.sample.length > 0 ? (
										<span className="text-muted-foreground font-mono break-all">{formatSerialBytesText(attempt.sample)}</span>
									) : null}
								</li>
							);
						})}
					</ul>
					{verdict ? <p className="text-xs">{verdict.kind === "SILENT" ? SILENT_ADVICE : UNRECOGNIZED_ADVICE}</p> : null}
				</div>
			) : null}
		</div>
	);
}
