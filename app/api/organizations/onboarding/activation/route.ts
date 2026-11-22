import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getOrganizationActivation } from "@/lib/onboarding/activation-status";
import { db } from "@/services/drizzle";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Ativação por segmento: a escada de marcos da organização, a próxima ação e se a superfície do
 * hub aparece. Regras em lib/onboarding/activation.ts; desenho em
 * docs/onboarding/activation-by-segment.md.
 */

async function getActivation({ session }: { session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");
	const activation = await getOrganizationActivation({ executor: db, organizationId: organizacaoId });
	return { data: activation, message: "Ativação calculada." };
}
export type TGetOnboardingActivationOutput = Awaited<ReturnType<typeof getActivation>>;

async function getActivationRoute(_request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const result = await getActivation({ session });
	return NextResponse.json(result);
}

export const GET = appApiHandler({ GET: getActivationRoute });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
