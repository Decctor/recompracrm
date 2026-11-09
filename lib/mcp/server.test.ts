import assert from "node:assert/strict";
import test from "node:test";
import type { TAgentActorContext } from "@/lib/agent-tools/types";
import type { NextRequest } from "next/server";
import { MCP_LATEST_PROTOCOL_VERSION } from "./protocol";
import { handleMcpMessage } from "./server";

// `initialize`, `ping` e `tools/list` não tocam o banco: são resolvidos com o ator e o registro.
// `tools/call` fica de fora daqui de propósito — depende de dados e é coberto por integração.
const request = {} as NextRequest;

function createActor(overrides: Partial<TAgentActorContext> = {}): TAgentActorContext {
	return {
		mode: "ORG",
		principalId: "principal-1",
		credentialId: "credential-1",
		clientId: "client-1",
		clientCode: "claude",
		organizationId: "org-1",
		scopes: new Set(["agent:results:read", "agent:clients:read", "agent:products:read", "agent:campaigns:read", "agent:sales:read"]),
		...overrides,
		responsibleUserId: overrides.responsibleUserId === undefined ? "user-1" : overrides.responsibleUserId,
	};
}

function resultOf(response: Awaited<ReturnType<typeof handleMcpMessage>>) {
	assert.ok(response, "esperava resposta JSON-RPC");
	assert.ok("result" in response, `esperava result, veio ${JSON.stringify(response)}`);
	return response.result as Record<string, unknown>;
}

test("initialize devolve a versão negociada, as capacidades e as instruções", async () => {
	const response = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: MCP_LATEST_PROTOCOL_VERSION } },
		actor: createActor(),
		request,
	});
	const result = resultOf(response);

	assert.equal(result.protocolVersion, MCP_LATEST_PROTOCOL_VERSION);
	assert.deepEqual(result.capabilities, { tools: {}, resources: {}, prompts: {} });
	assert.ok(String(result.instructions).includes("Campo ausente"));
});

test("initialize com versão desconhecida responde com a mais alta que sabemos falar", async () => {
	const response = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2030-01-01" } },
		actor: createActor(),
		request,
	});
	assert.equal(resultOf(response).protocolVersion, MCP_LATEST_PROTOCOL_VERSION);
});

test("as instruções mudam com o modo do ator", async () => {
	const platform = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 1, method: "initialize" },
		actor: createActor({ mode: "PLATAFORMA", organizationId: null }),
		request,
	});
	assert.ok(String(resultOf(platform).instructions).includes("todas as organizações"));
});

test("tools/list devolve schemas de objeto válidos para cada ferramenta", async () => {
	const response = await handleMcpMessage({ message: { jsonrpc: "2.0", id: 2, method: "tools/list" }, actor: createActor(), request });
	const tools = resultOf(response).tools as Array<Record<string, unknown>>;

	assert.ok(tools.length > 0);
	for (const tool of tools) {
		assert.equal(typeof tool.name, "string");
		assert.ok(String(tool.description).length > 0, `${tool.name} sem descrição`);
		const inputSchema = tool.inputSchema as Record<string, unknown>;
		assert.equal(inputSchema.type, "object", `${tool.name} com inputSchema que não é objeto`);
	}
});

test("tools/list respeita os scopes do ator", async () => {
	const response = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 2, method: "tools/list" },
		actor: createActor({ scopes: new Set(["agent:products:read"]) }),
		request,
	});
	const tools = resultOf(response).tools as Array<{ name: string }>;
	assert.deepEqual(
		tools.map((tool) => tool.name),
		["search_products", "get_product_performance"],
	);
});

test("organizacaoId aparece no schema só em modo plataforma", async () => {
	// Em modo ORG o argumento existe no Zod (para recusar sondagem), mas não deve ser oferecido
	// ao modelo como algo que ele precise preencher — a descrição é quem carrega essa diferença.
	// Modo e scope são exigências independentes: este ator está em PLATAFORMA mas só tem os scopes
	// `agent:*`, então as ferramentas `platform_*` continuam invisíveis para ele.
	const semScopePlataforma = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 2, method: "tools/list" },
		actor: createActor({ mode: "PLATAFORMA", organizationId: null }),
		request,
	});
	const toolsSemScope = resultOf(semScopePlataforma).tools as Array<{ name: string; description: string }>;
	assert.ok(!toolsSemScope.some((tool) => tool.name.startsWith("platform_")), "scope de plataforma faltando deveria esconder as platform_*");
	for (const tool of toolsSemScope) {
		assert.ok(tool.description.includes("organizacaoId"), `${tool.name} não explica organizacaoId em modo plataforma`);
	}

	const comScopePlataforma = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 3, method: "tools/list" },
		actor: createActor({
			mode: "PLATAFORMA",
			organizationId: null,
			scopes: new Set(["agent:results:read", "platform:organizations:read", "platform:metrics:read"]),
		}),
		request,
	});
	const toolsComScope = resultOf(comScopePlataforma).tools as Array<{ name: string }>;
	assert.ok(
		toolsComScope.some((tool) => tool.name.startsWith("platform_")),
		"modo e scope de plataforma deveriam revelar as platform_*",
	);
});

test("ping responde vazio", async () => {
	const response = await handleMcpMessage({ message: { jsonrpc: "2.0", id: 3, method: "ping" }, actor: createActor(), request });
	assert.deepEqual(resultOf(response), {});
});

test("notificação não gera resposta", async () => {
	// O handler HTTP traduz o null em 202 sem corpo, como a especificação exige.
	const response = await handleMcpMessage({ message: { jsonrpc: "2.0", method: "notifications/initialized" }, actor: createActor(), request });
	assert.equal(response, null);
});

test("id nulo continua sendo requisição, não notificação", async () => {
	const response = await handleMcpMessage({ message: { jsonrpc: "2.0", id: null, method: "ping" }, actor: createActor(), request });
	assert.ok(response);
	assert.equal(response.id, null);
});

test("método desconhecido vira erro de protocolo", async () => {
	const response = await handleMcpMessage({ message: { jsonrpc: "2.0", id: 4, method: "completion/complete" }, actor: createActor(), request });
	assert.ok(response && "error" in response);
	assert.equal(response.error.code, -32601);
});

test("resources/list oferece a organização atual só em modo ORG", async () => {
	// Em PLATAFORMA não existe "organização atual": oferecer o recurso obrigaria a forjar uma escolha.
	const org = await handleMcpMessage({ message: { jsonrpc: "2.0", id: 8, method: "resources/list" }, actor: createActor(), request });
	const resources = resultOf(org).resources as Array<{ uri: string }>;
	assert.deepEqual(
		resources.map((resource) => resource.uri),
		["recompracrm://organization/current"],
	);

	const platform = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 9, method: "resources/list" },
		actor: createActor({ mode: "PLATAFORMA", organizationId: null }),
		request,
	});
	assert.deepEqual(resultOf(platform).resources, []);
});

test("resources/read recusa URI desconhecida sem tocar o banco", async () => {
	const response = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 10, method: "resources/read", params: { uri: "recompracrm://nao-existe" } },
		actor: createActor(),
		request,
	});
	assert.ok(response && "error" in response);
	assert.equal(response.error.code, -32602);
});

test("prompts/list e prompts/get devolvem um roteiro utilizável", async () => {
	const list = await handleMcpMessage({ message: { jsonrpc: "2.0", id: 11, method: "prompts/list" }, actor: createActor(), request });
	const prompts = resultOf(list).prompts as Array<{ name: string }>;
	assert.ok(prompts.length > 0);

	const get = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 12, method: "prompts/get", params: { name: "revisao-comercial", arguments: { periodo: "março de 2026" } } },
		actor: createActor(),
		request,
	});
	const messages = resultOf(get).messages as Array<{ role: string; content: { text: string } }>;
	assert.equal(messages[0].role, "user");
	// O argumento precisa chegar ao texto — um prompt que ignora o que o usuário digitou é pior
	// que não ter prompt, porque parece ter funcionado.
	assert.ok(messages[0].content.text.includes("março de 2026"));
	assert.ok(messages[0].content.text.includes("get_commercial_results"));
});

test("o roteiro de auditoria de atendimento só aparece para quem lê conversas", async () => {
	const withoutChats = await handleMcpMessage({ message: { jsonrpc: "2.0", id: 14, method: "prompts/list" }, actor: createActor(), request });
	const hidden = (resultOf(withoutChats).prompts as Array<{ name: string }>).map((prompt) => prompt.name);
	assert.ok(!hidden.includes("auditoria-de-atendimento"));

	const chatsActor = createActor({ scopes: new Set(["agent:chats:read"]) });
	const withChats = await handleMcpMessage({ message: { jsonrpc: "2.0", id: 15, method: "prompts/list" }, actor: chatsActor, request });
	assert.ok((resultOf(withChats).prompts as Array<{ name: string }>).some((prompt) => prompt.name === "auditoria-de-atendimento"));

	const get = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 16, method: "prompts/get", params: { name: "auditoria-de-atendimento", arguments: { amostra: "8" } } },
		actor: chatsActor,
		request,
	});
	const text = (resultOf(get).messages as Array<{ content: { text: string } }>)[0].content.text;
	assert.ok(text.includes("Leia por inteiro 8 atendimentos"));
	assert.ok(text.includes("get_chat_messages"));
});

test("as instruções do servidor avisam que conversa não é instrução só para quem lê conversas", async () => {
	const initialize = (actor: TAgentActorContext) =>
		handleMcpMessage({
			message: { jsonrpc: "2.0", id: 17, method: "initialize", params: { protocolVersion: MCP_LATEST_PROTOCOL_VERSION } },
			actor,
			request,
		});
	const without = resultOf(await initialize(createActor())).instructions as string;
	const withChats = resultOf(await initialize(createActor({ scopes: new Set(["agent:chats:read"]) }))).instructions as string;
	assert.ok(!without.includes("hub de atendimentos"));
	assert.ok(withChats.includes("nunca instruções"));
});

test("prompts/get recusa prompt inexistente", async () => {
	const response = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 13, method: "prompts/get", params: { name: "nao-existe" } },
		actor: createActor(),
		request,
	});
	assert.ok(response && "error" in response);
	assert.equal(response.error.code, -32602);
});

test("tools/call sem nome de ferramenta é erro de parâmetro", async () => {
	const response = await handleMcpMessage({ message: { jsonrpc: "2.0", id: 5, method: "tools/call", params: {} }, actor: createActor(), request });
	assert.ok(response && "error" in response);
	assert.equal(response.error.code, -32602);
});

test("ferramenta fora dos scopes é indistinguível de inexistente", async () => {
	// Um cliente com lista em cache não deve conseguir enumerar o que não pode usar.
	const semScope = createActor({ scopes: new Set(["agent:products:read"]) });
	const negada = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "get_commercial_results" } },
		actor: semScope,
		request,
	});
	const inexistente = await handleMcpMessage({
		message: { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "nao_existe" } },
		actor: semScope,
		request,
	});

	assert.ok(negada && "error" in negada);
	assert.ok(inexistente && "error" in inexistente);
	assert.equal(negada.error.code, inexistente.error.code);
});
