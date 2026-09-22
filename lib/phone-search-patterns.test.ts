import assert from "node:assert/strict";
import test from "node:test";
import { buildPhoneSearchPatterns, formatPhoneAsBase } from "./formatting";

// "34 99662-6855" é guardado em telefoneBase sem o nono dígito.
const storedBase = formatPhoneAsBase("34 99662-6855");

test("a base guardada perde o nono dígito", () => {
	assert.equal(storedBase, "3496626855");
});

test("prefixo digitado com o 9 gera uma variante que casa com a base guardada", () => {
	for (const typed of ["3499", "349966", "349966268", "3499662685"]) {
		const patterns = buildPhoneSearchPatterns(typed);
		assert.ok(
			patterns.some((pattern) => storedBase.includes(pattern)),
			`nenhum padrão de "${typed}" casa: ${patterns.join(", ")}`,
		);
	}
});

test("número completo continua casando pela base normalizada", () => {
	assert.ok(buildPhoneSearchPatterns("(34) 99662-6855").includes(storedBase));
	assert.ok(buildPhoneSearchPatterns("+55 34 99662-6855").includes(storedBase));
});

test("prefixo sem o 9 e fixo casam pelos próprios dígitos, sem variante espúria", () => {
	assert.deepEqual(buildPhoneSearchPatterns("3466"), ["3466"]);
	assert.deepEqual(buildPhoneSearchPatterns("34 3236-1234"), ["3432361234"]);
	assert.deepEqual(buildPhoneSearchPatterns("abc"), []);
});
