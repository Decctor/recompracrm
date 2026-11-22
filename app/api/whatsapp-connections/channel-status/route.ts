import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { getWhatsappChannelStatus } from "@/lib/whatsapp/channel-status";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

// Os cinco passos do canal de cada número oficial (lib/whatsapp/channel-status.ts), mais o
// WhatsApp de quem pergunta, sugerido como destino da mensagem de teste.

async function getWhatsappChannelStatusService({ session }: { session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	const status = await getWhatsappChannelStatus({ organizationId });
	return { data: { ...status, destinoSugerido: session.user.telefone || null }, message: "Canal do WhatsApp consultado." };
}
export type TGetWhatsappChannelStatusOutput = Awaited<ReturnType<typeof getWhatsappChannelStatusService>>;

async function getWhatsappChannelStatusRoute() {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	return NextResponse.json(await getWhatsappChannelStatusService({ session }));
}

export const GET = appApiHandler({ GET: getWhatsappChannelStatusRoute });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
