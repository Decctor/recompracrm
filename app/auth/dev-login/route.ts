import { appApiHandler } from "@/lib/app-api";
import { setSetSessionCookie, validateSession } from "@/lib/authentication/session";
import { assertLocalDatabase, isLocalDevMode } from "@/lib/local-dev/guard";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

/**
 * Local development only: turns a session token into the session cookie.
 *
 * The route grants nothing by itself. The token must ALREADY be a valid session row in the local
 * database (`npm run local:login` creates one), so all this does is spare the browser — or an
 * agent driving one — from setting an httpOnly cookie by hand. Outside local mode it does not
 * exist: 404, before reading anything.
 */
const DevLoginInputSchema = z.object({
	token: z.string({ required_error: "Token não informado.", invalid_type_error: "Tipo inválido para token." }).min(1, "Token não informado."),
	next: z
		.string({ invalid_type_error: "Tipo inválido para destino." })
		.optional()
		.nullable()
		// Same-origin paths only.
		.transform((value) => (value && /^\/(?![/\\])/.test(value) ? value : "/dashboard")),
});
export type TDevLoginInput = z.infer<typeof DevLoginInputSchema>;

function notFound() {
	return new NextResponse(null, { status: 404 });
}

async function devLoginRoute(request: NextRequest) {
	if (!isLocalDevMode()) return notFound();
	assertLocalDatabase();

	const parsed = DevLoginInputSchema.safeParse({
		token: request.nextUrl.searchParams.get("token"),
		next: request.nextUrl.searchParams.get("next"),
	});
	if (!parsed.success) return notFound();

	const session = await validateSession(parsed.data.token);
	if (!session) return notFound();

	await setSetSessionCookie({ token: parsed.data.token, expiresAt: session.session.dataExpiracao });
	return NextResponse.redirect(new URL(parsed.data.next, request.nextUrl.origin));
}

export const GET = appApiHandler({ GET: devLoginRoute });
