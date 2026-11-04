// Balança do caixa ligada ao computador pela serial (RS-232 ou USB-serial). O PDV pede o peso com um
// byte de comando e a balança responde com um quadro. Puro e sem dependência de navegador: a conexão
// (lib/pos/serial-scale-connection.ts) entrega bytes aqui e recebe leituras de volta.
//
// Genérico de propósito. As balanças de varejo vendidas no Brasil falam poucas variações do mesmo
// protocolo (referência: os drivers de balança do ACBr):
//
//   Comando  ENQ (0x05)  Toledo, Filizola, Urano, Digitron, LucasTec, Elgin e a maioria dos "modos
//                        compatíveis Toledo/Filizola" das outras marcas
//            W   (0x57)  Magellan
//            P   (0x50)  Magna
//            nenhum      balanças em modo contínuo (transmitem sem ser perguntadas)
//
//   Quadros  [STX] PPPPP [ETX|CR]     peso sem ponto, casas implícitas ("00446" com 3 casas = 0,446 kg)
//            [STX] IIIII / NNNNN / SSSSS [ETX]   instável / negativo / sobrecarga
//            [STX] 1.250 [ETX]        peso com ponto (ou vírgula): já está em kg
//            [STX] S1 PPPPPP S2 TTTTTT UUUUUU [CR] [CS]
//                                     "protocolo A" das Prix: bit 0 de S1 = movimento, bit 3 de S1 =
//                                     fora de faixa, bit 3 de S2 = peso com 2 casas (senão 3)
//            linha de texto com kg    "PESO: 5,10kg" (Urano), " 1.250 kg" (Magna),
//                                     "50.00 kg B 0.60 kg T 49.40 kg L" (LucasTec: vale o líquido),
//                                     "ST,GS,+001.250kg" / "US,..." (indicadores genéricos)
//
// O quadro é localizado pelos delimitadores, nunca por posição fixa: respostas chegam coladas umas
// nas outras e em pedaços, e um parser por offset lê "peso errado acima de 10 kg".

const STX = 0x02;
const ETX = 0x03;
const LF = 0x0a;
const CR = 0x0d;

/** Maior conteúdo plausível de um quadro. Além disso é lixo: descarta e ressincroniza. */
const MAX_FRAME_LENGTH = 64;
/** Protocolo A: S1 + peso (6) + S2 + total (6) + preço/kg (6). */
const PROTOCOL_A_PAYLOAD_LENGTH = 20;

export type TSerialScaleCommand = "ENQ" | "W" | "P" | "CONTINUO";
export type TSerialScaleParity = "NENHUMA" | "PAR" | "IMPAR";

export const SERIAL_SCALE_COMMAND_BYTES: Record<Exclude<TSerialScaleCommand, "CONTINUO">, number> = { ENQ: 0x05, W: 0x57, P: 0x50 };

export type TSerialScaleSettings = {
	velocidade: number;
	bitsDados: 7 | 8;
	paridade: TSerialScaleParity;
	bitsParada: 1 | 2;
	comando: TSerialScaleCommand;
	/** Casas decimais implícitas no peso sem ponto. Balanças de varejo em kg usam 3. */
	casasDecimais: 2 | 3;
};

// Ponto de partida antes da detecção: o caso mais comum (Toledo Prix 3 Fit).
export const DEFAULT_SERIAL_SCALE_SETTINGS: TSerialScaleSettings = {
	velocidade: 4800,
	bitsDados: 8,
	paridade: "NENHUMA",
	bitsParada: 1,
	comando: "ENQ",
	casasDecimais: 3,
};

/** `preferencias.balancaCaixa`: só a habilitação. Os parâmetros são de cada computador (perfil local). */
export const DEFAULT_SERIAL_SCALE_CONFIG = { habilitado: false };

export const SERIAL_SCALE_BAUD_RATES = [2400, 4800, 9600, 19200] as const;
export const SERIAL_SCALE_COMMANDS = ["ENQ", "W", "P", "CONTINUO"] as const satisfies readonly TSerialScaleCommand[];

/**
 * Ordem da detecção automática, do mais provável ao menos: enquadramento × velocidade. Em cada
 * combinação a conexão testa os comandos (primeiro escuta o modo contínuo, depois ENQ, W e P).
 */
export const SERIAL_SCALE_DETECTION_FRAMINGS: Pick<TSerialScaleSettings, "velocidade" | "bitsDados" | "paridade" | "bitsParada">[] = [
	...([4800, 2400, 9600, 19200] as const).map((velocidade) => ({
		velocidade,
		bitsDados: 8 as const,
		paridade: "NENHUMA" as const,
		bitsParada: 1 as const,
	})),
	...([2400, 4800, 9600] as const).map((velocidade) => ({ velocidade, bitsDados: 7 as const, paridade: "PAR" as const, bitsParada: 1 as const })),
];

export type TScaleFrame = { kind: "STABLE"; weightKg: number } | { kind: "UNSTABLE" } | { kind: "NEGATIVE" } | { kind: "OVERLOAD" };

function isDigit(byte: number) {
	return byte >= 0x30 && byte <= 0x39;
}

function decodeAscii(bytes: number[]) {
	// Sem os bytes de controle (STX, ESC das sequências da Urano etc.), que não carregam peso.
	return String.fromCharCode(...bytes.filter((byte) => byte >= 0x20 && byte < 0x7f));
}

function roundWeight(value: number) {
	return Math.round(value * 1000) / 1000;
}

function parseNumber(raw: string, decimals: number) {
	const normalized = raw.replace(",", ".");
	const value = Number(normalized);
	if (!Number.isFinite(value)) return null;
	return normalized.includes(".") ? value : value / 10 ** decimals;
}

function readStatusOnly(text: string): TScaleFrame | null {
	if (/^I+$/.test(text)) return { kind: "UNSTABLE" };
	if (/^N+$/.test(text)) return { kind: "NEGATIVE" };
	if (/^S+$/.test(text)) return { kind: "OVERLOAD" };
	return null;
}

function weightFrame(value: number): TScaleFrame {
	if (value < 0) return { kind: "NEGATIVE" };
	return { kind: "STABLE", weightKg: roundWeight(value) };
}

/** Linha de texto com a unidade: indicadores que escrevem "kg" junto do número. */
function readTextWeight(text: string, decimals: number): TScaleFrame | null {
	if (!/kg/i.test(text)) return null;
	if (/\bUS\b/.test(text) || /INST[AÁ]VEL/i.test(text)) return { kind: "UNSTABLE" };
	if (/\bOL\b/.test(text) || /SOBRECARGA/i.test(text)) return { kind: "OVERLOAD" };
	// Bruto / tara / líquido na mesma linha: o que vai para a venda é o líquido.
	const net = text.match(/([+-]?\s*\d+(?:[.,]\d+)?)\s*kg\s*L\b/i);
	const first = net ?? text.match(/([+-]?\s*\d+(?:[.,]\d+)?)\s*kg/i);
	if (!first) return null;
	const value = parseNumber(first[1].replace(/\s/g, ""), decimals);
	return value === null ? null : weightFrame(value);
}

function readPayload(payload: number[], decimals: number): TScaleFrame | null {
	if (payload.length === PROTOCOL_A_PAYLOAD_LENGTH && !isDigit(payload[0])) {
		const frame = readProtocolAPayload(payload);
		if (frame) return frame;
	}
	const text = decodeAscii(payload).trim();
	if (!text) return null;
	const status = readStatusOnly(text);
	if (status) return status;
	if (/^[+-]?\d{1,7}$/.test(text)) return weightFrame(Number(text) / 10 ** decimals);
	if (/^[+-]?\d*[.,]\d+$/.test(text)) return weightFrame(Number(text.replace(",", ".")));
	return readTextWeight(text, decimals);
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

/**
 * Acumula os bytes da porta e devolve os quadros completos à medida que chegam. Dois enquadramentos:
 * começando em STX (até ETX ou CR) ou uma linha de texto (até CR ou LF). Funciona com a balança
 * respondendo a comando ou transmitindo em modo contínuo.
 */
export function createScaleFrameParser({ casasDecimais }: { casasDecimais: number }) {
	let buffer: number[] = [];

	function push(chunk: Uint8Array): TScaleFrame[] {
		for (const byte of chunk) buffer.push(byte);
		const frames: TScaleFrame[] = [];

		while (buffer.length > 0) {
			const stx = buffer.indexOf(STX);
			const lineEnd = buffer.findIndex((byte) => byte === CR || byte === LF);

			// Linha de texto que termina antes de qualquer STX.
			if (lineEnd !== -1 && (stx === -1 || lineEnd < stx)) {
				const line = buffer.slice(0, lineEnd);
				buffer = buffer.slice(lineEnd + 1);
				if (line.length > 0 && line.length <= MAX_FRAME_LENGTH) {
					const frame = readPayload(line, casasDecimais);
					if (frame) frames.push(frame);
				}
				continue;
			}

			if (stx === -1) {
				// Sem STX e sem fim de linha: texto ainda chegando, ou lixo longo demais para ser quadro.
				if (buffer.length > MAX_FRAME_LENGTH) buffer = [];
				break;
			}
			if (stx > 0) buffer = buffer.slice(stx);

			let end = -1;
			let truncated = false;
			for (let index = 1; index < buffer.length && index <= MAX_FRAME_LENGTH + 1; index++) {
				if (buffer[index] === ETX || buffer[index] === CR) {
					end = index;
					break;
				}
				// Um STX no meio é o começo de outro quadro: o atual chegou truncado.
				if (buffer[index] === STX) {
					truncated = true;
					break;
				}
			}

			if (end === -1) {
				if (truncated) {
					buffer = buffer.slice(buffer.indexOf(STX, 1));
					continue;
				}
				// Quadro ainda chegando: espera o resto, a menos que já tenha passado do tamanho possível.
				if (buffer.length > MAX_FRAME_LENGTH + 1) {
					buffer = buffer.slice(1);
					continue;
				}
				break;
			}

			const frame = readPayload(buffer.slice(1, end), casasDecimais);
			if (frame) frames.push(frame);
			buffer = buffer.slice(end + 1);
		}

		return frames;
	}

	/**
	 * A linha ficou quieta sem terminador: algumas balanças de texto (Urano) não fecham a linha com
	 * CR/LF. Só vale para texto com "kg" — um quadro numérico pela metade nunca vira peso.
	 */
	function flush(): TScaleFrame[] {
		if (buffer.length === 0 || buffer.length > MAX_FRAME_LENGTH + 1) {
			buffer = [];
			return [];
		}
		const payload = buffer[0] === STX ? buffer.slice(1) : buffer;
		if (!/kg/i.test(decodeAscii(payload))) return [];
		buffer = [];
		const frame = readTextWeight(decodeAscii(payload).trim(), casasDecimais);
		return frame ? [frame] : [];
	}

	function reset() {
		buffer = [];
	}

	return { push, flush, reset };
}

export type TStableWeightProgress =
	| { status: "CONFIRMED"; weightKg: number }
	| { status: "WAITING"; reason: "NO_READING" | "UNSTABLE" | "EMPTY" | "NEGATIVE" }
	| { status: "FAILED"; reason: "OVERLOAD" };

/**
 * Decide quando uma pesagem pode entrar no carrinho: o mesmo peso estável em `confirmations`
 * leituras seguidas, e maior que zero. Nem toda balança sinaliza instabilidade, e mesmo as que
 * sinalizam podem ser lidas no instante em que o produto ainda assenta no prato.
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
			return "A balança não respondeu. Confira se ela está ligada e o cabo; se continuar, detecte a balança de novo nas configurações.";
		case "EMPTY":
			return "Coloque o produto na balança antes de pesar.";
		case "NEGATIVE":
			return "Peso negativo: retire o produto e zere a balança.";
		case "UNSTABLE":
			return "O peso não estabilizou. Deixe o produto parado no prato e tente de novo.";
	}
}

/** "4800 bps · 8N1 · ENQ" — o resumo do perfil detectado, para conferência. */
export function describeSerialScaleSettings(settings: TSerialScaleSettings) {
	const parity = settings.paridade === "NENHUMA" ? "N" : settings.paridade === "PAR" ? "E" : "O";
	const command = settings.comando === "CONTINUO" ? "contínuo" : `comando ${settings.comando}`;
	return `${settings.velocidade} bps · ${settings.bitsDados}${parity}${settings.bitsParada} · ${command} · ${settings.casasDecimais} casas`;
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
