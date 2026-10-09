import assert from "node:assert/strict";
import test from "node:test";
import { AiAgentCapabilitiesSchema, AiAgentScopeSchema, isClientExplicitlyIncludedInAgentScope, isClientInAgentScope } from "./ai-agents";

test("capacidades antigas recebem os defaults comerciais", () => {
	const capabilities = AiAgentCapabilitiesSchema.parse({ ferramentas: {} });
	assert.deepEqual(capabilities.comercial, {
		precos: { visiveis: true },
		orcamentos: { bloqueio: "TRANSFERIR" },
		estoque: { visibilidade: "OCULTO", excedente: "PERMITIR" },
	});
	assert.equal(capabilities.ferramentas["orcamentos.criar"], undefined);
});

test("os defaults de estoque são válidos por si", () => {
	// `parseJsonbWithFallback` cai em `schema.parse(undefined)` quando o JSONB persistido não casa.
	// Se os próprios defaults violassem o superRefine, esse fallback lançaria em vez de salvar a
	// execução — que é justamente o que ele existe para evitar.
	assert.doesNotThrow(() => AiAgentCapabilitiesSchema.parse(undefined));
	assert.doesNotThrow(() => AiAgentCapabilitiesSchema.parse({ comercial: { estoque: {} } }));
});

test("avisar sobre estoque exige disponibilidade visível", () => {
	const result = AiAgentCapabilitiesSchema.safeParse({
		comercial: { estoque: { visibilidade: "OCULTO", excedente: "AVISAR" } },
	});
	assert.equal(result.success, false);
});

test("bloquear e permitir funcionam com estoque oculto", () => {
	for (const excedente of ["BLOQUEAR", "PERMITIR"]) {
		const result = AiAgentCapabilitiesSchema.safeParse({
			comercial: { estoque: { visibilidade: "OCULTO", excedente } },
		});
		assert.equal(result.success, true, excedente);
	}
});

test("avisar é aceito quando a disponibilidade está visível", () => {
	for (const visibilidade of ["DISPONIBILIDADE", "QUANTIDADE"]) {
		const result = AiAgentCapabilitiesSchema.safeParse({
			comercial: { estoque: { visibilidade, excedente: "AVISAR" } },
		});
		assert.equal(result.success, true, visibilidade);
	}
});

test("orçamento não pode ser habilitado com preços ocultos", () => {
	const result = AiAgentCapabilitiesSchema.safeParse({
		ferramentas: {
			"orcamentos.criar": { habilitada: true },
			"atendimento.transferir_para_humano": { habilitada: true },
		},
		comercial: { precos: { visiveis: false } },
	});
	assert.equal(result.success, false);
});

test("política de transferência exige a ferramenta correspondente", () => {
	const result = AiAgentCapabilitiesSchema.safeParse({
		ferramentas: { "orcamentos.criar": { habilitada: true } },
		comercial: {
			precos: { visiveis: true },
			orcamentos: { bloqueio: "TRANSFERIR" },
		},
	});
	assert.equal(result.success, false);
});

test("política de informar permite orçamento sem transferência", () => {
	const result = AiAgentCapabilitiesSchema.safeParse({
		ferramentas: { "orcamentos.criar": { habilitada: true } },
		comercial: {
			precos: { visiveis: true },
			orcamentos: { bloqueio: "INFORMAR" },
		},
	});
	assert.equal(result.success, true);
});

// ============================================================================
// ESCOPO DE CLIENTES
// ============================================================================

test("o escopo default atende todo mundo", () => {
	// Preserva o comportamento anterior à coluna: organização que nunca tocou na config
	// continua com o agente atendendo todos os clientes.
	const scope = AiAgentScopeSchema.parse(undefined);
	assert.deepEqual(scope, { tipo: "TODOS", clienteIds: [] });
	assert.equal(isClientInAgentScope(scope, "cliente-qualquer"), true);
});

test("escopo por cliente cobre os três modos", () => {
	// A assimetria da lista vazia é o ponto: INCLUIR vazio não atende ninguém (lista de
	// permissão ainda não preenchida), EXCLUIR vazio atende todo mundo.
	const cases = [
		{ tipo: "TODOS", clienteIds: [], clienteId: "a", esperado: true },
		{ tipo: "TODOS", clienteIds: ["a"], clienteId: "b", esperado: true },
		{ tipo: "INCLUIR", clienteIds: [], clienteId: "a", esperado: false },
		{ tipo: "INCLUIR", clienteIds: ["a"], clienteId: "a", esperado: true },
		{ tipo: "INCLUIR", clienteIds: ["a"], clienteId: "b", esperado: false },
		{ tipo: "EXCLUIR", clienteIds: [], clienteId: "a", esperado: true },
		{ tipo: "EXCLUIR", clienteIds: ["a"], clienteId: "a", esperado: false },
		{ tipo: "EXCLUIR", clienteIds: ["a"], clienteId: "b", esperado: true },
	] as const;

	for (const { tipo, clienteIds, clienteId, esperado } of cases) {
		const scope = AiAgentScopeSchema.parse({ tipo, clienteIds });
		assert.equal(isClientInAgentScope(scope, clienteId), esperado, `${tipo} [${clienteIds.join(",")}] x ${clienteId}`);
	}
});

test("escopo persistido antes da coluna recebe os defaults", () => {
	// Mesmo contrato de `capacidades`: JSONB parcial ou inválido não pode derrubar a execução.
	assert.deepEqual(AiAgentScopeSchema.parse({}), { tipo: "TODOS", clienteIds: [] });
	assert.deepEqual(AiAgentScopeSchema.parse({ tipo: "EXCLUIR" }), { tipo: "EXCLUIR", clienteIds: [] });
	assert.equal(AiAgentScopeSchema.safeParse({ tipo: "QUALQUER_COISA" }).success, false);
});

test("só a lista de inclusão nomeia um cliente explicitamente", () => {
	// É a exceção à regra do telefone da equipe: TODOS e EXCLUIR não nomeiam ninguém, então um
	// número da equipe continua barrado neles mesmo estando "no escopo".
	assert.equal(isClientExplicitlyIncludedInAgentScope(AiAgentScopeSchema.parse({ tipo: "INCLUIR", clienteIds: ["c1"] }), "c1"), true);
	assert.equal(isClientExplicitlyIncludedInAgentScope(AiAgentScopeSchema.parse({ tipo: "INCLUIR", clienteIds: ["c1"] }), "c2"), false);
	assert.equal(isClientExplicitlyIncludedInAgentScope(AiAgentScopeSchema.parse({ tipo: "TODOS" }), "c1"), false);
	assert.equal(isClientExplicitlyIncludedInAgentScope(AiAgentScopeSchema.parse({ tipo: "EXCLUIR", clienteIds: [] }), "c1"), false);
});
