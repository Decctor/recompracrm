import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { clearWhatsappPhoneSendBlock } from "@/lib/campaigns/dispatch/interruption";
import { db } from "@/services/drizzle";
import { whatsappConnectionPhones, whatsappConnections } from "@/services/drizzle/schema";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// "Já resolvi" do alerta de número bloqueado. Sem esta saída o bloqueio trava: ativar campanha é
// barrado enquanto ele existe, retomar exige campanha ativa, e a entrega cobrável que o removeria
// sozinha nunca sai. Se a Meta ainda recusar, o primeiro envio bloqueia o número de novo.
const ClearPhoneSendBlockInputSchema = z.object({
	phoneId: z.string({ required_error: "Telefone não informado.", invalid_type_error: "Tipo inválido para o telefone." }),
});
export type TClearPhoneSendBlockInput = z.infer<typeof ClearPhoneSendBlockInputSchema>;

async function clearPhoneSendBlock({ input, session }: { input: TClearPhoneSendBlockInput; session: TAuthUserSession }) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const [phone] = await db
		.select({ id: whatsappConnectionPhones.id })
		.from(whatsappConnectionPhones)
		.innerJoin(whatsappConnections, eq(whatsappConnections.id, whatsappConnectionPhones.conexaoId))
		.where(and(eq(whatsappConnectionPhones.id, input.phoneId), eq(whatsappConnections.organizacaoId, organizationId)))
		.limit(1);
	if (!phone) throw new createHttpError.NotFound("Telefone não encontrado nesta organização.");

	const cleared = await clearWhatsappPhoneSendBlock({ phoneId: phone.id });
	return {
		data: { cleared },
		message: cleared ? "Bloqueio removido. Ative a campanha e retome o disparo interrompido." : "Este número não está bloqueado para envios.",
	};
}
export type TClearPhoneSendBlockOutput = Awaited<ReturnType<typeof clearPhoneSendBlock>>;

async function clearPhoneSendBlockRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você precisa estar autenticado para acessar esse recurso.");
	const input = ClearPhoneSendBlockInputSchema.parse({ phoneId: request.nextUrl.searchParams.get("phoneId") });
	const result = await clearPhoneSendBlock({ input, session });
	return NextResponse.json(result);
}

export const DELETE = appApiHandler({ DELETE: clearPhoneSendBlockRoute });
