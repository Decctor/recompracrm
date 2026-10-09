"use client";

import { cn } from "@/lib/utils";
import { Check, Mic, Square, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAudioRecorder } from "./Hooks/useAudioRecorder";
import { validateAudioSize } from "./utils/audioUpload";

/**
 * Gravação de mensagem de voz na barra de composição.
 *
 * Substitui em linha, não em modal: gravar áudio é uma ação de segundos e o modal
 * anterior tirava a conversa da tela por todo o tempo da gravação. Enquanto grava, a
 * barra inteira vira o controle de gravação — o estado fica impossível de confundir.
 *
 * O envio devolve o blob para o `ChatInputArea`, que já sabe converter para base64 e
 * anexar: aqui não há upload próprio, para o áudio percorrer o mesmo caminho de
 * qualquer outro anexo.
 */

const MAX_RECORDING_SECONDS = 5 * 60;

type ChatVoiceRecorderProps = {
	disabled?: boolean;
	onRecorded: (input: { blob: Blob; mimeType: string; durationSeconds: number }) => void;
	/** Enquanto ativo, o gravador ocupa a linha inteira e a barra esconde o resto. */
	onActiveChange?: (isActive: boolean) => void;
};

function formatDuration(seconds: number) {
	const minutes = Math.floor(seconds / 60);
	return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ChatVoiceRecorder({ disabled, onRecorded, onActiveChange }: ChatVoiceRecorderProps) {
	const { recordingState, recordingDuration, audioBlob, audioLevels, error, startRecording, stopRecording, cancelRecording, resetRecording } =
		useAudioRecorder();

	const isRecording = recordingState === "recording";
	const isReview = recordingState === "stopped" && !!audioBlob;

	// Em efeito, não no render: avisar o pai durante o render dispara "Cannot update a
	// component while rendering a different component".
	const isActive = isRecording || isReview;
	const onActiveChangeRef = useRef(onActiveChange);
	onActiveChangeRef.current = onActiveChange;
	useEffect(() => {
		onActiveChangeRef.current?.(isActive);
	}, [isActive]);

	// O hook só informa o erro; o aviso é daqui. Sem isso, microfone negado/ausente não mostrava
	// nada: o estado `error` cai no botão ocioso, e o texto de erro só existia na barra de gravação.
	// `resetRecording` volta ao ocioso para o próximo toque tentar de novo (e não repetir o toast).
	useEffect(() => {
		if (recordingState !== "error") return;
		toast.error(error ?? "Não foi possível gravar o áudio.");
		resetRecording();
	}, [recordingState, error, resetRecording]);

	function handleConfirm() {
		if (!audioBlob) return;
		const validation = validateAudioSize(audioBlob);
		if (!validation.isValid) {
			toast.error(validation.error ?? "O áudio gravado excede o tamanho máximo permitido.");
			return;
		}
		onRecorded({ blob: audioBlob, mimeType: audioBlob.type || "audio/webm", durationSeconds: recordingDuration });
		resetRecording();
	}

	if (!isRecording && !isReview) {
		return (
			<button
				type="button"
				disabled={disabled}
				onClick={() => void startRecording()}
				aria-label="Gravar mensagem de voz"
				className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
			>
				<Mic className="h-4 w-4" />
			</button>
		);
	}

	return (
		<div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1.5">
			<button
				type="button"
				onClick={cancelRecording}
				aria-label="Descartar gravação"
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/30"
			>
				<Trash2 className="h-4 w-4" />
			</button>

			<div className="flex min-w-0 flex-1 items-center gap-2">
				{isRecording && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive" />}
				<span className="shrink-0 text-xs font-bold tabular-nums">{formatDuration(recordingDuration)}</span>

				{/* Os níveis vêm do próprio analisador do microfone: é retorno de que o
				    dispositivo está captando, não decoração. */}
				<div aria-hidden className="flex h-6 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
					{audioLevels.slice(-40).map((level, position) => (
						<span
							key={`level-${position}-${level}`}
							style={{ height: `${Math.max(12, Math.min(level, 100))}%` }}
							className="w-[3px] shrink-0 rounded-full bg-muted-foreground/60"
						/>
					))}
				</div>
			</div>

			{isRecording ? (
				<button
					type="button"
					onClick={stopRecording}
					aria-label="Parar gravação"
					disabled={recordingDuration >= MAX_RECORDING_SECONDS}
					className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/10 transition-colors hover:bg-foreground/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					<Square className="h-3.5 w-3.5 fill-current" />
				</button>
			) : (
				<button
					type="button"
					onClick={handleConfirm}
					aria-label="Anexar gravação"
					className={cn(
						"flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors",
						"hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
					)}
				>
					<Check className="h-4 w-4" />
				</button>
			)}
		</div>
	);
}
