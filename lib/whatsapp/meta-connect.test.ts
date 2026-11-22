import assert from "node:assert/strict";
import test from "node:test";

import {
	buildWhatsappConnectReturnPath,
	classifyMetaCallbackError,
	planWhatsappConnectionUpsert,
	readWhatsappConnectReturn,
	stripWhatsappConnectParams,
} from "./meta-connect";

const params = (query: string) => new URLSearchParams(query);

test("cancelar na Meta é 'cancelado', não uma falha nossa", () => {
	assert.equal(classifyMetaCallbackError(params("error=access_denied&error_reason=user_denied")), "cancelado");
	assert.equal(classifyMetaCallbackError(params("error_reason=user_denied")), "cancelado");
	assert.equal(classifyMetaCallbackError(params("error=server_error")), "meta");
	assert.equal(classifyMetaCallbackError(params("code=abc&state=x")), null);
});

test("a volta preserva a query da tela e troca o resultado anterior", () => {
	assert.equal(
		buildWhatsappConnectReturnPath("/dashboard/settings?view=meta-oauth", { sucesso: "conectado", numeros: 2 }),
		"/dashboard/settings?view=meta-oauth&whatsapp=conectado&whatsappNumeros=2",
	);
	assert.equal(buildWhatsappConnectReturnPath("/onboarding?whatsappErro=meta", { erro: "cancelado" }), "/onboarding?whatsappErro=cancelado");
});

test("leitura da volta: código desconhecido vira a mensagem genérica", () => {
	const ok = readWhatsappConnectReturn(params("whatsapp=reconectado&whatsappNumeros=1"));
	assert.equal(ok.sucesso, "reconectado");
	assert.equal(ok.numeros, 1);
	assert.equal(ok.erro, null);
	const unknown = readWhatsappConnectReturn(params("whatsappErro=xyz"));
	assert.equal(unknown.codigoErro, "1");
	assert.match(unknown.erro ?? "", /Não foi possível conectar/);
	assert.equal(stripWhatsappConnectParams("view=meta-oauth&whatsapp=conectado&whatsappNumeros=1"), "?view=meta-oauth");
	assert.equal(stripWhatsappConnectParams("whatsappErro=cancelado"), "");
});

test("reconectar renova a conexão que já tem os números; números novos entram nela", () => {
	const plan = planWhatsappConnectionUpsert({
		existing: [
			{ conexaoId: "c1", telefoneId: "t1", whatsappTelefoneId: "111" },
			{ conexaoId: "c2", telefoneId: "t2", whatsappTelefoneId: "222" },
			{ conexaoId: "c2", telefoneId: "t3", whatsappTelefoneId: "333" },
		],
		incoming: [{ whatsappTelefoneId: "222" }, { whatsappTelefoneId: "333" }, { whatsappTelefoneId: "444" }],
	});
	assert.equal(plan.conexaoId, "c2");
	assert.deepEqual(
		plan.atualizar.map((item) => item.telefoneId),
		["t2", "t3"],
	);
	assert.deepEqual(plan.inserir, [{ whatsappTelefoneId: "444" }]);
});

test("primeira conexão: nada a reaproveitar", () => {
	const plan = planWhatsappConnectionUpsert({ existing: [], incoming: [{ whatsappTelefoneId: "111" }] });
	assert.equal(plan.conexaoId, null);
	assert.equal(plan.atualizar.length, 0);
	assert.equal(plan.inserir.length, 1);
});
