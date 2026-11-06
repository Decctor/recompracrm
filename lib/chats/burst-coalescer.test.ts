import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createBurstCoalescer } from "./burst-coalescer";

function setup() {
	mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
	let calls = 0;
	const coalescer = createBurstCoalescer(() => calls++, { waitMs: 600, maxWaitMs: 3000 });
	return { coalescer, calls: () => calls };
}

test("uma rajada de eventos vira uma única chamada, depois do último evento", (t) => {
	t.after(() => mock.timers.reset());
	const { coalescer, calls } = setup();

	// 438 eventos chegando de uma vez (o UPDATE em massa do "marcar todas como lidas").
	for (let i = 0; i < 438; i++) coalescer.schedule();
	assert.equal(calls(), 0);

	mock.timers.tick(599);
	assert.equal(calls(), 0);
	mock.timers.tick(1);
	assert.equal(calls(), 1);

	mock.timers.tick(10_000);
	assert.equal(calls(), 1);
});

test("um fluxo contínuo dispara no teto de espera, não adia para sempre", (t) => {
	t.after(() => mock.timers.reset());
	const { coalescer, calls } = setup();

	// Um evento a cada 80ms (o ritmo observado no incidente) durante 10s.
	for (let elapsed = 0; elapsed < 10_000; elapsed += 80) {
		coalescer.schedule();
		mock.timers.tick(80);
	}
	// Teto de 3s: ~3 chamadas durante o fluxo, contra 125 eventos.
	assert.equal(calls(), 3);

	mock.timers.tick(600);
	assert.equal(calls(), 4);
});

test("eventos isolados ainda chegam, cada um depois da espera", (t) => {
	t.after(() => mock.timers.reset());
	const { coalescer, calls } = setup();

	coalescer.schedule();
	mock.timers.tick(600);
	assert.equal(calls(), 1);

	mock.timers.tick(5_000);
	coalescer.schedule();
	mock.timers.tick(600);
	assert.equal(calls(), 2);
});

test("cancel descarta o pendente sem chamar", (t) => {
	t.after(() => mock.timers.reset());
	const { coalescer, calls } = setup();

	coalescer.schedule();
	coalescer.cancel();
	mock.timers.tick(10_000);
	assert.equal(calls(), 0);
});
