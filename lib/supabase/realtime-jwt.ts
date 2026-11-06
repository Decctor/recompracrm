import { createHmac } from "node:crypto";
import { REALTIME_JWT_TTL_SECONDS } from "./realtime-jwt-constants";

export { REALTIME_JWT_REFRESH_SKEW_MS, REALTIME_JWT_TTL_SECONDS } from "./realtime-jwt-constants";

export type TRealtimeJwtClaims = {
	aud: "authenticated";
	role: "authenticated";
	iss: string;
	sub: string;
	iat: number;
	exp: number;
	app_metadata: {
		organizacao_id: string;
	};
};

type SignSupabaseRealtimeJwtParams = {
	secret: string;
	supabaseUrl: string;
	userId: string;
	sessionId: string;
	organizacaoId: string;
	nowMs?: number;
};

/**
 * HS256 JWT accepted by this project's Supabase Realtime.
 *
 * The public JWKS (`/auth/v1/.well-known/jwks.json`) is empty, so the project still
 * verifies tokens with the legacy shared secret, not an asymmetric signing key.
 * `app_metadata` is the claim RLS reads. `user_metadata` is omitted: Supabase treats
 * that object as client-writable, and the organization must not live there.
 * The Lucia session id is not copied into the token: it is a sha256 hex, and Supabase
 * reserves `session_id` for an auth.users uuid. The tie is the route, which only signs
 * a token after `getCurrentSessionUncached` accepts the cookie. Revocation waits for `exp`.
 */
export function signSupabaseRealtimeJwt({
	secret,
	supabaseUrl,
	userId,
	sessionId,
	organizacaoId,
	nowMs = Date.now(),
}: SignSupabaseRealtimeJwtParams) {
	if (!secret) throw new Error("SUPABASE_JWT_SECRET não configurado.");
	if (!organizacaoId) throw new Error("Organização ativa ausente.");
	if (!userId || !sessionId) throw new Error("Sessão ausente.");

	const issuedAt = Math.floor(nowMs / 1000);
	const claims: TRealtimeJwtClaims = {
		aud: "authenticated",
		role: "authenticated",
		iss: supabaseIssuer(supabaseUrl),
		sub: userId,
		iat: issuedAt,
		exp: issuedAt + REALTIME_JWT_TTL_SECONDS,
		app_metadata: { organizacao_id: organizacaoId },
	};
	const signingInput = `${encodeJson({ alg: "HS256", typ: "JWT" })}.${encodeJson(claims)}`;
	const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");
	return {
		token: `${signingInput}.${signature}`,
		expiresAt: new Date(claims.exp * 1000).toISOString(),
		claims,
	};
}

export function supabaseIssuer(supabaseUrl: string) {
	const url = new URL(supabaseUrl);
	return `${url.origin}/auth/v1`;
}

function encodeJson(value: unknown) {
	return Buffer.from(JSON.stringify(value)).toString("base64url");
}
