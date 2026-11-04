import assert from "node:assert/strict";
import test from "node:test";
import {
	createScaleFrameParser,
	createStableWeightConfirmer,
	describeSerialScaleSettings,
	describeStableWeightFailure,
	DEFAULT_SERIAL_SCALE_SETTINGS,
	formatScaleWeight,
	isSoldByWeight,
	type TScaleFrame,
} from "./serial-scale-protocol";

const STX = 0x02;
const ETX = 0x03;
const CR = 0x0d;
const ESC = 0x1b;

function ascii(text: string) {
	return Array.from(text, (char) => char.charCodeAt(0));
}

function frame(payload: string, terminator = ETX) {
	return [STX, ...Array.from(payload, (char) => char.charCodeAt(0)), terminator];
}

function bytes(...parts: number[][]) {
	return Uint8Array.from(parts.flat());
}

test("quadro Toledo de peso estável, sem ponto: 3 casas implícitas", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	assert.deepEqual(parser.push(bytes(frame("00446"))), [{ kind: "STABLE", weightKg: 0.446 }]);
	assert.deepEqual(parser.push(bytes(frame("12345"))), [{ kind: "STABLE", weightKg: 12.345 }]);
	assert.deepEqual(parser.push(bytes(frame("32000"))), [{ kind: "STABLE", weightKg: 32 }]);
});

test("acima de 10 kg não desloca o peso (o bug do parser por posição fixa)", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	assert.deepEqual(parser.push(bytes(frame("10250"), frame("10250"))), [
		{ kind: "STABLE", weightKg: 10.25 },
		{ kind: "STABLE", weightKg: 10.25 },
	]);
});

test("estados sinalizados pela balança", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	assert.deepEqual(parser.push(bytes(frame("IIIII"), frame("NNNNN"), frame("SSSSS"))), [
		{ kind: "UNSTABLE" },
		{ kind: "NEGATIVE" },
		{ kind: "OVERLOAD" },
	] satisfies TScaleFrame[]);
});

test("quadro em pedaços e lixo antes do STX", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	assert.deepEqual(parser.push(Uint8Array.from([0xff, 0x00, STX, 0x30, 0x30])), []);
	assert.deepEqual(parser.push(Uint8Array.from([0x37, 0x34, 0x32, ETX])), [{ kind: "STABLE", weightKg: 0.742 }]);
});

test("quadro truncado é descartado e o seguinte é lido", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	assert.deepEqual(parser.push(bytes([STX, 0x30, 0x31], frame("00500"))), [{ kind: "STABLE", weightKg: 0.5 }]);
});

test("terminador CR, ponto decimal no quadro e 2 casas", () => {
	assert.deepEqual(createScaleFrameParser({ casasDecimais: 3 }).push(bytes(frame("00446", CR))), [{ kind: "STABLE", weightKg: 0.446 }]);
	assert.deepEqual(createScaleFrameParser({ casasDecimais: 3 }).push(bytes(frame("1.250"))), [{ kind: "STABLE", weightKg: 1.25 }]);
	assert.deepEqual(createScaleFrameParser({ casasDecimais: 2 }).push(bytes(frame("01250"))), [{ kind: "STABLE", weightKg: 12.5 }]);
});

test("protocolo A das Prix: peso, movimento e casas pelo status", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	// S1 = 0x40 (sem movimento), S2 = 0x40 (3 casas); total e preço/kg são ignorados.
	const stable = [STX, 0x40, ...Array.from("000742", (c) => c.charCodeAt(0)), 0x40, ...Array.from("001480019990", (c) => c.charCodeAt(0)), CR, 0x7f];
	assert.deepEqual(parser.push(Uint8Array.from(stable)), [{ kind: "STABLE", weightKg: 0.742 }]);

	const moving = [...stable];
	moving[1] = 0x41;
	assert.deepEqual(parser.push(Uint8Array.from(moving)), [{ kind: "UNSTABLE" }]);

	const twoDecimals = [...stable];
	twoDecimals[8] = 0x48;
	assert.deepEqual(parser.push(Uint8Array.from(twoDecimals)), [{ kind: "STABLE", weightKg: 7.42 }]);
});

test("conteúdo que não é peso não vira leitura", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	assert.deepEqual(parser.push(bytes(frame("AB12"), frame("123456789012"), ascii("OK\r\n"))), []);
});

test("Filizola e Digitron: mesmo quadro STX, casas pela configuração", () => {
	assert.deepEqual(createScaleFrameParser({ casasDecimais: 3 }).push(bytes(frame("01250"))), [{ kind: "STABLE", weightKg: 1.25 }]);
	// Digitron manda 6 posições com 2 casas.
	assert.deepEqual(createScaleFrameParser({ casasDecimais: 2 }).push(bytes(frame("000125"))), [{ kind: "STABLE", weightKg: 1.25 }]);
});

test("Magna: linha de texto com kg terminada em LF", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	assert.deepEqual(parser.push(Uint8Array.from(ascii(" 1.250 kg\r\n"))), [{ kind: "STABLE", weightKg: 1.25 }]);
	assert.deepEqual(parser.push(Uint8Array.from(ascii("-0.020 kg\n"))), [{ kind: "NEGATIVE" }]);
});

test("LucasTec: bruto, tara e líquido na mesma linha — vale o líquido", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	const line = [STX, ...ascii("0000 000001 20/06/05 50.00 kg B  0.60 kg T  49.40 kg L"), CR];
	assert.deepEqual(parser.push(Uint8Array.from(line)), [{ kind: "STABLE", weightKg: 49.4 }]);
});

test("Urano: sequências ESC e linha sem terminador, lida quando a porta fica quieta", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	const raw = [ESC, ...ascii("T1"), ESC, ...ascii("A13"), ESC, ...ascii("N0"), ESC, ...ascii("B * PESO: 5,10kg"), ESC, ...ascii("E")];
	assert.deepEqual(parser.push(Uint8Array.from(raw)), []);
	assert.deepEqual(parser.flush(), [{ kind: "STABLE", weightKg: 5.1 }]);
});

test("indicadores genéricos: ST estável, US instável, OL sobrecarga", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	assert.deepEqual(parser.push(Uint8Array.from(ascii("ST,GS,+001.250kg\r\nUS,GS,+001.180kg\r\nOL,GS,+99.999kg\r\n"))), [
		{ kind: "STABLE", weightKg: 1.25 },
		{ kind: "UNSTABLE" },
		{ kind: "OVERLOAD" },
	]);
});

test("quadro numérico pela metade nunca é lido pelo flush", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	assert.deepEqual(parser.push(Uint8Array.from([STX, 0x30, 0x30, 0x34])), []);
	assert.deepEqual(parser.flush(), []);
	assert.deepEqual(parser.push(Uint8Array.from([0x34, 0x36, ETX])), [{ kind: "STABLE", weightKg: 0.446 }]);
});

test("texto de 20 caracteres não é confundido com o protocolo A", () => {
	const parser = createScaleFrameParser({ casasDecimais: 3 });
	assert.deepEqual(parser.push(Uint8Array.from([STX, ...ascii("PESO:   1,250 kg   "), 0x41, CR])), [{ kind: "STABLE", weightKg: 1.25 }]);
});

test("resumo do perfil da balança", () => {
	assert.equal(describeSerialScaleSettings(DEFAULT_SERIAL_SCALE_SETTINGS), "4800 bps · 8N1 · comando ENQ · 3 casas");
	assert.equal(
		describeSerialScaleSettings({ ...DEFAULT_SERIAL_SCALE_SETTINGS, velocidade: 2400, bitsDados: 7, paridade: "PAR", comando: "CONTINUO" }),
		"2400 bps · 7E1 · contínuo · 3 casas",
	);
});

test("pesagem só confirma com o mesmo peso estável duas vezes seguidas", () => {
	const confirmer = createStableWeightConfirmer();
	assert.deepEqual(confirmer.current(), { status: "WAITING", reason: "NO_READING" });
	assert.deepEqual(confirmer.push({ kind: "UNSTABLE" }), { status: "WAITING", reason: "UNSTABLE" });
	assert.deepEqual(confirmer.push({ kind: "STABLE", weightKg: 0.74 }), { status: "WAITING", reason: "UNSTABLE" });
	assert.deepEqual(confirmer.push({ kind: "STABLE", weightKg: 0.742 }), { status: "WAITING", reason: "UNSTABLE" });
	assert.deepEqual(confirmer.push({ kind: "STABLE", weightKg: 0.742 }), { status: "CONFIRMED", weightKg: 0.742 });
});

test("prato vazio, negativo e sobrecarga não confirmam", () => {
	const confirmer = createStableWeightConfirmer();
	confirmer.push({ kind: "STABLE", weightKg: 0 });
	assert.deepEqual(confirmer.push({ kind: "STABLE", weightKg: 0 }), { status: "WAITING", reason: "EMPTY" });
	assert.deepEqual(confirmer.push({ kind: "NEGATIVE" }), { status: "WAITING", reason: "NEGATIVE" });
	assert.deepEqual(confirmer.push({ kind: "OVERLOAD" }), { status: "FAILED", reason: "OVERLOAD" });
	assert.match(describeStableWeightFailure(confirmer.current()) ?? "", /capacidade/);
	assert.match(describeStableWeightFailure({ status: "WAITING", reason: "NO_READING" }) ?? "", /não respondeu/);
});

test("unidade vendida por peso é texto livre no cadastro", () => {
	for (const unidade of ["KG", "kg", " Kg. ", "quilo", "QUILOGRAMA"]) assert.equal(isSoldByWeight(unidade), true, unidade);
	for (const unidade of ["UN", "CX", "G", "", null, undefined]) assert.equal(isSoldByWeight(unidade), false, String(unidade));
});

test("peso formatado em kg com 3 casas", () => {
	assert.equal(formatScaleWeight(0.742), "0,742 kg");
	assert.equal(formatScaleWeight(12.5), "12,500 kg");
});
