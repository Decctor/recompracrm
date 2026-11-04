import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TMessageTemplateContent } from "@/schemas/message-templates";
import { validateMessageTemplateForWhatsapp } from "../../validation";
import { extractWhatsappContentFromMetaWithLocalContext } from "./meta-status";
import type { TMetaTemplate } from "./types";

const PRESET_URL = "https://www.recompracrm.com.br/redirects?type=client-poi-profile&orgId=org-1&clientId={{1}}";

function buildMetaTemplate(buttons: NonNullable<TMetaTemplate["components"][number]["buttons"]>): TMetaTemplate {
	return {
		id: "meta-1",
		name: "tpl",
		status: "APPROVED",
		category: "MARKETING",
		language: "pt_BR",
		components: [
			{ type: "BODY", text: "Olá" },
			{ type: "BUTTONS", buttons },
		],
	} as TMetaTemplate;
}

function buildContent(botoes: TMessageTemplateContent["botoes"]): TMessageTemplateContent {
	return { assunto: "", preheader: "", cabecalho: null, corpo: { conteudo: "<p>Olá</p>", parametros: [] }, rodape: null, botoes };
}

describe("extractWhatsappContentFromMetaWithLocalContext — botões de preset", () => {
	it("mantém o URL_PRESET local quando a Meta devolve a URL dinâmica", () => {
		const { content } = extractWhatsappContentFromMetaWithLocalContext({
			metaTemplate: buildMetaTemplate([{ type: "URL", text: "Ver meus pontos", url: PRESET_URL, example: ["abc"] }]),
			currentContent: buildContent([{ tipo: "URL_PRESET", preset: "CLIENT_POI_PROFILE", texto: "Ver meus pontos", exemplo: "local" }]),
		});
		assert.deepEqual(content.botoes, [{ tipo: "URL_PRESET", preset: "CLIENT_POI_PROFILE", texto: "Ver meus pontos", exemplo: "local" }]);
	});

	it("recupera o preset de um botão já rebaixado a URL comum", () => {
		const { content } = extractWhatsappContentFromMetaWithLocalContext({
			metaTemplate: buildMetaTemplate([{ type: "URL", text: "Ver meus pontos", url: PRESET_URL }]),
			currentContent: buildContent([{ tipo: "URL", texto: "Ver meus pontos", url: PRESET_URL }]),
		});
		assert.deepEqual(content.botoes, [{ tipo: "URL_PRESET", preset: "CLIENT_POI_PROFILE", texto: "Ver meus pontos", exemplo: "cliente_exemplo_123" }]);
	});

	it("mantém URL fixa como URL", () => {
		const { content } = extractWhatsappContentFromMetaWithLocalContext({
			metaTemplate: buildMetaTemplate([{ type: "URL", text: "Cardápio", url: "https://loja.com/cardapio" }]),
			currentContent: null,
		});
		assert.deepEqual(content.botoes, [{ tipo: "URL", texto: "Cardápio", url: "https://loja.com/cardapio" }]);
	});

	it("não confunde URL dinâmica de outro destino com preset", () => {
		const url = "https://loja.com/pedido/{{1}}";
		const { content } = extractWhatsappContentFromMetaWithLocalContext({
			metaTemplate: buildMetaTemplate([{ type: "URL", text: "Pedido", url }]),
			currentContent: null,
		});
		assert.deepEqual(content.botoes, [{ tipo: "URL", texto: "Pedido", url }]);
	});
});

describe("validateMessageTemplateForWhatsapp — URL com variável", () => {
	it("recusa botão URL comum com {{1}}", () => {
		const result = validateMessageTemplateForWhatsapp(buildContent([{ tipo: "URL", texto: "Ver", url: PRESET_URL }]));
		assert.equal(result.valid, false);
		assert.ok(result.issues.some((issue) => issue.path === "conteudo.botoes.0.url"));
	});

	it("aceita botão URL fixo e URL_PRESET", () => {
		const result = validateMessageTemplateForWhatsapp(
			buildContent([
				{ tipo: "URL", texto: "Site", url: "https://loja.com" },
				{ tipo: "URL_PRESET", preset: "CLIENT_POI_PROFILE", texto: "Perfil", exemplo: "x" },
			]),
		);
		assert.equal(result.valid, true);
	});
});
