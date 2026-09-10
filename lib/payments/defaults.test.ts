import assert from "node:assert/strict";
import { test } from "node:test";
import { getOrganizationPaymentMethodDefault } from "./defaults";

const BASE_DATE = "2026-09-10";

test("sem modalidade, o default de efetivação é o do método", () => {
	const resolved = getOrganizationPaymentMethodDefault({ metodo: "DINHEIRO", baseDate: BASE_DATE });
	assert.equal(resolved.efetivacaoTipo, "IMEDIATA");
	assert.equal(resolved.dataPrevisao, "2026-09-10");
});

test("modalidade presencial/retirada mantém o default do método", () => {
	for (const entregaModalidade of ["PRESENCIAL", "RETIRADA", "COMANDA"] as const) {
		const resolved = getOrganizationPaymentMethodDefault({ metodo: "PIX", baseDate: BASE_DATE, entregaModalidade });
		assert.equal(resolved.efetivacaoTipo, "IMEDIATA", `esperava IMEDIATA em ${entregaModalidade}`);
	}
});

test("entrega força o default para PENDENTE nos métodos imediatos, com previsão para hoje", () => {
	for (const metodo of ["DINHEIRO", "PIX", "CARTAO_DEBITO", "CARTAO_CREDITO"] as const) {
		const resolved = getOrganizationPaymentMethodDefault({ metodo, baseDate: BASE_DATE, entregaModalidade: "ENTREGA" });
		assert.equal(resolved.efetivacaoTipo, "PENDENTE", `esperava PENDENTE para ${metodo}`);
		assert.equal(resolved.dataPrevisao, "2026-09-10");
	}
});

test("entrega não altera métodos já pendentes por padrão nem o delay deles", () => {
	const boleto = getOrganizationPaymentMethodDefault({ metodo: "BOLETO", baseDate: BASE_DATE, entregaModalidade: "ENTREGA" });
	assert.equal(boleto.efetivacaoTipo, "PENDENTE");
	assert.equal(boleto.dataPrevisao, "2026-09-13");

	const fiado = getOrganizationPaymentMethodDefault({ metodo: "FIADO_NOTA", baseDate: BASE_DATE, entregaModalidade: "ENTREGA" });
	assert.equal(fiado.efetivacaoTipo, "PENDENTE");
	assert.equal(fiado.dataPrevisao, "2026-10-10");
});
