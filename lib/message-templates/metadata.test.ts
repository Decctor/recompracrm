import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TMessageTemplateMetadata } from "@/schemas/message-templates";
import { isMessageTemplateSendableFromPhone, resolveMessageTemplateStatusForPhone } from "./metadata";

function buildMetadata(entries: Record<string, { status: string; qualidade: string }>): TMessageTemplateMetadata {
	return {
		porNumeroTelefone: Object.fromEntries(
			Object.entries(entries).map(([phoneId, entry]) => [phoneId, { idExterno: `ext-${phoneId}`, ...entry }]),
		),
	} as TMessageTemplateMetadata;
}

describe("resolveMessageTemplateStatusForPhone", () => {
	it("retorna o status do remetente escolhido, e não o pior status entre os números", () => {
		// Este é o caso que motivou o helper: aprovado no número que a campanha vai usar,
		// rejeitado em outro. `statusGeral` diria REJEITADO.
		const metadata = buildMetadata({
			"phone-centro": { status: "APROVADO", qualidade: "ALTA" },
			"phone-shopping": { status: "REJEITADO", qualidade: "BAIXA" },
		});

		const resolution = resolveMessageTemplateStatusForPhone({ metadata, phoneId: "phone-centro" });

		assert.deepEqual(resolution, { escopo: "TELEFONE", status: "APROVADO", qualidade: "ALTA" });
	});

	it("distingue 'não registrado neste número' de um status ruim", () => {
		const metadata = buildMetadata({ "phone-centro": { status: "APROVADO", qualidade: "ALTA" } });

		const resolution = resolveMessageTemplateStatusForPhone({ metadata, phoneId: "phone-shopping" });

		assert.deepEqual(resolution, { escopo: "NAO_REGISTRADO" });
	});

	it("cai no pior status quando não há remetente escolhido", () => {
		const metadata = buildMetadata({
			"phone-centro": { status: "APROVADO", qualidade: "ALTA" },
			"phone-shopping": { status: "PENDENTE", qualidade: "PENDENTE" },
		});

		const resolution = resolveMessageTemplateStatusForPhone({ metadata, phoneId: null });

		assert.deepEqual(resolution, { escopo: "GERAL", status: "PENDENTE" });
	});

	it("trata template sem nenhum número registrado como rascunho", () => {
		const resolution = resolveMessageTemplateStatusForPhone({ metadata: buildMetadata({}), phoneId: null });

		assert.deepEqual(resolution, { escopo: "GERAL", status: "RASCUNHO" });
	});
});

describe("isMessageTemplateSendableFromPhone", () => {
	it("só considera enviável quando aprovado naquele remetente", () => {
		const metadata = buildMetadata({
			"phone-centro": { status: "APROVADO", qualidade: "ALTA" },
			"phone-shopping": { status: "PENDENTE", qualidade: "PENDENTE" },
		});

		assert.equal(isMessageTemplateSendableFromPhone({ metadata, phoneId: "phone-centro" }), true);
		assert.equal(isMessageTemplateSendableFromPhone({ metadata, phoneId: "phone-shopping" }), false);
		assert.equal(isMessageTemplateSendableFromPhone({ metadata, phoneId: "phone-inexistente" }), false);
	});
});
