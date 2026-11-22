import assert from "node:assert/strict";
import test from "node:test";

import { resolveMetaPhoneAccess, resolvePhoneNumberState, resolveWhatsappNumberState } from "./meta-access";

const NOW = new Date("2026-11-22T12:00:00Z");
const PAST = new Date("2026-09-01T00:00:00Z");
const FUTURE = new Date("2027-01-01T00:00:00Z");

const healthy = (verificadoEm: string) => ({ status: "SAUDAVEL" as const, verificadoEm });
const failing = { status: "FALHA" as const, verificadoEm: NOW.toISOString(), motivo: "TOKEN_INVALIDO", mensagem: "Token invalidado." };

test("data futura e sem checagem: conectado", () => {
	assert.equal(resolveMetaPhoneAccess({ dataExpiracao: FUTURE, saude: null, now: NOW }), "CONECTADO");
	assert.equal(resolveMetaPhoneAccess({ dataExpiracao: null, saude: undefined, now: NOW }), "CONECTADO");
});

test("data vencida, mas checagem saudável depois dela: conectado (a data era estimativa)", () => {
	assert.equal(resolveMetaPhoneAccess({ dataExpiracao: PAST, saude: healthy("2026-11-22T06:00:00Z"), now: NOW }), "CONECTADO");
});

test("data vencida sem checagem, ou com checagem anterior à data: expirado", () => {
	assert.equal(resolveMetaPhoneAccess({ dataExpiracao: PAST, saude: null, now: NOW }), "EXPIRADO");
	assert.equal(resolveMetaPhoneAccess({ dataExpiracao: PAST, saude: healthy("2026-08-20T00:00:00Z"), now: NOW }), "EXPIRADO");
	assert.equal(resolveMetaPhoneAccess({ dataExpiracao: PAST, saude: healthy("não é data"), now: NOW }), "EXPIRADO");
});

test("checagem em falha vence a data, mesmo futura", () => {
	assert.equal(resolveMetaPhoneAccess({ dataExpiracao: FUTURE, saude: failing, now: NOW }), "SEM_ACESSO");
});

test("gateway interno segue o status da sessão, sem token", () => {
	const gateway = { tipoConexao: "INTERNAL_GATEWAY" as const, dataExpiracao: PAST, gatewayStatus: "connected" };
	assert.equal(resolvePhoneNumberState({ connection: gateway, phone: {}, now: NOW }), "CONECTADO");
	assert.equal(resolvePhoneNumberState({ connection: { ...gateway, gatewayStatus: "disconnected" }, phone: {}, now: NOW }), "DESCONECTADO");
});

test("estado do canal: um número utilizável basta; sem números, nenhum", () => {
	const meta = { tipoConexao: "META_CLOUD_API" as const, dataExpiracao: PAST, gatewayStatus: null };
	assert.equal(resolveWhatsappNumberState({ connections: [], now: NOW }), "NENHUM");
	assert.equal(resolveWhatsappNumberState({ connections: [{ ...meta, telefones: [] }], now: NOW }), "NENHUM");
	assert.equal(
		resolveWhatsappNumberState({
			connections: [{ ...meta, telefones: [{ metadados: { saude: failing } }, { metadados: { saude: healthy(NOW.toISOString()) } }] }],
			now: NOW,
		}),
		"CONECTADO",
	);
	assert.equal(
		resolveWhatsappNumberState({ connections: [{ ...meta, telefones: [{ metadados: null }, { metadados: { saude: failing } }] }], now: NOW }),
		"EXPIRADO",
	);
	assert.equal(
		resolveWhatsappNumberState({ connections: [{ ...meta, dataExpiracao: FUTURE, telefones: [{ metadados: { saude: failing } }] }], now: NOW }),
		"DESCONECTADO",
	);
});
