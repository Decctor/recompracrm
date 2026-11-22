import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { notifyControlWhatsappAssistRequested } from "@/lib/control/notices";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// "Quero ajuda para conectar": vira um evento no Syncroniza Control, e o workflow de conexão
// assistida cria a tarefa para o time chamar a loja. Sem o Control configurado (preview, dev),
// o pedido não chega a ninguém — a resposta diz isso em vez de prometer um contato.
const RequestWhatsappAssistInputSchema = z.object({});
export type TRequestWhatsappAssistInput = z.infer<typeof RequestWhatsappAssistInputSchema>;

async function requestWhatsappAssist({ session }: { input: TRequestWhatsappAssistInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para pedir ajuda.");

	const enviado = await notifyControlWhatsappAssistRequested({ organizationId: organizacaoId, usuarioNome: session.user.nome ?? null });
	try {
		await captureServerEvent({
			distinctId: session.user.id,
			event: "whatsapp_assist_requested",
			properties: { organization_id: organizacaoId, delivered: enviado },
		});
	} catch (error) {
		console.error("[WARN] [ONBOARDING_WHATSAPP_ASSIST] Falha ao capturar evento:", error);
	}

	return {
		data: { enviado },
		message: enviado
			? "Pedido recebido. Vamos te chamar em até 1 dia útil para conectar juntos."
			: "Não conseguimos registrar o pedido agora. Fale com a gente pelo suporte.",
	};
}
export type TRequestWhatsappAssistOutput = Awaited<ReturnType<typeof requestWhatsappAssist>>;

async function requestWhatsappAssistRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = RequestWhatsappAssistInputSchema.parse(await request.json().catch(() => ({})));
	return NextResponse.json(await requestWhatsappAssist({ input, session }));
}

export const POST = appApiHandler({ POST: requestWhatsappAssistRoute });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
