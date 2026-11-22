import { appApiHandler } from "@/lib/app-api";
import { FacebookOAuth } from "@/lib/authentication/oauth";
import { persistOAuthRedirect } from "@/lib/integrations/oauth-redirect";
import * as arctic from "arctic";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const WHATSAPP_OAUTH_REDIRECT_COOKIE_NAME = "whatsapp_oauth_redirect";
/** `state` desta tentativa: a volta só é aceita se trouxer o mesmo valor (proteção contra CSRF e abas trocadas). */
export const WHATSAPP_OAUTH_STATE_COOKIE_NAME = "whatsapp_oauth_state";

async function getArcticWhatsappRoute(req: NextRequest) {
	const cookieStore = await cookies();
	persistOAuthRedirect(cookieStore, WHATSAPP_OAUTH_REDIRECT_COOKIE_NAME, req.nextUrl.searchParams.get("redirectTo"));

	const state = arctic.generateState();
	cookieStore.set(WHATSAPP_OAUTH_STATE_COOKIE_NAME, state, {
		httpOnly: true,
		path: "/",
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		// O fluxo da Meta leva uns minutos com o celular na mão; 30 min cobre quem vai e volta.
		maxAge: 60 * 30,
	});
	const scopes = ["whatsapp_business_management", "whatsapp_business_messaging"];
	const url = FacebookOAuth.createAuthorizationURL(state, scopes);

	// Embedded Signup no modo coexistência: o número continua no app WhatsApp Business do celular.
	url.searchParams.set("config_id", process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID as string);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("override_default_response_type", "true");
	url.searchParams.set(
		"extras",
		JSON.stringify({
			setup: {},
			featureType: "whatsapp_business_app_onboarding",
			sessionInfoVersion: "3",
		}),
	);
	const finalUrl = url.toString().replace("v16.0", "v25.0");
	return NextResponse.redirect(finalUrl);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = appApiHandler({
	GET: getArcticWhatsappRoute,
});
