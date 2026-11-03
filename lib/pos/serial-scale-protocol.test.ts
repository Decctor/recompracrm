import assert from "node:assert/strict";
import test from "node:test";
import {
	createScaleFrameParser,
	createStableWeightConfirmer,
	describeStableWeightFailure,
	formatScaleWeight,
	isSoldByWeight,
	type TScaleFrame,
} from "./serial-scale-protocol";

const STX = 0x02;
const ETX = 0x03;
const CR = 0x0d;

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
	assert.deepEqual(parser.push(bytes(frame("AB12"), frame("123456789012"))), []);
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
