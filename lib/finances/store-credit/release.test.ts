import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeInitialStoreCreditLimit } from "./release";

describe("computeInitialStoreCreditLimit", () => {
	it("usa o maior entre o saldo em aberto e o maior fiado, arredondado para cima de 10 em 10", () => {
		assert.equal(computeInitialStoreCreditLimit({ saldoAberto: 123.4, maiorFiado: 80 }), 130);
		assert.equal(computeInitialStoreCreditLimit({ saldoAberto: 0, maiorFiado: 251 }), 260);
		assert.equal(computeInitialStoreCreditLimit({ saldoAberto: 300, maiorFiado: 300 }), 300);
	});

	it("quem quitou tudo não fica com limite zero", () => {
		assert.equal(computeInitialStoreCreditLimit({ saldoAberto: 0, maiorFiado: 45 }), 50);
	});
});
