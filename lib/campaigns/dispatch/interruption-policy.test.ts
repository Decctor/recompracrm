import assert from "node:assert/strict";
import test from "node:test";
import { classifyWhatsappSendErrorCode, findInterruptingWhatsappError, getCampaignDispatchInterruptionMessage } from "./interruption-policy";

test("pagamento pendente bloqueia o número", () => {
	assert.deepEqual(classifyWhatsappSendErrorCode(131042), { escopo: "NUMERO", motivo: "PAGAMENTO_PENDENTE" });
});

test("conta restrita, número indisponível e credencial bloqueiam o número", () => {
	assert.equal(classifyWhatsappSendErrorCode(368)?.motivo, "CONTA_RESTRITA");
	assert.equal(classifyWhatsappSendErrorCode(131031)?.motivo, "CONTA_RESTRITA");
	assert.equal(classifyWhatsappSendErrorCode(133010)?.motivo, "NUMERO_INDISPONIVEL");
	assert.equal(classifyWhatsappSendErrorCode(190)?.motivo, "CREDENCIAL_INVALIDA");
	assert.equal(classifyWhatsappSendErrorCode(250)?.motivo, "CREDENCIAL_INVALIDA");
	assert.equal(classifyWhatsappSendErrorCode(0)?.escopo, "NUMERO");
});

test("estados do template na Meta interrompem pelo template", () => {
	for (const code of [132001, 132007, 132015, 132016]) {
		assert.deepEqual(classifyWhatsappSendErrorCode(code), { escopo: "TEMPLATE", motivo: "TEMPLATE_INDISPONIVEL" });
	}
});

test("erros de parâmetro do template dependem do cliente e não interrompem", () => {
	for (const code of [132000, 132005, 132012]) assert.equal(classifyWhatsappSendErrorCode(code), null);
});

test("limites de spam e de velocidade interrompem só o disparo", () => {
	assert.deepEqual(classifyWhatsappSendErrorCode(131048), { escopo: "DISPARO", motivo: "LIMITE_SPAM" });
	assert.deepEqual(classifyWhatsappSendErrorCode(130429), { escopo: "DISPARO", motivo: "LIMITE_ENVIO" });
	assert.equal(classifyWhatsappSendErrorCode(80007)?.motivo, "LIMITE_ENVIO");
});

test("erros do destinatário e desconhecidos nunca interrompem", () => {
	for (const code of [131026, 131049, 130472, 131050, 131047, 131056, 131000, 1, 2, 100]) {
		assert.equal(classifyWhatsappSendErrorCode(code), null, `código ${code}`);
	}
	assert.equal(classifyWhatsappSendErrorCode(null), null);
	assert.equal(classifyWhatsappSendErrorCode(undefined), null);
});

test("acha o primeiro erro que interrompe numa lista mista", () => {
	const match = findInterruptingWhatsappError([{ code: 131026 }, { code: 131042, title: "Business eligibility payment issue" }, { code: 131048 }]);
	assert.equal(match?.error.code, 131042);
	assert.equal(match?.rule.motivo, "PAGAMENTO_PENDENTE");
	assert.equal(findInterruptingWhatsappError([{ code: 131026 }]), null);
	assert.equal(findInterruptingWhatsappError(undefined), null);
});

test("mensagem curta inclui o código quando houver", () => {
	assert.equal(
		getCampaignDispatchInterruptionMessage({ motivo: "PAGAMENTO_PENDENTE", codigo: 131042 }),
		"Envio interrompido: Pendência de pagamento no WhatsApp Business (código 131042).",
	);
	assert.equal(
		getCampaignDispatchInterruptionMessage({ motivo: "TEMPLATE_INDISPONIVEL", codigo: null }),
		"Envio interrompido: Template indisponível para envio.",
	);
});
