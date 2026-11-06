import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import test from "node:test";
import { REALTIME_JWT_TTL_SECONDS, signSupabaseRealtimeJwt, supabaseIssuer } from "./realtime-jwt";

const SECRET = "test-jwt-secret";
const NOW_MS = Date.UTC(2026, 9, 31, 12, 0, 0);

function decodePart(part: string) {
	return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

function signatureMatches(token: string, secret: string) {
	const [header, payload, signature] = token.split(".");
	const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
	const actualBytes = Buffer.from(signature);
	const expectedBytes = Buffer.from(expected);
	return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

test("emite JWT HS256 com a organização em app_metadata", () => {
	const minted = signSupabaseRealtimeJwt({
		secret: SECRET,
		supabaseUrl: "https://example.supabase.co/",
		userId: "user-1",
		sessionId: "session-1",
		organizacaoId: "org-1",
		nowMs: NOW_MS,
	});
	const [headerPart, payloadPart] = minted.token.split(".");
	const header = decodePart(headerPart);
	const payload = decodePart(payloadPart);

	assert.equal(header.alg, "HS256");
	assert.equal(header.typ, "JWT");
	assert.equal(payload.role, "authenticated");
	assert.equal(payload.aud, "authenticated");
	assert.equal(payload.iss, "https://example.supabase.co/auth/v1");
	assert.equal(payload.sub, "user-1");
	assert.deepEqual(payload.app_metadata, { organizacao_id: "org-1" });
	assert.equal("user_metadata" in payload, false);
	assert.equal("session_id" in payload, false);
	assert.equal(payload.exp, Math.floor(NOW_MS / 1000) + REALTIME_JWT_TTL_SECONDS);
	assert.equal(minted.expiresAt, new Date((payload.exp as number) * 1000).toISOString());
	assert.equal(signatureMatches(minted.token, SECRET), true);
	assert.equal(signatureMatches(minted.token, "outro-secret"), false);
});

test("issuer ignora path e barra final", () => {
	assert.equal(supabaseIssuer("https://example.supabase.co/"), "https://example.supabase.co/auth/v1");
	assert.equal(supabaseIssuer("https://example.supabase.co"), "https://example.supabase.co/auth/v1");
});

test("recusa organização vazia", () => {
	assert.throws(
		() =>
			signSupabaseRealtimeJwt({
				secret: SECRET,
				supabaseUrl: "https://example.supabase.co",
				userId: "user-1",
				sessionId: "session-1",
				organizacaoId: "",
			}),
		/Organização ativa ausente/,
	);
});
