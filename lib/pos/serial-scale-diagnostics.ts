// Diagnóstico da porta da balança para quem está no caixa com a balança na frente. Puro: a conexão
// (lib/pos/serial-scale-connection.ts) junta os bytes crus e os erros de leitura, e aqui eles viram
// texto legível e um veredito ("nada chegou" × "chegou, mas não reconheço").
//
// Existe porque "a balança não respondeu" sozinho não separa os dois casos que pedem ações opostas:
// silêncio total é cabo, porta errada da balança ou saída serial desligada (nenhum ajuste no sistema
// resolve); bytes ou erros de enquadramento quer dizer que a balança fala, só que num formato ou numa
// velocidade que a detecção não testou (aí é o sistema que precisa aprender o quadro novo).

export type TSerialReadErrorCount = { name: string; count: number };

export type TSerialScaleDetectionAttempt = {
	/** Enquadramento testado: "9600 bps · 8N1". Os comandos (ENQ, W, P) rodam todos dentro dele. */
	label: string;
	/** Bytes recebidos no enquadramento inteiro (escuta + comandos). */
	bytes: number;
	/** Bytes que chegaram antes de qualquer comando: balança transmitindo sozinha (modo contínuo). */
	unpromptedBytes: number;
	/** Quadros válidos lidos — abaixo do mínimo, senão a detecção teria parado aqui. */
	frames: number;
	errors: TSerialReadErrorCount[];
	/** Os primeiros bytes recebidos, para conferência. */
	sample: number[];
};

export type TSerialScaleDetectionVerdict =
	/** Nenhum byte e nenhum erro em nenhuma combinação: a balança não transmite para esta porta. */
	| { kind: "SILENT" }
	/** Algo chegou (bytes ou erros de linha) em alguma combinação, mas nunca um quadro reconhecido. */
	| { kind: "UNRECOGNIZED"; activeLabels: string[] };

const CONTROL_NAMES: Record<number, string> = {
	0x00: "NUL",
	0x02: "STX",
	0x03: "ETX",
	0x04: "EOT",
	0x05: "ENQ",
	0x06: "ACK",
	0x0a: "LF",
	0x0d: "CR",
	0x15: "NAK",
	0x1b: "ESC",
};

/** "02 30 30 34 34 36 03" */
export function formatSerialBytesHex(bytes: readonly number[]) {
	return bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

/** "<STX>00446<ETX>": texto imprimível como está, controles pelo nome, o resto em hexa. */
export function formatSerialBytesText(bytes: readonly number[]) {
	let text = "";
	for (const byte of bytes) {
		if (byte >= 0x20 && byte < 0x7f) text += String.fromCharCode(byte);
		else text += `<${CONTROL_NAMES[byte] ?? byte.toString(16).toUpperCase().padStart(2, "0")}>`;
	}
	return text;
}

/**
 * Os erros não fatais da Web Serial. Erro de enquadramento ou de paridade é a pista mais útil: a
 * linha tem sinal, só que noutra velocidade ou noutro formato.
 */
export function describeSerialReadError(name: string) {
	switch (name) {
		case "FramingError":
			return "erro de enquadramento (velocidade ou formato diferentes)";
		case "ParityError":
			return "erro de paridade (formato diferente)";
		case "BreakError":
			return "linha em break (sinal parado em nível baixo)";
		case "BufferOverrunError":
			return "dados chegando mais rápido do que a leitura";
		default:
			return name;
	}
}

export function judgeSerialScaleDetection(attempts: readonly TSerialScaleDetectionAttempt[]): TSerialScaleDetectionVerdict {
	const active = attempts.filter((attempt) => attempt.bytes > 0 || attempt.errors.length > 0);
	if (active.length === 0) return { kind: "SILENT" };
	return { kind: "UNRECOGNIZED", activeLabels: active.map((attempt) => attempt.label) };
}

/** Uma linha por combinação, para a tela e para o texto copiado. */
export function describeSerialScaleDetectionAttempt(attempt: TSerialScaleDetectionAttempt) {
	if (attempt.bytes === 0 && attempt.errors.length === 0) return "nada recebido";
	const parts: string[] = [];
	if (attempt.bytes > 0) {
		parts.push(`${attempt.bytes} ${attempt.bytes === 1 ? "byte" : "bytes"}`);
		if (attempt.unpromptedBytes > 0) parts.push(`${attempt.unpromptedBytes} sem pedir`);
		parts.push(attempt.frames > 0 ? `${attempt.frames} ${attempt.frames === 1 ? "quadro válido" : "quadros válidos"}` : "nenhum quadro reconhecido");
	}
	for (const error of attempt.errors) parts.push(`${describeSerialReadError(error.name)} ×${error.count}`);
	return parts.join(" · ");
}
