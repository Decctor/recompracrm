import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	isMessageEchoEvent,
	isMessageEvent,
	isStatusUpdate,
	parseWebhookIncomingMessages,
	parseWebhookMessageEchoes,
	parseWebhookStatusUpdates,
} from "./parsing";

/** Payload mínimo da Cloud API com um change de `messages` por item passado. */
function buildMessagesPayload(...messageGroups: unknown[][]) {
	return {
		object: "whatsapp_business_account",
		entry: messageGroups.map((messages, index) => ({
			id: `waba-${index}`,
			changes: [
				{
					field: "messages",
					value: {
						messaging_product: "whatsapp",
						metadata: { display_phone_number: "5534999990000", phone_number_id: `phone-${index}` },
						contacts: [{ profile: { name: "Cliente Teste" }, wa_id: "5534999991111" }],
						messages,
					},
				},
			],
		})),
	};
}

function buildTextMessage(id: string, body: string) {
	return { id, from: "5534999991111", timestamp: "1755000000", type: "text", text: { body } };
}

describe("parseWebhookIncomingMessages", () => {
	it("varre todos os entries e mensagens do payload, não só o primeiro", () => {
		const payload = buildMessagesPayload(
			[buildTextMessage("wamid.1", "primeira"), buildTextMessage("wamid.2", "segunda")],
			[buildTextMessage("wamid.3", "terceira")],
		);

		const parsed = parseWebhookIncomingMessages(payload);
		assert.equal(parsed.length, 3);
		assert.deepEqual(
			parsed.map((message) => message.whatsappMessageId),
			["wamid.1", "wamid.2", "wamid.3"],
		);
		assert.equal(parsed[2].whatsappPhoneNumberId, "phone-1");
	});

	it("mapeia os tipos de mídia para o enum da aplicação", () => {
		const payload = buildMessagesPayload([
			{
				id: "wamid.img",
				from: "5534999991111",
				timestamp: "1755000000",
				type: "image",
				image: { id: "media-1", mime_type: "image/jpeg", caption: "foto" },
			},
			{ id: "wamid.aud", from: "5534999991111", timestamp: "1755000000", type: "audio", audio: { id: "media-2", mime_type: "audio/ogg" } },
			{
				id: "wamid.doc",
				from: "5534999991111",
				timestamp: "1755000000",
				type: "document",
				document: { id: "media-3", mime_type: "application/pdf", filename: "nota.pdf" },
			},
		]);

		const [image, audio, document] = parseWebhookIncomingMessages(payload);
		assert.equal(image.messageType, "IMAGEM");
		assert.equal(image.caption, "foto");
		assert.equal(audio.messageType, "AUDIO");
		assert.equal(document.messageType, "DOCUMENTO");
		assert.equal(document.filename, "nota.pdf");
	});

	it("trata figurinha como mídia própria, com mime padrão e flag de animação", () => {
		const payload = buildMessagesPayload([
			{ id: "wamid.sticker", from: "5534999991111", timestamp: "1755000000", type: "sticker", sticker: { id: "media-9", animated: true } },
		]);

		const [parsed] = parseWebhookIncomingMessages(payload);
		assert.equal(parsed.messageType, "FIGURINHA");
		assert.equal(parsed.mediaId, "media-9");
		assert.equal(parsed.mimeType, "image/webp");
		assert.equal(parsed.stickerAnimated, true);
		assert.equal(parsed.caption, undefined);
	});

	it("trata localização como tipo próprio, com coordenadas na estrutura e resumo no texto", () => {
		const payload = buildMessagesPayload([
			{
				id: "wamid.loc",
				from: "5534999991111",
				timestamp: "1755000000",
				type: "location",
				location: { latitude: -18.9186, longitude: -48.2772, name: "Mercado Central", address: "Av. Afonso Pena, 500" },
			},
			{ id: "wamid.loc-broken", from: "5534999991111", timestamp: "1755000001", type: "location", location: { latitude: "abc" } },
		]);

		const [location, broken] = parseWebhookIncomingMessages(payload);
		assert.equal(location.messageType, "LOCALIZACAO");
		assert.deepEqual(location.location, {
			latitude: -18.9186,
			longitude: -48.2772,
			name: "Mercado Central",
			address: "Av. Afonso Pena, 500",
			url: null,
		});
		assert.equal(location.textContent, "Mercado Central — Av. Afonso Pena, 500");
		// Coordenadas inválidas não têm o que plotar: degrada para texto.
		assert.equal(broken.messageType, "TEXTO");
		assert.match(broken.textContent ?? "", /coordenadas inválidas/);
	});

	it("transforma contatos compartilhados em texto legível com os vCards na estrutura", () => {
		const payload = buildMessagesPayload([
			{
				id: "wamid.contacts",
				from: "5534999991111",
				timestamp: "1755000000",
				type: "contacts",
				contacts: [
					{
						name: { formatted_name: "João da Silva" },
						org: { company: "Padaria Estrela" },
						phones: [{ phone: "+55 34 98888-0000", wa_id: "5534988880000", type: "CELL" }],
						emails: [{ email: "joao@estrela.com", type: "WORK" }],
					},
				],
			},
		]);

		const [parsed] = parseWebhookIncomingMessages(payload);
		assert.equal(parsed.messageType, "TEXTO");
		assert.equal(parsed.textContent, "Contato compartilhado:\nJoão da Silva · +55 34 98888-0000");
		assert.equal(parsed.contacts?.[0].org, "Padaria Estrela");
		assert.equal(parsed.contacts?.[0].phones[0].waId, "5534988880000");
		assert.equal(parsed.contacts?.[0].emails[0].email, "joao@estrela.com");
	});

	it("transforma resposta de botão de template em texto, com o payload preservado", () => {
		const payload = buildMessagesPayload([
			{ id: "wamid.btn", from: "5534999991111", timestamp: "1755000000", type: "button", button: { text: "Confirmar pedido", payload: "CONFIRMAR" } },
		]);

		const [parsed] = parseWebhookIncomingMessages(payload);
		assert.equal(parsed.kind, "message");
		assert.equal(parsed.messageType, "TEXTO");
		assert.equal(parsed.textContent, "Confirmar pedido");
		assert.deepEqual(parsed.button, { text: "Confirmar pedido", payload: "CONFIRMAR" });
	});

	it("classifica reação como kind próprio, apontando a mensagem-alvo", () => {
		const payload = buildMessagesPayload([
			{ id: "wamid.react", from: "5534999991111", timestamp: "1755000000", type: "reaction", reaction: { message_id: "wamid.target", emoji: "👍" } },
			{ id: "wamid.unreact", from: "5534999991111", timestamp: "1755000001", type: "reaction", reaction: { message_id: "wamid.target" } },
			{ id: "wamid.broken", from: "5534999991111", timestamp: "1755000002", type: "reaction", reaction: {} },
		]);

		const parsed = parseWebhookIncomingMessages(payload);
		// A reação sem message_id não tem onde anexar e é descartada.
		assert.equal(parsed.length, 2);
		assert.equal(parsed[0].kind, "reaction");
		assert.deepEqual(parsed[0].reaction, { targetWhatsappMessageId: "wamid.target", emoji: "👍" });
		assert.deepEqual(parsed[1].reaction, { targetWhatsappMessageId: "wamid.target", emoji: null });
	});

	it("classifica mensagem de sistema e tipo não suportado com os dados do erro", () => {
		const payload = buildMessagesPayload([
			{
				id: "wamid.sys",
				from: "5534999991111",
				timestamp: "1755000000",
				type: "system",
				system: { type: "user_changed_number", body: "trocou de número", wa_id: "5534988880000" },
			},
			{
				id: "wamid.unsup",
				from: "5534999991111",
				timestamp: "1755000001",
				type: "unsupported",
				errors: [{ code: 131051, title: "Message type unknown", error_data: { details: "Message type is currently not supported." } }],
			},
		]);

		const [system, unsupported] = parseWebhookIncomingMessages(payload);
		assert.equal(system.kind, "system");
		assert.deepEqual(system.system, { type: "user_changed_number", body: "trocou de número", newWaId: "5534988880000" });
		assert.equal(unsupported.kind, "unsupported");
		assert.deepEqual(unsupported.unsupported, { code: 131051, title: "Message type unknown", details: "Message type is currently not supported." });
	});

	it("descarta ecos sem conteúdo para espelhar (sistema, não suportado)", () => {
		const payload = {
			entry: [
				{
					changes: [
						{
							field: "smb_message_echoes",
							value: {
								metadata: { phone_number_id: "phone-echo" },
								message_echoes: [
									{
										id: "wamid.echo-system",
										from: "5534999990000",
										to: "5534999991111",
										timestamp: "1755000000",
										type: "system",
										system: { type: "user_changed_number", body: "trocou de número" },
									},
									{ id: "wamid.echo-unsupported", from: "5534999990000", to: "5534999991111", timestamp: "1755000000", type: "unsupported", errors: [] },
									{ id: "wamid.echo-text", from: "5534999990000", to: "5534999991111", timestamp: "1755000001", type: "text", text: { body: "segue o link" } },
								],
							},
						},
					],
				},
			],
		};

		const parsed = parseWebhookMessageEchoes(payload);
		assert.equal(parsed.length, 1);
		assert.equal(parsed[0].whatsappMessageId, "wamid.echo-text");
	});

	it("classifica edição como kind próprio, com a mensagem-alvo e o texto novo", () => {
		// Formato real recebido da Meta (2026-09-24).
		const payload = buildMessagesPayload([
			{
				id: "wamid.edit",
				from: "5534999991111",
				timestamp: "1755000000",
				type: "edit",
				edit: { original_message_id: "wamid.original", message: { type: "text", text: { body: "troco pra 50, por favor" } } },
			},
			{
				id: "wamid.edit-broken",
				from: "5534999991111",
				timestamp: "1755000001",
				type: "edit",
				edit: { message: { type: "text", text: { body: "sem alvo" } } },
			},
		]);

		const [edit, broken] = parseWebhookIncomingMessages(payload);
		assert.equal(edit.kind, "edit");
		assert.deepEqual(edit.edit, { originalWhatsappMessageId: "wamid.original", textContent: "troco pra 50, por favor" });
		// O texto também vai no textContent: se a original não estiver na base, a edição entra como mensagem.
		assert.equal(edit.textContent, "troco pra 50, por favor");
		// Sem alvo não há o que aplicar: cai no placeholder, como qualquer tipo sem tratamento.
		assert.equal(broken.kind, "message");
		assert.match(broken.textContent ?? "", /não suportado/);
	});

	it("aceita edição ecoada pelo app do celular", () => {
		const payload = {
			entry: [
				{
					changes: [
						{
							field: "smb_message_echoes",
							value: {
								metadata: { phone_number_id: "phone-echo" },
								message_echoes: [
									{
										id: "wamid.echo-edit",
										from: "5534999990000",
										to: "5534999991111",
										timestamp: "1755000000",
										type: "edit",
										edit: { original_message_id: "wamid.echo-original", message: { type: "text", text: { body: "Oque gostaria de pedir ?" } } },
									},
								],
							},
						},
					],
				},
			],
		};

		const [echo] = parseWebhookMessageEchoes(payload);
		assert.equal(echo.kind, "edit");
		assert.deepEqual(echo.edit, { originalWhatsappMessageId: "wamid.echo-original", textContent: "Oque gostaria de pedir ?" });
	});

	it("resposta a mensagem interativa (botão ou lista) vira texto com o rótulo e guarda o id", () => {
		const payload = buildMessagesPayload([
			{
				id: "wamid.btn",
				from: "5534999991111",
				timestamp: "1755000000",
				type: "interactive",
				interactive: { type: "button_reply", button_reply: { id: "opt-1", title: "Quero orçamento" } },
			},
			{
				id: "wamid.list",
				from: "5534999991111",
				timestamp: "1755000001",
				type: "interactive",
				interactive: { type: "list_reply", list_reply: { id: "plano-pro", title: "Plano Pro", description: "R$ 99/mês" } },
			},
		]);

		const [button, list] = parseWebhookIncomingMessages(payload);
		assert.equal(button.kind, "message");
		assert.equal(button.textContent, "Quero orçamento");
		assert.deepEqual(button.button, { text: "Quero orçamento", payload: "opt-1" });
		assert.equal(list.textContent, "Plano Pro\nR$ 99/mês");
		assert.deepEqual(list.button, { text: "Plano Pro", payload: "plano-pro" });
	});

	it("request_welcome entra como mensagem do cliente com texto honesto, não como placeholder", () => {
		const payload = buildMessagesPayload([{ id: "wamid.welcome", from: "5534999991111", timestamp: "1755000000", type: "request_welcome" }]);

		const [parsed] = parseWebhookIncomingMessages(payload);
		assert.equal(parsed.kind, "message");
		assert.equal(parsed.messageTypeRaw, "request_welcome");
		assert.doesNotMatch(parsed.textContent ?? "", /não suportado/);
	});

	it("reação ecoada pelo app do celular carrega a mensagem-alvo", () => {
		const payload = {
			entry: [
				{
					changes: [
						{
							field: "smb_message_echoes",
							value: {
								metadata: { phone_number_id: "phone-echo" },
								message_echoes: [
									{
										id: "wamid.echo-reaction",
										from: "5534999990000",
										to: "5534999991111",
										timestamp: "1755000000",
										type: "reaction",
										reaction: { message_id: "wamid.alvo", emoji: "🙏" },
									},
								],
							},
						},
					],
				},
			],
		};

		const [echo] = parseWebhookMessageEchoes(payload);
		assert.equal(echo.kind, "reaction");
		assert.deepEqual(echo.reaction, { targetWhatsappMessageId: "wamid.alvo", emoji: "🙏" });
	});

	it("persiste tipos desconhecidos como placeholder de texto em vez de descartar", () => {
		const payload = buildMessagesPayload([{ id: "wamid.order", from: "5534999991111", timestamp: "1755000000", type: "order", order: {} }]);

		const [parsed] = parseWebhookIncomingMessages(payload);
		assert.ok(parsed);
		assert.equal(parsed.messageType, "TEXTO");
		assert.equal(parsed.messageTypeRaw, "order");
		assert.match(parsed.textContent ?? "", /não suportado/);
	});

	it("captura o referral de anúncio Click-to-WhatsApp", () => {
		const payload = buildMessagesPayload([
			{
				...buildTextMessage("wamid.ctwa", "vim do anúncio"),
				referral: { source_url: "https://fb.me/ad", source_type: "ad", source_id: "123", headline: "Promoção", ctwa_clid: "clid-1" },
			},
		]);

		const [parsed] = parseWebhookIncomingMessages(payload);
		assert.equal(parsed.referral?.sourceUrl, "https://fb.me/ad");
		assert.equal(parsed.referral?.ctwaClid, "clid-1");
		assert.equal(parseWebhookIncomingMessages(buildMessagesPayload([buildTextMessage("wamid.plain", "oi")]))[0].referral, null);
	});
});

describe("parseWebhookStatusUpdates", () => {
	it("varre todos os recibos agrupados numa entrega só", () => {
		const payload = {
			entry: [
				{
					changes: [
						{
							field: "messages",
							value: {
								statuses: [
									{ id: "wamid.a", status: "sent", timestamp: "1755000000" },
									{ id: "wamid.b", status: "delivered", timestamp: "1755000001" },
								],
							},
						},
						{ field: "messages", value: { statuses: [{ id: "wamid.c", status: "read", timestamp: "1755000002" }] } },
					],
				},
			],
		};

		const parsed = parseWebhookStatusUpdates(payload);
		assert.deepEqual(
			parsed.map((status) => [status.whatsappMessageId, status.status]),
			[
				["wamid.a", "sent"],
				["wamid.b", "delivered"],
				["wamid.c", "read"],
			],
		);
		assert.equal(isStatusUpdate(payload), true);
	});

	it("extrai a mensagem de erro de um status de falha", () => {
		const payload = {
			entry: [
				{
					changes: [
						{
							field: "messages",
							value: {
								statuses: [
									{
										id: "wamid.fail",
										status: "failed",
										timestamp: "1755000000",
										errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "Janela expirada." } }],
									},
								],
							},
						},
					],
				},
			],
		};

		const [parsed] = parseWebhookStatusUpdates(payload);
		assert.equal(parsed.status, "failed");
		assert.match(parsed.errorMessage ?? "", /24 horas/);
		assert.equal(parsed.errors?.[0]?.code, 131047);
	});
});

describe("parseWebhookMessageEchoes", () => {
	it("varre todos os ecos e ignora changes de outros campos", () => {
		const payload = {
			entry: [
				{
					changes: [
						{ field: "messages", value: { messages: [buildTextMessage("wamid.msg", "entrada")] } },
						{
							field: "smb_message_echoes",
							value: {
								metadata: { phone_number_id: "phone-echo" },
								message_echoes: [
									{ id: "wamid.echo1", from: "5534999990000", to: "5534999991111", timestamp: "1755000000", type: "text", text: { body: "resposta 1" } },
									{ id: "wamid.echo2", from: "5534999990000", to: "5534999991111", timestamp: "1755000001", type: "text", text: { body: "resposta 2" } },
								],
							},
						},
					],
				},
			],
		};

		const parsed = parseWebhookMessageEchoes(payload);
		assert.equal(parsed.length, 2);
		assert.equal(parsed[0].whatsappPhoneNumberId, "phone-echo");
		assert.equal(parsed[1].textContent, "resposta 2");
		assert.equal(isMessageEchoEvent(payload), true);
		assert.equal(isMessageEvent(payload), true);
	});
});
