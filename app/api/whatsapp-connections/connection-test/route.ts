import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { refreshWhatsappConnectionTest, sendWhatsappConnectionTest } from "@/lib/whatsapp/connection-test";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Mensagem de teste da conexão (lib/whatsapp/connection-test.ts). GET consulta a aprovação do
// modelo de teste na Meta; POST manda o teste para o WhatsApp de quem conectou.

const GetWhatsappConnectionTestInputSchema = z.object({
	telefoneId: z
		.string({ required_error: "Telefone não informado.", invalid_type_error: "Tipo inválido para o telefone." })
		.min(1, "Telefone não informado."),
});
export type TGetWhatsappConnectionTestInput = z.infer<typeof GetWhatsappConnectionTestInputSchema>;

const SendWhatsappConnectionTestInputSchema = z.object({
	telefoneId: z
		.string({ required_error: "Telefone não informado.", invalid_type_error: "Tipo inválido para o telefone." })
		.min(1, "Telefone não informado."),
	destino: z
		.string({ required_error: "WhatsApp de destino não informado.", invalid_type_error: "Tipo inválido para o WhatsApp de destino." })
		.min(10, "Informe o WhatsApp com DDD."),
});
export type TSendWhatsappConnectionTestInput = z.infer<typeof SendWhatsappConnectionTestInputSchema>;

function organizationOf(session: TAuthUserSession) {
	const organizationId = session.membership?.organizacao.id;
	if (!organizationId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");
	return organizationId;
}

async function getWhatsappConnectionTest({ input, session }: { input: TGetWhatsappConnectionTestInput; session: TAuthUserSession }) {
	const teste = await refreshWhatsappConnectionTest({ organizationId: organizationOf(session), phoneId: input.telefoneId });
	return { data: { teste }, message: "Teste de conexão consultado." };
}
export type TGetWhatsappConnectionTestOutput = Awaited<ReturnType<typeof getWhatsappConnectionTest>>;

async function sendWhatsappConnectionTestService({ input, session }: { input: TSendWhatsappConnectionTestInput; session: TAuthUserSession }) {
	const teste = await sendWhatsappConnectionTest({ organizationId: organizationOf(session), phoneId: input.telefoneId, destino: input.destino });
	return {
		data: { teste },
		message:
			teste.status === "ENVIADO"
				? `Teste enviado para ${teste.destino}. Confira o seu WhatsApp.`
				: teste.status === "RECUSADO_PAGAMENTO"
					? "A Meta recusou o envio por falta de forma de pagamento na conta do WhatsApp Business."
					: "A Meta não aceitou o envio do teste.",
	};
}
export type TSendWhatsappConnectionTestOutput = Awaited<ReturnType<typeof sendWhatsappConnectionTestService>>;

async function getWhatsappConnectionTestRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = GetWhatsappConnectionTestInputSchema.parse({ telefoneId: request.nextUrl.searchParams.get("telefoneId") });
	return NextResponse.json(await getWhatsappConnectionTest({ input, session }));
}

async function sendWhatsappConnectionTestRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	const input = SendWhatsappConnectionTestInputSchema.parse(await request.json());
	return NextResponse.json(await sendWhatsappConnectionTestService({ input, session }));
}

export const GET = appApiHandler({ GET: getWhatsappConnectionTestRoute });
export const POST = appApiHandler({ POST: sendWhatsappConnectionTestRoute });

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
