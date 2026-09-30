import assert from "node:assert/strict";
import { test } from "node:test";
import { parseViaCepNumberRange, pickViaCepStreetMatch, type TViaCepAddress } from "./viacep";

function viaCep(cep: string, logradouro: string, bairro: string, complemento = ""): TViaCepAddress {
	return { cep, logradouro, complemento, bairro, localidade: "Ponta Grossa", uf: "PR" };
}

// Recorte real de /ws/PR/Ponta Grossa/balduino taques/json/.
const BALDUINO_TAQUES = [
	viaCep("84010-050", "Rua Balduíno Taques", "Centro"),
	viaCep("84015-255", "Rua Balduíno Taques", "Orfãs"),
	viaCep("84040-000", "Rua Balduíno Taques", "Estrela"),
	viaCep("84010-917", "Rua Balduíno Taques", "Centro", "1150"),
	viaCep("84010-915", "Rua Balduíno Taques", "Centro", "890"),
];

test("rua em vários bairros: sem bairro, devolve só a grafia", () => {
	const match = pickViaCepStreetMatch({ results: BALDUINO_TAQUES, logradouro: "R balduino taques", numero: "45" });
	assert.deepEqual(match, { logradouro: "Rua Balduíno Taques", bairro: null, cep: null });
});

test("rua em vários bairros: o bairro escolhe o CEP e ignora CEP de prédio", () => {
	const match = pickViaCepStreetMatch({ results: BALDUINO_TAQUES, logradouro: "Rua Balduíno Taques", bairro: "centro", numero: "45" });
	assert.deepEqual(match, { logradouro: "Rua Balduíno Taques", bairro: "Centro", cep: "84010-050" });
});

test("a faixa de numeração escolhe o CEP", () => {
	const results = [
		viaCep("01311-000", "Avenida Paulista", "Bela Vista", "até 610 - lado par"),
		viaCep("01310-100", "Avenida Paulista", "Bela Vista", "de 612 a 1510 - lado par"),
		viaCep("01311-200", "Avenida Paulista", "Bela Vista", "de 1047 a 1865 - lado ímpar"),
		viaCep("01310-946", "Avenida Paulista", "Bela Vista", "1374 12 Andar"),
		viaCep("08190-461", "Viela Paulista", "Vila Itaim"),
	];
	assert.equal(pickViaCepStreetMatch({ results, logradouro: "Av. Paulista", numero: "1000" })?.cep, "01310-100");
	assert.equal(pickViaCepStreetMatch({ results, logradouro: "Av. Paulista", numero: "1101" })?.cep, "01311-200");
	// Sem tipo, "Paulista" casa com as duas vias: nem CEP nem grafia são escolhidos.
	assert.deepEqual(pickViaCepStreetMatch({ results, logradouro: "Paulista" }), { logradouro: "Paulista", bairro: null, cep: null });
});

test("parseViaCepNumberRange lê os formatos do ViaCEP", () => {
	assert.deepEqual(parseViaCepNumberRange("até 1099/1100"), { min: null, max: 1100, parity: null });
	assert.deepEqual(parseViaCepNumberRange("de 1101/1102 ao fim"), { min: 1101, max: null, parity: null });
	assert.deepEqual(parseViaCepNumberRange("de 1047 a 1865 - lado ímpar"), { min: 1047, max: 1865, parity: "ODD" });
	assert.deepEqual(parseViaCepNumberRange("lado par"), { min: null, max: null, parity: "EVEN" });
	assert.equal(parseViaCepNumberRange("522"), "SPECIFIC");
	assert.equal(parseViaCepNumberRange("1374 12 Andar"), "SPECIFIC");
	assert.equal(parseViaCepNumberRange(""), null);
});

test("nenhum resultado com o mesmo nome", () => {
	assert.equal(pickViaCepStreetMatch({ results: BALDUINO_TAQUES, logradouro: "Rua das Flores" }), null);
});
