import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { signSupabaseRealtimeJwt } from "@/lib/supabase/realtime-jwt";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

async function createRealtimeToken({ session }: { session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id ?? null;
	if (!organizacaoId || session.session.organizacaoAtivaId !== organizacaoId) {
		throw new createHttpError.Forbidden("Você precisa de uma organização ativa para receber atualizações.");
	}

	const secret = process.env.SUPABASE_JWT_SECRET;
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	if (!secret || !supabaseUrl) {
		throw new Error("SUPABASE_JWT_SECRET ou NEXT_PUBLIC_SUPABASE_URL não configurado.");
	}

	// A organização sai da sessão Lucia. O cliente não escolhe o claim.
	const minted = signSupabaseRealtimeJwt({
		secret,
		supabaseUrl,
		userId: session.user.id,
		sessionId: session.session.id,
		organizacaoId,
	});

	return {
		data: {
			token: minted.token,
			expiresAt: minted.expiresAt,
			organizacaoId,
		},
		message: "Token de realtime emitido.",
	};
}

export type TCreateRealtimeTokenOutput = Awaited<ReturnType<typeof createRealtimeToken>>;

async function createRealtimeTokenRoute() {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const result = await createRealtimeToken({ session });
	return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = appApiHandler({ GET: createRealtimeTokenRoute });
