// Detector de leitura de código de barras por teclado (modo "keyboard wedge").
// Um leitor USB/Bluetooth digita o código como teclas separadas por poucos milissegundos e
// termina com um sufixo (Enter por padrão; Tab em alguns modelos). Nenhuma pessoa digita três
// caracteres em 50 ms, então o intervalo entre teclas é o único sinal confiável — o mesmo
// critério do Odoo e da maioria dos PDVs web. Puro e sem DOM para ser testável; a cola com
// `window` fica em `lib/hooks/use-barcode-scanner.ts`.

/** Intervalo máximo entre duas teclas da mesma leitura. Leitores ficam entre 1 e 20 ms. */
export const BARCODE_SCAN_MAX_INTERVAL_MS = 50;
/** Códigos internos curtos existem ("123"); abaixo disso é ruído de tecla presa. */
export const BARCODE_SCAN_MIN_LENGTH = 3;
/** GTIN-14 tem 14; Code 128 interno raramente passa de 30. Acima disso não é leitura. */
export const BARCODE_SCAN_MAX_LENGTH = 64;
/** Sufixos que os leitores enviam ao fim do código (configuráveis no aparelho). */
export const BARCODE_SCAN_TERMINATOR_KEYS = new Set(["Enter", "Tab", "NumpadEnter"]);

export type TBarcodeScanDetectorOptions = {
	maxIntervalMs?: number;
	minLength?: number;
	maxLength?: number;
};

export type TBarcodeScanBurst = {
	/** Caracteres acumulados na rajada atual. */
	buffer: string;
	/** Instante da última tecla aceita (ms, mesma base de `KeyboardEvent.timeStamp`). */
	lastAt: number;
	/** Passou do tamanho máximo: a rajada inteira é ruído até esfriar (pausa > intervalo). */
	overflowed: boolean;
};

export function isPrintableScanKey(key: string) {
	// `key` com um único code point: letras, dígitos e símbolos. Teclas como "Shift" têm nome longo.
	return [...key].length === 1 && key !== " " ? /^[\x21-\x7e]$/.test(key) : false;
}

export function createBarcodeScanDetector(options: TBarcodeScanDetectorOptions = {}) {
	const maxIntervalMs = options.maxIntervalMs ?? BARCODE_SCAN_MAX_INTERVAL_MS;
	const minLength = options.minLength ?? BARCODE_SCAN_MIN_LENGTH;
	const maxLength = options.maxLength ?? BARCODE_SCAN_MAX_LENGTH;

	let burst: TBarcodeScanBurst | null = null;

	function reset() {
		burst = null;
	}

	function isStale(at: number) {
		return burst !== null && at - burst.lastAt > maxIntervalMs;
	}

	/**
	 * Registra uma tecla imprimível. Devolve `"started"` quando ela abre uma rajada nova (a
	 * anterior expirou ou não existia) — momento em que o chamador guarda o alvo e o valor
	 * original do campo para poder desfazer a digitação depois.
	 */
	function pushKey(key: string, at: number): "started" | "continued" | "ignored" {
		if (!isPrintableScanKey(key)) return "ignored";
		if (burst === null || isStale(at)) {
			burst = { buffer: key, lastAt: at, overflowed: false };
			return "started";
		}
		if (burst.overflowed || burst.buffer.length >= maxLength) {
			// Passou do tamanho de qualquer código: é tecla presa ou colagem, não leitura. Segue
			// ignorando no mesmo ritmo até a rajada esfriar, para o resto não virar um código novo.
			burst = { buffer: "", lastAt: at, overflowed: true };
			return "ignored";
		}
		burst = { buffer: burst.buffer + key, lastAt: at, overflowed: false };
		return "continued";
	}

	/**
	 * Recebe o sufixo (Enter/Tab). Devolve o código quando a rajada tem o comprimento mínimo e o
	 * sufixo chegou no mesmo ritmo das teclas; senão `null`. Em ambos os casos a rajada zera.
	 */
	function terminate(at: number): string | null {
		const current = burst;
		reset();
		if (current === null || current.overflowed) return null;
		if (at - current.lastAt > maxIntervalMs) return null;
		if (current.buffer.length < minLength) return null;
		return current.buffer;
	}

	return {
		pushKey,
		terminate,
		reset,
		/** Rajada em andamento, para o chamador decidir se ainda confia nela. */
		peek: () => (burst ? { ...burst } : null),
	};
}

export type TBarcodeScanDetector = ReturnType<typeof createBarcodeScanDetector>;
