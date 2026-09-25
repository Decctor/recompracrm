import { appApiHandler } from "@/lib/app-api";
import { getCurrentSessionUncached } from "@/lib/authentication/session";
import type { TAuthUserSession } from "@/lib/authentication/types";
import { db } from "@/services/drizzle";
import { cancelScheduledFollowUpsForChats } from "@/lib/ai/agent/follow-up-cancel";
import { AI_AGENT_FOLLOW_UP_CANCEL_REASONS } from "@/schemas/ai-agents";
import { chats, clients } from "@/services/drizzle/schema";
import dayjs from "dayjs";
import { and, eq } from "drizzle-orm";
import createHttpError from "http-errors";
import { type NextRequest, NextResponse } from "next/server";
import z from "zod";

// Duração padrão da pausa quando o cliente pede "não me chame por enquanto".
const DEFAULT_PAUSE_DAYS = 90;

const UpdateCommunicationPauseInputSchema = z.object({
	clienteId: z.string({
		required_error: "ID do cliente não informado.",
		invalid_type_error: "Tipo inválido para o ID do cliente.",
	}),
	// null = retomar comunicação; omitido = pausa padrão de 90 dias.
	pausadaAte: z
		.string({ invalid_type_error: "Tipo inválido para a data da pausa." })
		.datetime({ message: "Tipo inválido para a data da pausa." })
		.transform((val) => new Date(val))
		.optional()
		.nullable(),
	retomar: z.boolean({ invalid_type_error: "Tipo inválido para o indicador de retomada." }).optional().default(false),
});
export type TUpdateCommunicationPauseInput = z.infer<typeof UpdateCommunicationPauseInputSchema>;

async function updateCommunicationPause({ input, session }: { input: TUpdateCommunicationPauseInput; session: TAuthUserSession }) {
	const organizacaoId = session.membership?.organizacao.id;
	if (!organizacaoId) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização para acessar esse recurso.");

	const client = await db.query.clients.findFirst({
		where: and(eq(clients.id, input.clienteId), eq(clients.organizacaoId, organizacaoId)),
		columns: { id: true, nome: true },
	});
	if (!client) throw new createHttpError.NotFound("Cliente não encontrado.");

	const pausadaAte = input.retomar ? null : (input.pausadaAte ?? dayjs().add(DEFAULT_PAUSE_DAYS, "day").endOf("day").toDate());
	if (pausadaAte && dayjs(pausadaAte).isBefore(dayjs())) {
		throw new createHttpError.BadRequest("A data da pausa precisa ser futura.");
	}

	await db
		.update(clients)
		.set({ comunicacaoPausadaAte: pausadaAte })
		.where(and(eq(clients.id, input.clienteId), eq(clients.organizacaoId, organizacaoId)));

	// Pausa vale para a IA também: retomadas agendadas nas conversas deste cliente morrem aqui.
	if (pausadaAte) {
		const clientChats = await db.query.chats.findMany({
			where: and(eq(chats.clienteId, input.clienteId), eq(chats.organizacaoId, organizacaoId)),
			columns: { id: true },
		});
		await cancelScheduledFollowUpsForChats(db, {
			chatIds: clientChats.map((chat) => chat.id),
			motivo: AI_AGENT_FOLLOW_UP_CANCEL_REASONS.COMUNICACAO_PAUSADA,
		});
	}

	return {
		data: { clienteId: client.id, pausadaAte },
		message: pausadaAte
			? `Comunicação com ${client.nome} pausada até ${dayjs(pausadaAte).format("DD/MM/YYYY")} — campanhas também não vão abordar.`
			: `Comunicação com ${client.nome} retomada.`,
	};
}
export type TUpdateCommunicationPauseOutput = Awaited<ReturnType<typeof updateCommunicationPause>>;

async function updateCommunicationPauseRoute(request: NextRequest) {
	const session = await getCurrentSessionUncached();
	if (!session) throw new createHttpError.Unauthorized("Você não está autenticado.");
	if (!session.membership) throw new createHttpError.Unauthorized("Você precisa estar vinculado a uma organização.");

	const body = await request.json();
	const input = UpdateCommunicationPauseInputSchema.parse(body);
	const result = await updateCommunicationPause({ input, session });
	return NextResponse.json(result, { status: 200 });
}

export const PATCH = appApiHandler({ PATCH: updateCommunicationPauseRoute });
