import type { TScaleSerialParityEnum } from "@/schemas/enums";

// Balança do caixa ligada ao computador pela serial (RS-232 ou USB-serial). O PDV pergunta o peso
// com ENQ e a balança responde com um quadro delimitado. Puro e sem dependência de navegador: a
// conexão (lib/pos/serial-scale-connection.ts) entrega bytes aqui e recebe leituras de volta.
//
// Quadros aceitos (os mesmos que o driver Toledo do ACBr lê, ACBrBALToledo.pas):
//
//   [STX] PPPPP [ETX]          Peso estável, sem ponto decimal ("00446" com 3 casas = 0,446 kg)
//   [STX] IIIII [ETX]          Peso instável (prato em movimento)
//   [STX] NNNNN [ETX]          Peso negativo (balança fora do zero)
//   [STX] SSSSS [ETX]          Sobrecarga (acima da capacidade)
//   [STX] PESO  [CR]           Mesmo conteúdo, terminado por CR
//   [STX] S1 PPPPPP S2 TTTTTT UUUUUU [CR] [CS]
//                              "Protocolo A" das Prix: status, peso, total e preço/kg. O bit 0 de S1
//                              é o movimento, o bit 3 de S1 é fora de faixa e o bit 3 de S2 diz se o
//                              peso tem 2 casas (ligado) ou 3.
//
// O quadro é localizado pelos delimitadores, nunca por posição fixa: respostas chegam coladas umas
// nas outras (e em pedaços) e um parser por offset lê "peso errado acima de 10 kg".

export const SCALE_ENQ = 0x05;
const STX = 0x02;
const ETX = 0x03;
const CR = 0x0d;

/** Maior conteúdo plausível entre STX e o terminador. Além disso é lixo: descarta e ressincroniza. */
const MAX_PAYLOAD_LENGTH = 24;
/** Protocolo A: S1 + peso (6) + S2 + total (6) + preço/kg (6). */
const PROTOCOL_A_PAYLOAD_LENGTH = 20;

export type TSerialScaleSettings = {
	velocidade: number;
	bitsDados: 7 | 8;
	paridade: TScaleSerialParityEnum;
	bitsParada: 1 | 2;
	/** Casas decimais implícitas no peso sem ponto. Balanças de varejo em kg usam 3. */
	casasDecimais: 2 | 3;
};

export type TSerialScaleConfig = TSerialScaleSettings & { habilitado: boolean };

// Toledo Prix 3 Fit: 4800 bps, 8 bits, sem paridade, 1 bit de parada, peso com 3 casas.
export const DEFAULT_SERIAL_SCALE_CONFIG: TSerialScaleConfig = {
	habilitado: false,
	velocidade: 4800,
	bitsDados: 8,
	paridade: "NENHUMA",
	bitsParada: 1,
	casasDecimais: 3,
};

export const SERIAL_SCALE_BAUD_RATES = [2400, 4800, 9600, 19200] as const;

export type TScaleFrame = { kind: "STABLE"; weightKg: number } | { kind: "UNSTABLE" } | { kind: "NEGATIVE" } | { kind: "OVERLOAD" };

function isDigit(byte: number) {
	return byte >= 0x30 && byte <= 0x39;
}

function decodeAscii(bytes: number[]) {
	return String.fromCharCode(...bytes);
}

function roundWeight(value: number) {
	return Math.round(value * 1000) / 1000;
}

function readSimplePayload(payload: number[], decimals: number): TScaleFrame | null {
	const text = decodeAscii(payload).trim();
	if (!text) return null;
	if (/^I+$/.test(text)) return { kind: "UNSTABLE" };
	if (/^N+$/.test(text)) return { kind: "NEGATIVE" };
	if (/^S+$/.test(text)) return { kind: "OVERLOAD" };
	if (text.startsWith("-")) return { kind: "NEGATIVE" };
	if (/^\d{1,7}$/.test(text)) return { kind: "STABLE", weightKg: roundWeight(Number(text) / 10 ** decimals) };
	// Alguns firmwares mandam o ponto (ou a vírgula) no próprio quadro: o valor já está em kg.
	if (/^\d*[.,]\d+$/.test(text)) return { kind: "STABLE", weightKg: roundWeight(Number(text.replace(",", "."))) };
	return null;
}

function readProtocolAPayload(payload: number[]): TScaleFrame | null {
	const status1 = payload[0];
	const weightDigits = payload.slice(1, 7);
	const status2 = payload[7];
	if (!weightDigits.every(isDigit)) return null;
	if (status1 & 0b0000_1000) return { kind: "OVERLOAD" };
	if (status1 & 0b0000_0001) return { kind: "UNSTABLE" };
	const decimals = status2 & 0b0000_1000 ? 2 : 3;
	return { kind: "STABLE", weightKg: roundWeight(Number(decodeAscii(weightDigits)) / 10 ** decimals) };
}

function readPayload(payload: number[], terminator: number, decimals: number): TScaleFrame | null {
	if (terminator === CR && payload.length === PROTOCOL_A_PAYLOAD_LENGTH && !isDigit(payload[0])) return readProtocolAPayload(payload);
	return readSimplePayload(payload, decimals);
}

/**
 * Acumula os bytes da porta e devolve os quadros completos à medida que chegam. Funciona tanto com
 * a balança respondendo ao ENQ quanto em modo contínuo (a balança transmite sem ser perguntada).
 */
export function createScaleFrameParser({ casasDecimais }: { casasDecimais: number }) {
	let buffer: number[] = [];

	function push(chunk: Uint8Array): TScaleFrame[] {
		for (const byte of chunk) buffer.push(byte);
		const frames: TScaleFrame[] = [];

		while (buffer.length > 0) {
			const start = buffer.indexOf(STX);
			if (start === -1) {
				buffer = [];
				break;
			}
			if (start > 0) buffer = buffer.slice(start);

			let end = -1;
			for (let index = 1; index < buffer.length && index <= MAX_PAYLOAD_LENGTH + 1; index++) {
				if (buffer[index] === ETX || buffer[index] === CR) {
					end = index;
					break;
				}
				// Um STX no meio é o começo de outro quadro: o atual chegou truncado.
				if (buffer[index] === STX) break;
			}

			if (end === -1) {
				const nextStx = buffer.indexOf(STX, 1);
				if (nextStx !== -1) {
					buffer = buffer.slice(nextStx);
					continue;
				}
				// Quadro ainda chegando: espera o resto, a menos que já tenha passado do tamanho possível.
				if (buffer.length > MAX_PAYLOAD_LENGTH + 1) {
					buffer = buffer.slice(1);
					continue;
				}
				break;
			}

			const frame = readPayload(buffer.slice(1, end), buffer[end], casasDecimais);
			if (frame) frames.push(frame);
			buffer = buffer.slice(end + 1);
		}

		return frames;
	}

	function reset() {
		buffer = [];
	}

	return { push, reset };
}

export type TStableWeightProgress =
	| { status: "CONFIRMED"; weightKg: number }
	| { status: "WAITING"; reason: "NO_READING" | "UNSTABLE" | "EMPTY" | "NEGATIVE" }
	| { status: "FAILED"; reason: "OVERLOAD" };

/**
 * Decide quando uma pesagem pode entrar no carrinho: o mesmo peso estável em `confirmations`
 * leituras seguidas, e maior que zero. A balança já sinaliza instabilidade, mas a confirmação dupla
 * protege da leitura pega no instante em que o produto ainda assenta no prato.
 */
export function createStableWeightConfirmer({ confirmations = 2 }: { confirmations?: number } = {}) {
	let lastWeight: number | null = null;
	let streak = 0;
	let progress: TStableWeightProgress = { status: "WAITING", reason: "NO_READING" };

	function push(frame: TScaleFrame): TStableWeightProgress {
		if (frame.kind !== "STABLE") {
			lastWeight = null;
			streak = 0;
			if (frame.kind === "OVERLOAD") progress = { status: "FAILED", reason: "OVERLOAD" };
			else progress = { status: "WAITING", reason: frame.kind === "NEGATIVE" ? "NEGATIVE" : "UNSTABLE" };
			return progress;
		}
		if (!(frame.weightKg > 0)) {
			lastWeight = null;
			streak = 0;
			progress = { status: "WAITING", reason: "EMPTY" };
			return progress;
		}
		streak = frame.weightKg === lastWeight ? streak + 1 : 1;
		lastWeight = frame.weightKg;
		progress = streak >= confirmations ? { status: "CONFIRMED", weightKg: frame.weightKg } : { status: "WAITING", reason: "UNSTABLE" };
		return progress;
	}

	return { push, current: () => progress };
}

/** Mensagem para o operador quando a pesagem não fecha a tempo (ou a balança recusa). */
export function describeStableWeightFailure(progress: TStableWeightProgress) {
	if (progress.status === "FAILED") return "Peso acima da capacidade da balança.";
	if (progress.status === "CONFIRMED") return null;
	switch (progress.reason) {
		case "NO_READING":
			return "A balança não respondeu. Confira o cabo e a velocidade da porta nas configurações.";
		case "EMPTY":
			return "Coloque o produto na balança antes de pesar.";
		case "NEGATIVE":
			return "Peso negativo: retire o produto e zere a balança.";
		case "UNSTABLE":
			return "O peso não estabilizou. Deixe o produto parado no prato e tente de novo.";
	}
}

/** Unidade comercial de quem é vendido por peso. `unidade` é texto livre no cadastro ("KG", "Kg", "kg."). */
export function isSoldByWeight(unidade: string | null | undefined) {
	if (!unidade) return false;
	const normalized = unidade
		.normalize("NFD")
		.replace(/[^a-zA-Z]/g, "")
		.toUpperCase();
	return normalized === "KG" || normalized === "KILO" || normalized === "QUILO" || normalized === "QUILOGRAMA";
}

/** Peso para o operador: "0,742 kg". */
export function formatScaleWeight(weightKg: number) {
	return `${weightKg.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
}
