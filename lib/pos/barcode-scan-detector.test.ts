import assert from "node:assert/strict";
import test from "node:test";
import { createBarcodeScanDetector, isPrintableScanKey } from "./barcode-scan-detector";

function feed(detector: ReturnType<typeof createBarcodeScanDetector>, code: string, start: number, intervalMs: number) {
	let at = start;
	for (const char of code) {
		detector.pushKey(char, at);
		at += intervalMs;
	}
	return at;
}

test("rajada de leitor (teclas a 5 ms) termina com Enter e devolve o código", () => {
	const detector = createBarcodeScanDetector();
	const end = feed(detector, "7891234567895", 1000, 5);
	assert.equal(detector.terminate(end), "7891234567895");
	assert.equal(detector.peek(), null);
});

test("digitação humana (teclas a 120 ms) nunca vira leitura", () => {
	const detector = createBarcodeScanDetector();
	const end = feed(detector, "7891234567895", 1000, 120);
	assert.equal(detector.terminate(end), null);
});

test("Enter atrasado em relação à última tecla descarta a rajada", () => {
	const detector = createBarcodeScanDetector();
	const end = feed(detector, "SKU-01", 1000, 5);
	assert.equal(detector.terminate(end + 400), null);
});

test("primeira tecla após pausa abre rajada nova e descarta a digitação anterior", () => {
	const detector = createBarcodeScanDetector();
	feed(detector, "abc", 1000, 100); // humano
	assert.equal(detector.pushKey("7", 2000), "started");
	const end = feed(detector, "891234567895", 2005, 5);
	assert.equal(detector.terminate(end), "7891234567895");
});

test("código abaixo do mínimo é ruído", () => {
	const detector = createBarcodeScanDetector();
	const end = feed(detector, "12", 1000, 5);
	assert.equal(detector.terminate(end), null);
});

test("rajada maior que o máximo é descartada", () => {
	const detector = createBarcodeScanDetector({ maxLength: 10 });
	const end = feed(detector, "12345678901234", 1000, 5);
	assert.equal(detector.terminate(end), null);
});

test("teclas não imprimíveis não entram na rajada", () => {
	const detector = createBarcodeScanDetector();
	assert.equal(detector.pushKey("Shift", 1000), "ignored");
	assert.equal(detector.pushKey(" ", 1000), "ignored");
	assert.equal(detector.pushKey("ç", 1000), "ignored");
	assert.equal(detector.pushKey("A", 1000), "started");
	assert.equal(detector.pushKey("-", 1005), "continued");
	assert.equal(detector.pushKey("1", 1010), "continued");
	assert.equal(detector.terminate(1015), "A-1");
});

test("isPrintableScanKey aceita só ASCII imprimível de um caractere", () => {
	assert.ok(isPrintableScanKey("0"));
	assert.ok(isPrintableScanKey("Z"));
	assert.ok(isPrintableScanKey("%"));
	assert.ok(!isPrintableScanKey("Enter"));
	assert.ok(!isPrintableScanKey(" "));
	assert.ok(!isPrintableScanKey("é"));
	assert.ok(!isPrintableScanKey(""));
});
