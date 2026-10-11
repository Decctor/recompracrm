// Retorno sonoro da leitura. O leitor apita ao ler; só o sistema sabe se o código significou
// algo — por isso o som de erro é distinto e grave, para o operador ouvir sem olhar a tela.
// Tons sintetizados (sem arquivos de áudio), criados após o gesto do teclado para o navegador
// permitir o contexto de áudio.

export type TScanFeedbackKind = "SUCESSO" | "ATENCAO" | "ERRO";

let audioContext: AudioContext | null = null;

function getAudioContext() {
	if (typeof window === "undefined") return null;
	const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Context) return null;
	try {
		audioContext ??= new Context();
		if (audioContext.state === "suspended") void audioContext.resume();
		return audioContext;
	} catch {
		return null;
	}
}

function tone(context: AudioContext, { frequency, startAt, durationMs, gain }: { frequency: number; startAt: number; durationMs: number; gain: number }) {
	const oscillator = context.createOscillator();
	const amplifier = context.createGain();
	oscillator.type = "sine";
	oscillator.frequency.value = frequency;
	const end = startAt + durationMs / 1000;
	amplifier.gain.setValueAtTime(0, startAt);
	amplifier.gain.linearRampToValueAtTime(gain, startAt + 0.005);
	amplifier.gain.setValueAtTime(gain, end - 0.02);
	amplifier.gain.linearRampToValueAtTime(0, end);
	oscillator.connect(amplifier).connect(context.destination);
	oscillator.start(startAt);
	oscillator.stop(end);
}

export function playScanFeedback(kind: TScanFeedbackKind) {
	const context = getAudioContext();
	if (!context) return;
	const now = context.currentTime;
	if (kind === "SUCESSO") {
		tone(context, { frequency: 1760, startAt: now, durationMs: 80, gain: 0.08 });
		return;
	}
	if (kind === "ATENCAO") {
		tone(context, { frequency: 880, startAt: now, durationMs: 70, gain: 0.07 });
		tone(context, { frequency: 1174, startAt: now + 0.09, durationMs: 70, gain: 0.07 });
		return;
	}
	tone(context, { frequency: 220, startAt: now, durationMs: 140, gain: 0.1 });
	tone(context, { frequency: 220, startAt: now + 0.18, durationMs: 140, gain: 0.1 });
}
