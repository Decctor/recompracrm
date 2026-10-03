import assert from "node:assert/strict";
import test from "node:test";
import { getIfoodBackoffMs, parseRetryAfterMs, shouldRetryIfoodRequest } from "./retry";

/**
 * A homologação do Catalog cobra duas coisas opostas na mesma regra: repetir a falha transitória e
 * NUNCA repetir o 4xx. Estes testes existem para que a segunda metade não se perca num refactor —
 * repetir um POST que o iFood recusou é o tipo de bug que só aparece como pedido duplicado.
 */

test("4xx que não é 429 nunca é repetido, em nenhum método", () => {
	for (const status of [400, 401, 403, 404, 409, 422]) {
		for (const method of ["get", "post", "put", "delete"]) {
			assert.equal(shouldRetryIfoodRequest({ status, method }), false, `${method.toUpperCase()} ${status} não deveria ser repetido`);
		}
	}
});

test("429 é repetido em qualquer método — foi recusado antes de ser processado", () => {
	for (const method of ["get", "post", "put", "patch", "delete"]) {
		assert.equal(shouldRetryIfoodRequest({ status: 429, method }), true);
	}
});

test("5xx só é repetido em método idempotente", () => {
	assert.equal(shouldRetryIfoodRequest({ status: 500, method: "get" }), true);
	assert.equal(shouldRetryIfoodRequest({ status: 503, method: "put" }), true);
	assert.equal(shouldRetryIfoodRequest({ status: 500, method: "post" }), false);
	assert.equal(shouldRetryIfoodRequest({ status: 502, method: "patch" }), false);
});

test("falha sem resposta (timeout/rede) segue a regra do 5xx", () => {
	assert.equal(shouldRetryIfoodRequest({ status: null, method: "get" }), true);
	assert.equal(shouldRetryIfoodRequest({ status: null, method: "post" }), false);
});

test("PATCH marcado como idempotente é repetido em timeout e 5xx, mas nunca em 4xx", () => {
	assert.equal(shouldRetryIfoodRequest({ status: null, method: "patch", idempotent: true }), true);
	assert.equal(shouldRetryIfoodRequest({ status: 503, method: "patch", idempotent: true }), true);
	assert.equal(shouldRetryIfoodRequest({ status: 400, method: "patch", idempotent: true }), false);
	assert.equal(shouldRetryIfoodRequest({ status: null, method: "patch", idempotent: false }), false);
});

test("cancelamento do caller não é retentativa", () => {
	assert.equal(shouldRetryIfoodRequest({ status: null, method: "get", code: "ERR_CANCELED" }), false);
	assert.equal(shouldRetryIfoodRequest({ status: 429, method: "get", code: "ERR_CANCELED" }), false);
});

test("Retry-After em segundos vira milissegundos", () => {
	assert.equal(parseRetryAfterMs("2"), 2000);
	assert.equal(parseRetryAfterMs(0), 0);
	assert.equal(parseRetryAfterMs("-5"), 0);
});

test("Retry-After inválido ou ausente devolve null, caindo no backoff", () => {
	assert.equal(parseRetryAfterMs(undefined), null);
	assert.equal(parseRetryAfterMs(""), null);
	assert.equal(parseRetryAfterMs("depois"), null);
});

test("backoff é exponencial e tem teto", () => {
	assert.equal(getIfoodBackoffMs(1), 1000);
	assert.equal(getIfoodBackoffMs(2), 2000);
	assert.equal(getIfoodBackoffMs(3), 4000);
	assert.equal(getIfoodBackoffMs(50), 30_000);
});
